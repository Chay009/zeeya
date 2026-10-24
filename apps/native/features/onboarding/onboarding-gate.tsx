import { Button, Spinner } from "heroui-native";
import { useEffect, useState, type PropsWithChildren } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { completeOnboarding, hasCompletedOnboarding } from "./onboarding-storage";
import { OnboardingScreen } from "./onboarding-screen";

export function OnboardingGate({ children }: PropsWithChildren) {
  const [complete, setComplete] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void hasCompletedOnboarding()
      .then((value) => {
        if (active) setComplete(value);
      })
      .catch(() => {
        if (active)
          setError("Couldn't read setup preferences. Your financial data has not been changed.");
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding();
      setComplete(true);
    } catch {
      setError("Couldn't save setup preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (complete === true) return children;
  if (complete === false)
    return <OnboardingScreen onComplete={finish} saving={saving} saveError={error} />;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      {error ? (
        <>
          <Text accessibilityRole="alert" className="text-body text-negative">
            {error}
          </Text>
          <Button onPress={() => setAttempt(attempt + 1)}>Retry</Button>
        </>
      ) : (
        <Spinner />
      )}
    </View>
  );
}
