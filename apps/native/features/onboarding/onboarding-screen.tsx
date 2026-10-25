import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { MessageArrived } from "@/components/art/message-arrived";
import { AppIcon, type AppIconName } from "@/components/icon";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { IconTile } from "@/components/ui/controls";
import { layout, useThemeColors } from "@/components/ui/theme";
import { headingFontFamily } from "@/lib/fonts";
import { useCapabilities } from "@/features/capabilities/provider";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useDashboardStore } from "@/stores/dashboard-store";

import { OnboardingPreview } from "./onboarding-preview";

const SCREEN_TITLE = {
  fontFamily: headingFontFamily("semibold"),
  letterSpacing: -0.5,
} as const;

const PRODUCT = {
  title: "See where your money goes",
  support: "Spending, balances, and bills, in one place.",
} as const;

type AskRowCopy = {
  icon: AppIconName;
  title: string;
  body: string;
};

const ANDROID_ASK = {
  title: "Read your bank messages",
  support: "That's how the month you just saw gets filled in.",
  rows: [
    {
      icon: "rupee-receipt",
      title: "What is read",
      body: "Bank and transaction messages already on this phone.",
    },
    {
      icon: "shield",
      title: "What stays here",
      body: "Nothing is uploaded. They're read on this phone and saved in an encrypted database.",
    },
    {
      icon: "chart",
      title: "What you get",
      body: "Balances, spending, and bills.",
    },
  ],
} as const satisfies { title: string; support: string; rows: readonly AskRowCopy[] };

const IOS_ASK = {
  title: "Share a bank message",
  support: "iOS can't read your inbox, so you add messages yourself.",
  rows: [
    {
      icon: "file",
      title: "Share a message",
      body: "From Messages, share a bank text with Zeeya.",
    },
    {
      icon: "flash",
      title: "Or use a Shortcut",
      body: "In Settings, a Shortcut can send new bank messages to Zeeya.",
    },
    {
      icon: "chart",
      title: "What you get",
      body: "Balances, spending, and bills from the messages you add.",
    },
  ],
} as const satisfies { title: string; support: string; rows: readonly AskRowCopy[] };

function StepDots({ step }: { step: 0 | 1 }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step + 1} of 2`}
      accessibilityValue={{ min: 1, max: 2, now: step + 1 }}
      className="flex-row items-center gap-1.5"
    >
      {[0, 1].map((index) => (
        <View
          key={index}
          className={`h-1 rounded-pill ${index === step ? "w-6 bg-ink" : "w-3 bg-fill-strong"}`}
        />
      ))}
    </View>
  );
}

function BackControl({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      className={`absolute left-0 h-11 flex-row items-center gap-0.5 ${disabled ? "opacity-40" : ""}`}
    >
      <AppIcon name="chevron-left" size={18} color={colors.ink} />
      <Text className="text-caption font-medium text-ink">Back</Text>
    </Pressable>
  );
}

function AskRows({ rows }: { rows: readonly AskRowCopy[] }) {
  const colors = useThemeColors();
  return (
    <View className="gap-4">
      {rows.map((row) => (
        <View key={row.title} className="flex-row items-start gap-3">
          <IconTile icon={row.icon} color={colors.ink} background={colors.fill} />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-semibold text-ink">{row.title}</Text>
            <Text className="mt-0.5 text-caption text-muted">{row.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function OnboardingScreen({
  onComplete,
  saving,
  saveError,
}: {
  onComplete: () => Promise<void>;
  saving: boolean;
  saveError: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);
  const { error: permissionError } = useCapabilities();
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
  const android = Platform.OS === "android";
  const ask = android ? ANDROID_ASK : IOS_ASK;
  const copy = step === 0 ? PRODUCT : ask;

  async function connectInbox() {
    if (busy) return;
    await connect();
    if (useDashboardStore.getState().status === "ready") await onComplete();
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      <View className="h-11 justify-center" style={{ paddingHorizontal: layout.gutter }}>
        <View className="items-center">
          <StepDots step={step} />
        </View>
        {step === 1 ? <BackControl disabled={busy} onPress={() => setStep(0)} /> : null}
      </View>

      <ScrollView
        key={step}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: 28,
          paddingBottom: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <EnterTransition>
          <View className="gap-6">
            <View className="gap-2">
              <Text className="text-caption font-medium text-muted">Zeeya</Text>
              <Text
                accessibilityRole="header"
                className="text-screen font-semibold text-ink"
                style={SCREEN_TITLE}
              >
                {copy.title}
              </Text>
              <Text className="text-body text-muted">{copy.support}</Text>
            </View>
            {step === 0 ? (
              <OnboardingPreview />
            ) : (
              <View className="gap-6">
                <View className="items-center">
                  <MessageArrived size={112} />
                </View>
                <AskRows rows={ask.rows} />
              </View>
            )}
          </View>
        </EnterTransition>
      </ScrollView>

      <View
        className="gap-3 pt-2"
        style={{ paddingHorizontal: layout.gutter, paddingBottom: insets.bottom + 16 }}
      >
        {saveError ? (
          <Text accessibilityRole="alert" className="text-caption text-negative">
            {saveError}
          </Text>
        ) : null}

        {step === 0 ? (
          <Button onPress={() => setStep(1)}>
            <Button.Label>Continue</Button.Label>
          </Button>
        ) : android ? (
          <>
            {status === "loading" ? (
              <View className="flex-row items-center gap-3">
                <Spinner />
                <Text accessibilityLiveRegion="polite" className="flex-1 text-caption text-muted">
                  {progress ? `${progress.inserted} messages added` : "Connecting your inbox…"}
                </Text>
              </View>
            ) : null}
            {syncError || permissionError ? (
              <Text accessibilityRole="alert" className="text-caption text-negative">
                {syncError || permissionError}
              </Text>
            ) : null}
            <Button isDisabled={busy} onPress={() => void connectInbox()}>
              <Button.Label>Allow SMS and open Zeeya</Button.Label>
            </Button>
            <Text className="text-center text-caption text-muted">
              Without SMS, Zeeya starts empty. You can import later from Settings, or by sharing a
              message.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={() => void onComplete()}
              className="min-h-11 items-center justify-center"
            >
              <Text className={`text-body font-semibold ${saving ? "text-faint" : "text-muted"}`}>
                {saving ? "Saving…" : "Not now"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {syncError || permissionError ? (
              <Text accessibilityRole="alert" className="text-caption text-negative">
                {syncError || permissionError}
              </Text>
            ) : null}
            <Text className="text-center text-caption text-muted">
              Zeeya starts empty until you share a message or set up the Shortcut.
            </Text>
            <Button isDisabled={saving} onPress={() => void onComplete()}>
              <Button.Label>{saving ? "Saving…" : "Open Zeeya"}</Button.Label>
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
