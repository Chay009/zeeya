import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { TransactionDetail } from "@/features/home-preview/components/transaction-detail";
import { createHomePreviewData } from "@/features/home-preview/data";

function DeveloperOnlyNotice({ topInset }: { topInset: number }) {
  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingTop: topInset }}
    >
      <Text className="text-center text-base font-bold text-ink">Developer route only</Text>
      <Text className="mt-2 text-center text-caption text-muted">
        Product navigation uses the SQL-backed transaction detail screen instead.
      </Text>
    </View>
  );
}

function LegacyTransactionParserDumpBody({
  id,
  topInset,
}: {
  id: string;
  topInset: number;
}) {
  const router = useRouter();
  const { dashboard, status } = useDashboardSync();
  const homeData = useMemo(
    () => createHomePreviewData(dashboard, status === "ready"),
    [dashboard, status],
  );
  const item = homeData.activity.allItems.find((candidate) => candidate.key === id);

  if (!item) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: topInset }}
      >
        <Text className="text-center text-base font-bold text-ink">Transaction not found</Text>
        <Text className="mt-2 text-center text-caption text-muted">
          It may have been removed since this screen was opened.
        </Text>
      </View>
    );
  }

  return <TransactionDetail item={item} onBack={() => router.back()} topInset={topInset} />;
}

export default function LegacyTransactionParserDumpRoute() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!__DEV__) {
    return <DeveloperOnlyNotice topInset={insets.top} />;
  }

  return <LegacyTransactionParserDumpBody id={id ?? ""} topInset={insets.top} />;
}
