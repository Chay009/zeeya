// Lightweight product detail route for non-financial activity rows
// (travel/delivery/OTP/event/offer/etc.) — backed by
// FinanceDataSource.activity.get. For a financial message that also has a
// transactions row, the caller should use detailTarget.kind === "transaction"
// to route to app/transaction-detail/[id] instead, which reads from the
// transactions table (activity rows for those messages may exist too but
// carry a null transactionId per lib/dashboard-data.ts's own comment).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";

import { useDetail } from "@/features/home-preview/hooks/use-detail";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import {
  productDetailSections,
  activityDetailHeader,
  ProductDetail,
  ProductDetailLoading,
} from "@/features/home-preview/components/product-detail";
import type { ActivityDetail } from "@/lib/dashboard-data";

export default function ActivityDetailRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetch = useCallback((fetchedId: string) => financeDataSource.activity.get(fetchedId), []);
  const { status, value: detail, error } = useDetail<ActivityDetail>(id, fetch, "activity");

  if (status === "loading") {
    return <ProductDetailLoading topInset={insets.top} />;
  }
  if (status === "not-found") {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Activity not found</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft">
          It may have been removed since this screen was opened.
        </Text>
      </View>
    );
  }
  if (status === "error" || detail === null) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Couldn't load this activity</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft" numberOfLines={3}>
          {error ?? "Try going back and reopening the row."}
        </Text>
      </View>
    );
  }

  return (
    <ProductDetail
      eyebrow="Activity"
      header={activityDetailHeader(detail)}
      sections={productDetailSections(detail)}
      onBack={() => router.back()}
      topInset={insets.top}
    />
  );
}
