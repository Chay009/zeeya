import { Pressable } from "react-native";

import { AppText as Text } from "@/components/app-text";

export function AnalyticsSheetOutlineCta({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mt-4 min-h-11 items-center justify-center rounded-pill border-2 border-accent bg-card"
    >
      <Text className="text-caption font-extrabold text-accent-deep">{label}</Text>
    </Pressable>
  );
}

export function AnalyticsSheetFilledCta({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mt-4 min-h-11 items-center justify-center rounded-pill bg-accent"
    >
      <Text className="text-caption font-extrabold text-on-accent">{label}</Text>
    </Pressable>
  );
}
