import { View } from "react-native";

import { GhostLine } from "./home-highlights/shared";

// Mirrors the current Home tree: greeting + balance, account chips, today,
// this-week cashflow, due/subscriptions pair, then budget + activity.
export function HomeSkeleton() {
  return (
    <View className="mt-3 gap-3">
      <View className="gap-2">
        <GhostLine width={112} height={16} />
        <GhostLine width={192} height={36} />
        <GhostLine width={96} height={12} />
        <GhostLine width={160} height={32} />
        <GhostLine width={128} height={12} />
      </View>

      <View className="flex-row gap-2">
        <View className="h-14 w-20 rounded-tile bg-fill-strong" />
        <View className="h-14 w-36 rounded-tile bg-fill-strong" />
        <View className="h-14 w-36 rounded-tile bg-fill-strong" />
      </View>

      <View className="gap-3">
        <View className="h-28 w-full rounded-card bg-fill-strong" />
        <View className="h-[280px] w-full rounded-card bg-fill-strong" />
        <View className="flex-row gap-3">
          <View className="h-[132px] flex-1 rounded-card bg-fill-strong" />
          <View className="h-[132px] flex-1 rounded-card bg-fill-strong" />
        </View>
      </View>
      <View className="h-[200px] w-full rounded-card bg-fill-strong" />
      <View className="h-[220px] w-full rounded-card bg-fill-strong" />
    </View>
  );
}
