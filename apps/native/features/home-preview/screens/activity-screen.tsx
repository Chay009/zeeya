import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
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
  const accountSelectionInitialized = useRef(false);
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

  useEffect(() => {
    if (activityAccounts.length === 0) {
      setSelectedAccountKey("all");
      return;
    }
    setSelectedAccountKey((current) => {
      if (!accountSelectionInitialized.current) {
        accountSelectionInitialized.current = true;
        return activityAccounts[0]!.key;
      }
      if (current === "all" || activityAccounts.some((account) => account.key === current)) {
        return current;
      }
      return activityAccounts[0]?.key ?? "all";
    });
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
    return <View className="flex-1 bg-card" style={{ paddingTop: Math.max(12, insets.top) }} />;
  }

  if (activityStatus === "error") {
    return (
      <View
        className="flex-1 items-center justify-center bg-card px-6"
        style={{ paddingTop: Math.max(12, insets.top) }}
      >
        <Text className="text-center text-base font-bold text-ink">Couldn't load transactions</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft" numberOfLines={3}>
          {activityError ?? "Try again in a moment."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={reloadActivity}
          className="mt-4 rounded-pill bg-accent px-4 py-2"
        >
          <Text className="text-caption font-extrabold text-on-accent">Retry</Text>
        </Pressable>
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
