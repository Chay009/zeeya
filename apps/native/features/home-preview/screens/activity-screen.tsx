import { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LargeTitle } from "@/components/ui/header";
import { ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { HOME_ACTIVITY_PERIOD_MAX_LIMIT } from "@/db/queries-home";
import { useHomeRecentActivity } from "@/features/dashboard/hooks/home-recent-activity";
import { useActivityFiltersStore } from "@/stores/activity-filters-store";

import { ALL_ACCOUNTS_KEY, resolveScopedAccountId } from "../account-scope";
import { ActivityList } from "../components/activity-list";
import { buildActivityDetailRoute, homeActivityViewItem, type HomeActivityViewItem } from "../data";
import { useHomeData } from "../hooks/use-home-data";

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { homeData } = useHomeData();
  const [pickedAccountKey, setPickedAccountKey] = useState(ALL_ACCOUNTS_KEY);
  const accounts = homeData.accounts;

  // Derived, not synced by an effect: if the picked account disappears (a
  // resync merged it away), the view falls back to every account.
  const selectedAccountKey = accounts.some((account) => account.key === pickedAccountKey)
    ? pickedAccountKey
    : ALL_ACCOUNTS_KEY;
  const scopedAccountId = resolveScopedAccountId(accounts, selectedAccountKey);

  // The selected month is read in SQL — every transaction in it, not the
  // newest 100 messages filtered here (which left older and busy months
  // incomplete).
  const monthStart = useActivityFiltersStore((state) => state.monthStart);
  const period = useMemo(() => {
    const end = new Date(monthStart);
    end.setMonth(end.getMonth() + 1);
    return { from: monthStart, to: end.getTime(), transactionsOnly: true };
  }, [monthStart]);
  const {
    items: recentActivity,
    status: activityStatus,
    error: activityError,
    reload: reloadActivity,
  } = useHomeRecentActivity(
    undefined,
    HOME_ACTIVITY_PERIOD_MAX_LIMIT,
    true,
    scopedAccountId,
    period,
  );
  // Full-screen skeleton only before anything has ever loaded; a month or
  // account switch keeps the header and shows row skeletons in the list.
  const [hasLoaded, setHasLoaded] = useState(false);
  if (activityStatus === "ready" && !hasLoaded) setHasLoaded(true);

  const activity = useMemo(() => {
    const items = recentActivity.map(homeActivityViewItem);
    return { ...homeData.activity, allItems: items, items };
  }, [homeData.activity, recentActivity]);

  const openDetail = (item: HomeActivityViewItem) => {
    router.push(buildActivityDetailRoute(item));
  };

  if (!hasLoaded && activityStatus === "loading" && activity.allItems.length === 0) {
    return (
      <View className="flex-1 bg-background px-4">
        <LargeTitle title="Transactions" topInset={insets.top} />
        <View className="mt-6">
          <SkeletonHero />
        </View>
        <View className="mt-6">
          <SkeletonRows count={5} />
        </View>
      </View>
    );
  }

  if (activityStatus === "error") {
    return (
      <View className="flex-1 bg-background px-4">
        <LargeTitle title="Transactions" topInset={insets.top} />
        <View className="flex-1 justify-center pb-24">
          <ErrorState title="Couldn't load transactions" body={activityError} onRetry={reloadActivity} />
        </View>
      </View>
    );
  }

  return (
    <ActivityList
      activity={activity}
      accounts={accounts}
      selectedAccountKey={selectedAccountKey}
      onAccountKeyChange={setPickedAccountKey}
      onSelect={openDetail}
      topInset={insets.top}
      loading={activityStatus === "loading"}
    />
  );
}
