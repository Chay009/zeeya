import { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type CapabilityPreference, useCapabilities } from "@/features/capabilities/provider";
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
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: "#dfe8e2",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#173d30", fontSize: 16, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: "#65776e", fontSize: 13, lineHeight: 19, marginTop: 5 }}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#c8d4cd", true: "#67c7a1" }}
        thumbColor={value ? "#176b4d" : "#f5f7f5"}
      />
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
      style={{ flex: 1, backgroundColor: "#f5fbf7" }}
      contentContainerStyle={{
        padding: 22,
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: 48,
      }}
    >
      <Text style={{ color: "#173d30", fontSize: 28, fontWeight: "800" }}>
        Privacy & automation
      </Text>
      <Text style={{ color: "#65776e", fontSize: 14, lineHeight: 21, marginTop: 8 }}>
        These preferences are stored only on this device. SMS content and biometric results are not
        uploaded.
      </Text>

      {error ? (
        <View style={{ backgroundColor: "#fee4e2", borderRadius: 14, padding: 14, marginTop: 18 }}>
          <Text style={{ color: "#9c2a21", fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: "white",
          borderRadius: 22,
          paddingHorizontal: 18,
          marginTop: 24,
          borderWidth: 1,
          borderColor: "#dfe8e2",
        }}
      >
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
      </View>

      {policy.showsShortcutsSetup ? <ShortcutsSetupCard /> : null}

      {pending ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }}>
          <ActivityIndicator color="#176b4d" />
          <Text style={{ color: "#65776e" }}>Applying setting…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
