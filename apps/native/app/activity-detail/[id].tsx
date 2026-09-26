// Lightweight product detail route for non-financial activity rows
// (travel/delivery/OTP/event/offer/etc.) — backed by
// FinanceDataSource.activity.get. For a financial message that also has a
// transactions row, the caller should use detailTarget.kind === "transaction"
// to route to app/transaction-detail/[id] instead, which reads from the
// transactions table (activity rows for those messages may exist too but
// carry a null transactionId per lib/dashboard-data.ts's own comment).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";


import { useDetail } from "@/features/home-preview/hooks/use-detail";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import {
  productDetailSections,
  activityDetailHeader,
  ProductDetail,
  ProductDetailLoading,
  ProductDetailMessage,
} from "@/features/home-preview/components/product-detail";
import type { ActivityDetail } from "@/lib/dashboard-data";

export default function ActivityDetailRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetch = useCallback((fetchedId: string) => financeDataSource.activity.get(fetchedId), []);
  const { status, value: detail, error } = useDetail<ActivityDetail>(id, fetch, "activity");

  if (status === "loading") {
    return <ProductDetailLoading topInset={insets.top} onBack={() => router.back()} />;
  }
  if (status === "not-found") {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={() => router.back()}
        title="Activity not found"
        body="It may have been removed since this screen was opened."
      />
    );
  }
  if (status === "error" || detail === null) {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={() => router.back()}
        title="Couldn't load this activity"
        body={error ?? "Go back and open it again."}
      />
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
