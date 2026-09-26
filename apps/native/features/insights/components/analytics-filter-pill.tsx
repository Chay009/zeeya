import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

export function AnalyticsFilterPill({
  icon,
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
}: {
  icon: "calendar" | "rupee-receipt";
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-1 flex-row items-center justify-between rounded-pill border border-divider bg-card px-3.5 ${
        disabled ? "opacity-55" : ""
      }`}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <AppIcon name={icon} size={15} color={disabled ? "#a8a8b3" : "#6b6b78"} />
        <Text numberOfLines={1} className="text-caption font-bold text-ink">
          {label}
        </Text>
      </View>
      <AppIcon name="chevron-down" size={14} color="#a8a8b3" />
    </Pressable>
  );
}

export function AnalyticsFilterRow({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View className="flex-row gap-2">{children}</View>;
}
