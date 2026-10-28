// Optional account: Zeeya works fully offline; signing in only links the
// device to a verified Google/Apple identity (see ../sign-in.tsx).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Spinner, Surface, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { authClient } from "@/lib/auth-client";
import {
  getIdToken,
  isCancelled,
  ProviderButtons,
  signOutOfGoogle,
  useOfferedProviders,
  type Provider,
} from "../sign-in";

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
      await signOutOfGoogle();
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
