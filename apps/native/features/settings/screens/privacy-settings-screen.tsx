import { Spinner, Surface, Switch } from "heroui-native";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { type CapabilityPreference, useCapabilities } from "@/features/capabilities/provider";
import { FLOATING_TAB_BAR_CLEARANCE } from "@/features/home-preview/theme";
import { ShortcutsSetupCard } from "@/features/shortcuts/components/shortcuts-setup-card";
import { deviceMessagePolicy } from "@/lib/device-message-policy";

interface PreferenceRowProps {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}

function PreferenceRow({ title, description, value, disabled, onChange }: PreferenceRowProps) {
  return (
    <View className="flex-row gap-4 border-b border-separator py-4">
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
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        padding: 22,
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: 48 + FLOATING_TAB_BAR_CLEARANCE,
      }}
    >
      <Text className="text-screen font-extrabold text-foreground">Privacy & automation</Text>
      <Text className="mt-2 text-body leading-6 text-muted">
        These preferences are stored only on this device. SMS content and biometric results are not
        uploaded.
      </Text>

      {error ? (
        <Surface variant="secondary" className="mt-4 rounded-tile bg-danger/10 p-4">
          <Text className="text-caption text-danger">{error}</Text>
        </Surface>
      ) : null}

      <Surface className="mt-6 rounded-card px-4">
        {policy.showsBackgroundSync ? (
          <PreferenceRow
            title="Periodic background sync"
            description={
              Platform.OS === "android"
                ? "Let Android WorkManager periodically process newly captured messages. SMS read and receive access are required; the OS chooses the exact time and no battery-exemption permission is requested."
                : "Let iOS BGTaskScheduler periodically process newly captured messages. The OS chooses the exact time; no battery-exemption permission is requested."
            }
            value={settings.backgroundSyncEnabled}
            disabled={pending !== null}
            onChange={(value) => void change("backgroundSyncEnabled", value)}
          />
        ) : null}
        <PreferenceRow
          title="Transaction notifications"
          description="Show a privacy-safe local notification only when a newly imported SMS is recognized as financial activity."
          value={settings.transactionNotificationsEnabled}
          disabled={pending !== null}
          onChange={(value) => void change("transactionNotificationsEnabled", value)}
        />
        <PreferenceRow
          title="Biometric app lock"
          description="Require your device PIN, passcode, pattern, password, or biometric unlock when opening or returning to Zeeya."
          value={settings.biometricLockEnabled}
          disabled={pending !== null}
          onChange={(value) => void change("biometricLockEnabled", value)}
        />
        <PreferenceRow
          title="Block screenshots and recording"
          description="Protect financial screens from screenshots, recording, and app-switcher previews."
          value={settings.screenCaptureProtectionEnabled}
          disabled={pending !== null}
          onChange={(value) => void change("screenCaptureProtectionEnabled", value)}
        />
      </Surface>

      {policy.showsShortcutsSetup ? <ShortcutsSetupCard /> : null}

      {pending ? (
        <View className="mt-4 flex-row items-center gap-3">
          <Spinner size="sm" />
          <Text className="text-caption text-muted">Applying setting…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
