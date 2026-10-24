// Optional account: Zeeya works fully offline; signing in only links the
// device to a verified Google/Apple identity. Both buttons are the providers'
// own native buttons (their branding rules), and each hands its ID token to
// Better Auth, which creates the session (or links the provider when already
// signed in).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { env } from "@zeeya/env/native";
import * as AppleAuthentication from "expo-apple-authentication";
import { randomUUID } from "expo-crypto";
import { Avatar, Button, Spinner, Surface, useToast } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Platform, View } from "react-native";
import type * as GoogleSignInModule from "react-native-nitro-google-signin";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { resolveProviderAvailability } from "../provider-availability";
import { configureGoogleSignIn } from "../google-sign-in";

type Provider = "google" | "apple";
type IdToken = NonNullable<Parameters<typeof authClient.signIn.social>[0]["idToken"]>;

const { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: googleWebClientId, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID } =
  env;

// The package creates its native object on import, so an app binary built
// before it was added would crash this screen. Load it guarded: then Google
// sign-in is simply hidden until the next native build.
// iOS refuses to configure Google without its iOS client ID (and the matching
// URL scheme in app.config.ts), so Google only exists when both are set.
const google =
  googleWebClientId && (Platform.OS !== "ios" || EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
    ? configureGoogleSignIn(
        { webClientId: googleWebClientId, iosClientId: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null },
        () => require("react-native-nitro-google-signin") as typeof GoogleSignInModule,
      )
    : null;

const isCancelled = (error: unknown) =>
  (google?.isErrorWithCode(error) && error.code === google.statusCodes.SIGN_IN_CANCELLED) ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_REQUEST_CANCELED");

// The Google button's documented Credential Manager sequence, run by us so
// errors are caught (its built-in handler rethrows into an unhandled promise).
async function googleIdToken(): Promise<IdToken | null> {
  if (!google) return null;
  const { GoogleOneTapSignIn, isNoSavedCredentialFoundResponse, isSuccessResponse } = google;
  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount();
  }
  return isSuccessResponse(response) ? { token: response.data.idToken } : null;
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

const getIdToken: Record<Provider, () => Promise<IdToken | null>> = {
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
function useOfferedProviders() {
  const appleAvailable = useAppleSignInAvailable();
  const query = useQuery(trpc.authProviders.queryOptions());
  const availability = query.data
    ? resolveProviderAvailability({
        platform: Platform.OS,
        googleConfigured: Boolean(googleWebClientId),
        googleNativeReady: google !== null,
        appleNativeReady: appleAvailable,
        server: query.data,
      })
    : { providers: [] as Provider[], reason: null };
  return { ...availability, query };
}

function ProviderButtons({
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
      google ? (
        <google.GoogleSignInButton
          key="google"
          size="wide"
          colorScheme={colors.isDark ? "dark" : "light"}
          disabled={busy}
          signInBehavior="none"
          style={{ width: "100%", height: google.GOOGLE_SIGN_IN_BUTTON_HEIGHT }}
          onPress={() => onPress("google")}
        />
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

export function AccountCard() {
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { toast } = useToast();
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch: refetchSession,
  } = authClient.useSession();
  const {
    providers: offered,
    reason: unavailableReason,
    query: providerQuery,
  } = useOfferedProviders();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const linked = useQuery({
    queryKey: ["auth", "accounts", session?.user.id],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw error;
      return data.map((account) => account.providerId);
    },
    enabled: Boolean(session),
  });

  // One action at a time; busy always clears, and failures other than the
  // user cancelling show a toast.
  const run = async (failure: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await task();
    } catch (error) {
      if (!isCancelled(error)) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : failure;
        setActionError(message);
        toast.show({ variant: "danger", label: failure });
      }
    } finally {
      setBusy(false);
    }
  };

  const signIn = (provider: Provider) =>
    run("Couldn't sign in", async () => {
      const idToken = await getIdToken[provider]();
      if (!idToken) return;
      const { error } = await authClient.signIn.social({ provider, idToken });
      if (error) throw error;
    });

  // Joins a second provider to this account. The only way a Google account and
  // an Apple "Hide My Email" account become one: their emails never match.
  const link = (provider: Provider) =>
    run("Couldn't link the account", async () => {
      const idToken = await getIdToken[provider]();
      if (!idToken) return;
      const { error } = await authClient.linkSocial({ provider, idToken });
      if (error) throw error;
      await linked.refetch();
    });

  const signOut = () =>
    run("Couldn't sign out", async () => {
      const { error } = await authClient.signOut();
      if (error) throw error;
      await google?.GoogleOneTapSignIn.signOut();
    });

  const confirmDeletion = () => {
    Alert.alert(
      "Delete your Zeeya account?",
      "This permanently deletes your cloud identity and linked sign-ins. Financial messages and records on this device are kept. A recent sign-in is required; if asked, sign out and sign in again before retrying.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () =>
            void run("Couldn't delete your account. Sign in again and retry.", async () => {
              const { error } = await authClient.deleteUser();
              if (error) throw error;
              queryClient.removeQueries({ queryKey: ["auth", "accounts"] });
            }),
        },
      ],
    );
  };

  if (isPending && !sessionError) {
    return (
      <Surface variant="secondary" className="mt-6 items-center rounded-tile p-6">
        <Spinner />
        <Text className="mt-2 text-caption text-muted">Checking your account…</Text>
      </Surface>
    );
  }

  if (sessionError && !session) {
    return (
      <Surface variant="secondary" className="mt-6 gap-3 rounded-tile p-4">
        <Text className="text-body font-bold text-foreground">Couldn't check your account</Text>
        <Text accessibilityRole="alert" className="text-caption text-muted">
          {sessionError.message ||
            "Check your connection and try again. Your local finances are still available."}
        </Text>
        <Button variant="tertiary" onPress={() => void refetchSession()}>
          Try again
        </Button>
      </Surface>
    );
  }

  if (session) {
    const { user } = session;
    const linkable = linked.data ? offered.filter((p) => !linked.data.includes(p)) : [];
    return (
      <Surface variant="secondary" className="mt-6 gap-3 rounded-tile p-4">
        <View className="flex-row items-center gap-3">
          <Avatar size="md">
            {user.image ? <Avatar.Image source={{ uri: user.image }} /> : null}
            <Avatar.Fallback>
              <AppIcon name="user" size={22} color={colors.ink} />
            </Avatar.Fallback>
          </Avatar>
          <View className="flex-1">
            <Text className="text-body font-bold text-foreground" numberOfLines={1}>
              {user.name || "Signed in"}
            </Text>
            <Text className="text-caption text-muted" numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <Button variant="tertiary" size="sm" isDisabled={busy} onPress={() => void signOut()}>
            Sign out
          </Button>
        </View>
        {actionError ? (
          <Text accessibilityRole="alert" className="text-caption text-negative">
            {actionError}
          </Text>
        ) : null}
        {linked.isError ? (
          <Button variant="tertiary" onPress={() => void linked.refetch()}>
            Retry linked accounts
          </Button>
        ) : null}
        {linkable.length > 0 ? (
          <>
            <Text className="text-caption text-muted">
              Link another sign-in to use this same account with it.
            </Text>
            <ProviderButtons providers={linkable} busy={busy} onPress={(p) => void link(p)} />
          </>
        ) : null}
        <Button variant="tertiary" isDisabled={busy} onPress={confirmDeletion}>
          <Text className="text-caption text-negative">Delete cloud account</Text>
        </Button>
      </Surface>
    );
  }

  return (
    <Surface variant="secondary" className="mt-6 gap-3 rounded-tile p-4">
      <View>
        <Text className="text-body font-bold text-foreground">Sign in to Zeeya</Text>
        <Text className="mt-1 text-caption text-muted">
          {offered.length > 0
            ? "Optional. Sign in to manage your Zeeya account. Financial data stays on this device; cloud backup is not enabled."
            : providerQuery.isPending
              ? "Checking available sign-in methods…"
              : providerQuery.isError
                ? "Couldn't reach the sign-in service. Your local finances are still available."
                : unavailableReason}
        </Text>
      </View>
      {providerQuery.isError ? (
        <Button variant="tertiary" onPress={() => void providerQuery.refetch()}>
          Retry sign-in service
        </Button>
      ) : null}
      {actionError ? (
        <Text accessibilityRole="alert" className="text-caption text-negative">
          {actionError}
        </Text>
      ) : null}
      <ProviderButtons providers={offered} busy={busy} onPress={(p) => void signIn(p)} />
    </Surface>
  );
}
