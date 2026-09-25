import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { LimeActionPill } from "@/components/native-ui/selected-pill";
import { hp } from "@/features/home-preview/theme";

import { AnalyticsCard } from "./analytics-card";

export function AnalyticsPreviewSection({
  title,
  onSeeAll,
  bare = false,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  bare?: boolean;
  children: React.ReactNode;
}) {
  if (bare) return <View>{children}</View>;

  return (
    <AnalyticsCard>
      <View className="min-h-8 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-base font-bold text-ink">{title}</Text>
        {onSeeAll ? (
          <LimeActionPill accessibilityLabel={`See all ${title}`} onPress={onSeeAll}>
            <Text className="text-caption font-extrabold text-on-accent">See all</Text>
            <AppIcon name="arrow-up-right" size={14} color={hp.onAccent} />
          </LimeActionPill>
        ) : null}
      </View>
      <View className="mt-4">{children}</View>
    </AnalyticsCard>
  );
}
