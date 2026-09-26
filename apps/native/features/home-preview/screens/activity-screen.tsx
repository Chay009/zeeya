import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LargeTitle } from "@/components/ui/header";
import { ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
import { HOME_RECENT_ACTIVITY_MAX_LIMIT } from "@/db/queries-home";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useHomeReadModel } from "@/features/dashboard/hooks/home-read-model";
import { useHomeRecentActivity } from "@/features/dashboard/hooks/home-recent-activity";

import { resolveScopedAccountId } from "../account-scope";
import { ActivityList } from "../components/activity-list";
import {
  buildActivityDetailRoute,
  createHomePreviewDataFromReadModel,
  homeActivityViewItem,
  type HomeActivityViewItem,
} from "../data";

const EMPTY_READ_MODEL = {
  currency: "INR",
  accounts: [],
  detectedAccounts: [],
  unassignedReadings: [],
  monthTotals: { incomeByCurrency: {}, expenseByCurrency: {} },
  categoryTotalsByCurrency: {},
  availableCurrencies: [] as string[],
  flowDays: [],
  calendarMonths: { items: [], nextCursor: null },
  subscriptionOverview: {
    items: [],
    totalsByCurrency: {},
    activeCount: 0,
    cancelledCount: 0,
  },
  recentActivity: [],
  activityCategoryCounts: [],
  totalActivityCount: 0,
};

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status } = useDashboardSync();
  const { model: readModel } = useHomeReadModel("INR");
  const [selectedAccountKey, setSelectedAccountKey] = useState("all");

  const homeData = useMemo(
    () =>
      createHomePreviewDataFromReadModel(
        readModel ?? EMPTY_READ_MODEL,
        status === "ready" && readModel !== null,
      ),
    [readModel, status],
  );

  const activityAccounts = useMemo(() => homeData.accounts, [homeData.accounts]);

  // Default to every account; only fall back to "all" if the chosen account
  // disappears (e.g. after a resync).
  useEffect(() => {
    setSelectedAccountKey((current) =>
      current === "all" || activityAccounts.some((account) => account.key === current) ? current : "all",
    );
  }, [activityAccounts]);

  const scopedAccountId = resolveScopedAccountId(homeData.accounts, selectedAccountKey);
  const {
    items: recentActivity,
    status: activityStatus,
    error: activityError,
    reload: reloadActivity,
  } = useHomeRecentActivity(
    undefined,
    HOME_RECENT_ACTIVITY_MAX_LIMIT,
    true,
    scopedAccountId,
  );

  const activity = useMemo(
    () => ({
      ...homeData.activity,
      allItems: recentActivity.map(homeActivityViewItem),
      items: recentActivity.map(homeActivityViewItem),
    }),
    [homeData.activity, recentActivity],
  );

  const openDetail = (item: HomeActivityViewItem) => {
    router.push(buildActivityDetailRoute(item));
  };

  if (activityStatus === "loading" && activity.allItems.length === 0) {
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
      accounts={activityAccounts}
      selectedAccountKey={selectedAccountKey}
      onAccountKeyChange={setSelectedAccountKey}
      onSelect={openDetail}
      topInset={insets.top}
    />
  );
}
