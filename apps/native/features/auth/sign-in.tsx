// Sign in with Google or Apple, shared by the Profile account card, the
// onboarding sign-in step and the sign-in sheet. Apple's is its own native
// button (its branding rules); Google's is ours, drawn to Google's branding
// guidelines (the "G" mark, "Continue with Google"). Each hands its ID token
// to Better Auth, which creates the session.
import { useQuery } from "@tanstack/react-query";
import { env } from "@zeeya/env/native";
import * as AppleAuthentication from "expo-apple-authentication";
import { randomUUID } from "expo-crypto";
import { PressableFeedback, Spinner } from "heroui-native";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import Svg, { Path } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { resolveProviderAvailability } from "./provider-availability";

export type Provider = "google" | "apple";
type IdToken = NonNullable<Parameters<typeof authClient.signIn.social>[0]["idToken"]>;

const { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: googleWebClientId, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID } =
  env;

// iOS needs its own client ID (and the matching URL scheme in app.config.ts),
// so Google is offered only when the IDs for this platform are set.
const googleEnabled = Boolean(
  googleWebClientId && (Platform.OS !== "ios" || EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
);

// Better Auth's Expo guide: configure once, then hand the ID token to
// authClient.signIn.social.
if (googleEnabled) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    iosClientId: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}

export const isCancelled = (error: unknown) =>
  (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_REQUEST_CANCELED");

async function googleIdToken(): Promise<IdToken | null> {
  if (!googleEnabled) return null;
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  return isSuccessResponse(response) && response.data.idToken
    ? { token: response.data.idToken }
    : null;
}

/** Clears Google's own signed-in account so the next sign-in can pick another. */
export async function signOutOfGoogle(): Promise<void> {
  if (googleEnabled) await GoogleSignin.signOut();
}

async function appleIdToken(): Promise<IdToken | null> {
  // Apple embeds the SHA-256 of this nonce in the token; Better Auth checks it.
  const nonce = randomUUID();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce,
  });
  if (!credential.identityToken) return null;
  // Apple sends the name only on the first sign-in, outside the token.
  const { givenName, familyName } = credential.fullName ?? {};
  return {
    token: credential.identityToken,
    nonce,
    user: { name: { firstName: givenName ?? undefined, lastName: familyName ?? undefined } },
  };
}

export const getIdToken: Record<Provider, () => Promise<IdToken | null>> = {
  google: googleIdToken,
  apple: appleIdToken,
};

function useAppleSignInAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") {
      void AppleAuthentication.isAvailableAsync().then(setAvailable);
    }
  }, []);
  return available;
}

// Providers this device can use AND the server accepts. On iOS, Google is only
// offered alongside Apple (App Store guideline 4.8).
export function useOfferedProviders() {
  const appleAvailable = useAppleSignInAvailable();
  const query = useQuery(trpc.authProviders.queryOptions());
  const availability = query.data
    ? resolveProviderAvailability({
        platform: Platform.OS,
        googleConfigured: Boolean(googleWebClientId),
        googleNativeReady: googleEnabled,
        appleNativeReady: appleAvailable,
        server: query.data,
      })
    : { providers: [] as Provider[], reason: null };
  return { ...availability, query };
}

// Google's multicolour "G", per its sign-in branding guidelines.
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

// Our own button rather than the SDK's embedded one: it renders at native
// resolution, matches the app's type and radius, and shows progress.
function GoogleButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: busy, busy }}
      isDisabled={busy}
      onPress={onPress}
      className="h-12 w-full flex-row items-center justify-center gap-3 rounded-xl bg-card"
      style={{
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.isDark ? withAlpha(colors.ink, 0.2) : withAlpha(colors.ink, 0.12),
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? <Spinner size="sm" /> : <GoogleMark />}
      <Text className="text-body font-semibold text-ink">Continue with Google</Text>
    </PressableFeedback>
  );
}

export function ProviderButtons({
  providers,
  busy,
  onPress,
}: {
  providers: Provider[];
  busy: boolean;
  onPress: (provider: Provider) => void;
}) {
  const colors = useThemeColors();
  return providers.map((provider) =>
    provider === "google" ? (
      googleEnabled ? (
        <GoogleButton key="google" busy={busy} onPress={() => onPress("google")} />
      ) : null
    ) : (
      <AppleAuthentication.AppleAuthenticationButton
        key="apple"
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          colors.isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={{ width: "100%", height: 44 }}
        onPress={() => onPress("apple")}
      />
    ),
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return fallback;
}

/**
 * The sign-in buttons with their own progress and error state, for places
 * that only need "sign in" (onboarding, the sign-in sheet). The session
 * update reaches every `authClient.useSession()` reader on its own.
 */
export function SignInPanel({ onSignedIn }: { onSignedIn?: () => void }) {
  const { providers, reason, query } = useOfferedProviders();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: Provider) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await getIdToken[provider]();
      if (!idToken) return;
      const result = await authClient.signIn.social({ provider, idToken });
      if (result.error) throw result.error;
      onSignedIn?.();
    } catch (cause) {
      if (!isCancelled(cause)) setError(errorMessage(cause, "Couldn't sign in. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const status = query.isPending
    ? "Checking sign-in options…"
    : query.isError
      ? "Couldn't reach the sign-in service. Check your connection."
      : providers.length === 0
        ? reason
        : null;

  return (
    <View className="gap-3">
      <ProviderButtons providers={providers} busy={busy} onPress={(p) => void signIn(p)} />
      {status ? <Text className="text-center text-caption text-muted">{status}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-center text-caption text-negative">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
