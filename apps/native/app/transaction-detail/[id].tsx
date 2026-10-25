// Lightweight product detail route for financial transactions, backed by
// FinanceDataSource.transactions.get (Phase 1B.4 sub-slice 5). Distinct
// from the legacy parser-dump route (app/transaction/[id].tsx) — that one
// renders the full MalanaResult via transactionDetailSections and is
// explicitly dev-only / slated for Phase 1C replacement; this one renders
// only the SQL-allowlisted TransactionDetail fields via productDetailSections.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";


import { EmptyReceipt } from "@/components/art/state-marks";
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import {
  productDetailSections,
  transactionDetailHeader,
  ProductDetail,
  ProductDetailLoading,
  ProductDetailMessage,
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
    return <ProductDetailLoading topInset={insets.top} onBack={() => router.back()} />;
  }
  if (status === "not-found") {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={() => router.back()}
        title="Transaction not found"
        body="It may have been removed since this screen was opened."
        visual={<EmptyReceipt size={96} />}
      />
    );
  }
  if (status === "error" || detail === null) {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={() => router.back()}
        title="Couldn't load this transaction"
        body={error ?? "Go back and open it again."}
      />
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
