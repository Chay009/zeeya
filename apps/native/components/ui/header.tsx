import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { GlassButton } from "@/components/native-ui/glass-button";
import { headingFontFamily } from "@/lib/fonts";

import { useThemeColors } from "./theme";

// Two header shapes, used everywhere:
//   LargeTitle — top of a tab (Home, Transactions, Analytics)
//   NavBar     — a pushed screen (detail pages): back · centred title · action

export function LargeTitle({
  title,
  subtitle,
  right,
  topInset,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  topInset: number;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3" style={{ paddingTop: Math.max(12, topInset) + 12 }}>
      <View className="min-w-0 flex-1">
        {subtitle ? (
          <Text numberOfLines={1} className="text-caption font-medium text-muted">
            {subtitle}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          className="text-screen font-bold tracking-tight text-ink"
          style={{ fontFamily: headingFontFamily("bold"), letterSpacing: -0.8 }}
        >
          {title}
        </Text>
      </View>
      {right ? <View className="mb-1 flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}

export function NavBar({
  title,
  onBack,
  right,
  topInset,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  topInset: number;
}) {
  const colors = useThemeColors();
  return (
    <View className="px-4" style={{ paddingTop: Math.max(8, topInset) }}>
      <View className="min-h-12 flex-row items-center gap-2">
        <View className="w-11">
          {onBack ? (
            <GlassButton
              iconOnly
              accessibilityLabel="Go back"
              onPress={onBack}
              icon={<AppIcon name="chevron-left" size={20} color={colors.ink} />}
            />
          ) : null}
        </View>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-center text-body font-semibold text-ink">
          {title ?? ""}
        </Text>
        <View className="w-11 items-end">{right}</View>
      </View>
    </View>
  );
}
