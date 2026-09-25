// Lightweight product detail route for financial transactions, backed by
// FinanceDataSource.transactions.get (Phase 1B.4 sub-slice 5). Distinct
// from the legacy parser-dump route (app/transaction/[id].tsx) — that one
// renders the full MalanaResult via transactionDetailSections and is
// explicitly dev-only / slated for Phase 1C replacement; this one renders
// only the SQL-allowlisted TransactionDetail fields via productDetailSections.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import {
  productDetailSections,
  transactionDetailHeader,
  ProductDetail,
  ProductDetailLoading,
} from "@/features/home-preview/components/product-detail";
import { useDetail } from "@/features/home-preview/hooks/use-detail";
import type { TransactionDetail } from "@/lib/dashboard-data";

export default function TransactionDetailRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetch = useCallback(
    (fetchedId: string) => financeDataSource.transactions.get(fetchedId),
    [],
  );
  const { status, value: detail, error } = useDetail<TransactionDetail>(id, fetch, "transaction");

  if (status === "loading") {
    return <ProductDetailLoading topInset={insets.top} />;
  }
  if (status === "not-found") {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Transaction not found</Text>
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
        <Text className="text-center text-base font-bold text-ink">Couldn't load this transaction</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft" numberOfLines={3}>
          {error ?? "Try going back and reopening the row."}
        </Text>
      </View>
    );
  }

  return (
    <ProductDetail
      eyebrow="Transaction"
      header={transactionDetailHeader(detail)}
      sections={productDetailSections(detail)}
      onBack={() => router.back()}
      topInset={insets.top}
    />
  );
}
