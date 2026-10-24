import { Button, Spinner, Surface } from "heroui-native";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { AccountCard } from "@/features/auth/components/account-card";
import { useCapabilities } from "@/features/capabilities/provider";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useDashboardStore } from "@/stores/dashboard-store";

const TITLES = [
  "Your money, clearly.",
  "An account is optional.",
  "Choose what to connect.",
] as const;

export function OnboardingScreen({
  onComplete,
  saving,
  saveError,
}: {
  onComplete: () => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const { settings, setPreference, error: permissionError } = useCapabilities();
  const {
    connect,
    status,
    error: syncError,
    progress,
  } = useDashboardSync((state) => ({
    connect: state.connect,
    status: state.status,
    error: state.error,
    progress: state.progress,
  }));
  const busy = saving || status === "loading";

  async function connectInbox() {
    await connect();
    if (useDashboardStore.getState().status === "ready") await onComplete();
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: insets.top + 32,
        paddingBottom: insets.bottom + 24,
        gap: 20,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-bold text-foreground">ZEEYA</Text>
        <Text className="text-caption text-muted">
          {step + 1} of {TITLES.length}
        </Text>
      </View>
      <View className="mt-6 gap-4">
        <AppIcon
          name={step === 2 ? "shield" : step === 1 ? "user" : "chart"}
          size={44}
          color={colors.accent}
        />
        <Text className="text-screen font-extrabold text-foreground">{TITLES[step]}</Text>
      </View>

      {step === 0 ? (
        <>
          <Text className="text-body text-muted">
            Turn financial messages into a clear view of your spending, accounts, subscriptions, and
            daily budget.
          </Text>
          <Surface variant="secondary" className="gap-4 rounded-card p-5">
            <Text className="text-body font-bold text-foreground">Built around your privacy</Text>
            <Text className="text-body text-muted">
              Financial messages are parsed on your phone and saved in an encrypted local database.
              Your SMS content is not uploaded for parsing.
            </Text>
            <Text className="text-body text-muted">
              Explore first. Sign-in, SMS access, and notifications are choices—not requirements to
              open the app.
            </Text>
          </Surface>
        </>
      ) : step === 1 ? (
        <>
          <Text className="text-body text-muted">
            Use an available sign-in provider to manage your Zeeya identity, or continue on this
            device without signing in. Signing in does not enable financial cloud backup.
          </Text>
          <AccountCard />
        </>
      ) : (
        <>
          <Text className="text-body text-muted">
            {Platform.OS === "android"
              ? "With your permission, Zeeya reads financial SMS already on this phone and receives new messages to keep your dashboard current. Processing stays on-device. You can decline and change this later in Settings."
              : "iOS does not allow inbox access. Share a financial message to Zeeya or configure the message-import Shortcut in Settings."}
          </Text>
          <Surface variant="secondary" className="gap-3 rounded-card p-5">
            <Text className="text-body font-bold text-foreground">Optional updates</Text>
            <Text className="text-caption text-muted">
              Notifications show transaction counts, not SMS text or financial amounts.
            </Text>
            <Button
              variant="tertiary"
              isDisabled={settings.transactionNotificationsEnabled || busy}
              onPress={() => void setPreference("transactionNotificationsEnabled", true)}
            >
              {settings.transactionNotificationsEnabled
                ? "Notifications enabled"
                : "Enable notifications"}
            </Button>
            <Text className="text-caption text-muted">
              You can enable background inbox updates separately in Privacy & automation.
            </Text>
          </Surface>
          {status === "loading" ? (
            <View className="flex-row items-center gap-3">
              <Spinner />
              <Text className="text-caption text-muted">
                {progress ? `${progress.inserted} messages added` : "Connecting your inbox…"}
              </Text>
            </View>
          ) : null}
          {syncError || permissionError ? (
            <Text accessibilityRole="alert" className="text-caption text-negative">
              {syncError || permissionError}
            </Text>
          ) : null}
        </>
      )}

      <View className="flex-1" />
      {saveError ? (
        <Text accessibilityRole="alert" className="text-caption text-negative">
          {saveError}
        </Text>
      ) : null}
      {step < 2 ? (
        <Button onPress={() => setStep(step + 1)}>
          {step === 1 ? "Continue to permissions" : "Get started"}
        </Button>
      ) : (
        <>
          {Platform.OS === "android" ? (
            <Button isDisabled={busy} onPress={() => void connectInbox()}>
              Allow SMS and open Zeeya
            </Button>
          ) : null}
          <Button variant="tertiary" isDisabled={saving} onPress={() => void onComplete()}>
            {saving ? "Saving…" : Platform.OS === "android" ? "Continue without SMS" : "Open Zeeya"}
          </Button>
        </>
      )}
      {step > 0 ? (
        <Button variant="tertiary" isDisabled={busy} onPress={() => setStep(step - 1)}>
          Back
        </Button>
      ) : null}
    </ScrollView>
  );
}
