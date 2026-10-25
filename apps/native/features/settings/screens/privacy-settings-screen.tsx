import { useRouter } from "expo-router";
import { Spinner, Surface, Switch } from "heroui-native";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { NavBar } from "@/components/ui/header";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { type CapabilityPreference, useCapabilities } from "@/features/capabilities/provider";
import { ShortcutsSetupCard } from "@/features/shortcuts/components/shortcuts-setup-card";
import { deviceMessagePolicy } from "@/lib/device-message-policy";

import { NativeIntegrationsCard } from "../components/native-integrations-card";

interface PreferenceRowProps {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}

function PreferenceRow({ title, description, value, disabled, onChange }: PreferenceRowProps) {
  return (
    <View className="flex-row gap-4 border-b border-divider py-4">
      <View className="flex-1">
        <Text className="text-body font-bold text-foreground">{title}</Text>
        <Text className="mt-1 text-caption leading-5 text-muted">{description}</Text>
      </View>
      <Switch isSelected={value} isDisabled={disabled} onSelectedChange={onChange} />
    </View>
  );
}

export function PrivacySettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, error, setPreference } = useCapabilities();
  const [pending, setPending] = useState<CapabilityPreference | null>(null);
  const policy = deviceMessagePolicy(
    Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "other",
  );

  const change = async (key: CapabilityPreference, enabled: boolean) => {
    setPending(key);
    await setPreference(key, enabled);
    setPending(null);
  };

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Privacy & automation" onBack={() => router.back()} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: SCREEN_PADDING_X,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Text className="mt-2 text-body text-muted">
          These settings stay on this device and are never uploaded.
        </Text>

        {error ? (
          <Surface variant="secondary" className="mt-4 rounded-tile bg-negative/10 p-4">
            <Text className="text-caption text-negative">{error}</Text>
          </Surface>
        ) : null}

        <Surface className="mt-6 rounded-card px-4">
          {policy.showsBackgroundSync ? (
            <PreferenceRow
              title="Periodic background sync"
              description="Check for new messages in the background, about every 15 minutes."
              value={settings.backgroundSyncEnabled}
              disabled={pending !== null}
              onChange={(value) => void change("backgroundSyncEnabled", value)}
            />
          ) : null}
          <PreferenceRow
            title="Transaction notifications"
            description="Get a heads-up when a new transaction is found. Amounts are never shown."
            value={settings.transactionNotificationsEnabled}
            disabled={pending !== null}
            onChange={(value) => void change("transactionNotificationsEnabled", value)}
          />
          <PreferenceRow
            title="Biometric app lock"
            description="Ask for your fingerprint, face, or device PIN when you open Zeeya."
            value={settings.biometricLockEnabled}
            disabled={pending !== null}
            onChange={(value) => void change("biometricLockEnabled", value)}
          />
          <PreferenceRow
            title="Block screenshots and recording"
            description="Hide Zeeya from screenshots, screen recording, and the app switcher."
            value={settings.screenCaptureProtectionEnabled}
            disabled={pending !== null}
            onChange={(value) => void change("screenCaptureProtectionEnabled", value)}
          />
        </Surface>

        {policy.showsShortcutsSetup ? <ShortcutsSetupCard /> : null}
        <NativeIntegrationsCard />

        {pending ? (
          <View className="mt-4 flex-row items-center gap-3">
            <Spinner size="sm" />
            <Text className="text-caption text-muted">Applying setting…</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
