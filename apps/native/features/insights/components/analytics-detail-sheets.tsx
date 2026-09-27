import { ScrollView } from "react-native";

import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";

import { formatAnalyticsSheetSubtitle } from "../analytics-format";
import {
  categoryTransactionFocus,
  vendorTransactionFocus,
  type AnalyticsTransactionFocus,
} from "../analytics-transaction-focus";
import type { AnalyticsDirection, AnalyticsTab, InsightsTimeScope } from "../analytics-scope";
import type { InsightsPresentation } from "../insights-presentation";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import type { InsightsCategorySlice } from "../insights-presentation";
import {
  AnalyticsCategoriesSheetContent,
  AnalyticsSubscriptionsSheetContent,
  AnalyticsTransactionsSheetContent,
  AnalyticsVendorsSheetContent,
} from "./analytics-sheet-contents";
import { InsightsBudgetPanel } from "./insights-overview-panels";

export type AnalyticsDetailSheet =
  | "categories"
  | "transactions"
  | "subscriptions"
  | "vendors"
  | "budget"
  | null;

export function AnalyticsDetailSheets({
  activeSheet,
  onActiveSheetChange,
  at,
  tab,
  presentation,
  categories,
  categoryTotal,
  isCategoryLoading,
  currency,
  direction,
  transactions,
  transactionsStatus,
  transactionsError,
  onReloadTransactions,
  onSelectTransaction,
  onOpenTransactions,
  transactionFocus,
  transactionFocusKey,
  timeScope,
  currencies,
  onScopeChange,
  onCurrencyChange,
}: {
  activeSheet: AnalyticsDetailSheet;
  onActiveSheetChange: (sheet: AnalyticsDetailSheet) => void;
  at: Date;
  tab: AnalyticsTab;
  presentation: InsightsPresentation | null;
  categories: InsightsCategorySlice[];
  categoryTotal: number;
  isCategoryLoading: boolean;
  currency: string;
  direction: AnalyticsDirection;
  transactions: InsightsTransactionRow[];
  transactionsStatus: "loading" | "ready" | "error";
  transactionsError: string | null;
  onReloadTransactions: () => void;
  onSelectTransaction: (item: InsightsTransactionRow) => void;
  onOpenTransactions: (focus?: AnalyticsTransactionFocus) => void;
  transactionFocus: AnalyticsTransactionFocus;
  transactionFocusKey: number;
  timeScope: InsightsTimeScope;
  currencies: string[];
  onScopeChange: (scope: InsightsTimeScope) => void;
  onCurrencyChange: (currency: string) => void;
}) {
  const close = () => onActiveSheetChange(null);

  return (
    <>
      <NativeBottomSheet
        isOpen={activeSheet === "categories"}
        onOpenChange={(open) => onActiveSheetChange(open ? "categories" : null)}
        title="Spending by category"
        description={formatAnalyticsSheetSubtitle(at, tab, currency)}
        snapPoints={["88%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <AnalyticsCategoriesSheetContent
            at={at}
            tab={tab}
            categories={categories}
            categoryTotal={categoryTotal}
            currency={currency}
            presentation={presentation}
            isLoading={isCategoryLoading}
            onViewTransactions={(category) => onOpenTransactions(categoryTransactionFocus(category))}
          />
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "transactions"}
        onOpenChange={(open) => onActiveSheetChange(open ? "transactions" : null)}
        title={direction === "income" ? "Recent income" : "Recent spending"}
        description={formatAnalyticsSheetSubtitle(at, tab, currency)}
        snapPoints={["88%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* A new focus request (focusKey) starts a fresh search: keyed
              remount, so the content initialises from `focus` directly. */}
          <AnalyticsTransactionsSheetContent
            key={transactionFocusKey}
            direction={direction}
            items={transactions}
            status={transactionsStatus}
            error={transactionsError}
            onRetry={onReloadTransactions}
            focus={transactionFocus}
            onSelect={(item) => {
              close();
              onSelectTransaction(item);
            }}
          />
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "subscriptions"}
        onOpenChange={(open) => onActiveSheetChange(open ? "subscriptions" : null)}
        title="Subscriptions"
        description={formatAnalyticsSheetSubtitle(at, tab, currency)}
        snapPoints={["85%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {presentation ? <AnalyticsSubscriptionsSheetContent presentation={presentation} /> : null}
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "vendors"}
        onOpenChange={(open) => onActiveSheetChange(open ? "vendors" : null)}
        title="Top vendors"
        description={formatAnalyticsSheetSubtitle(at, tab, currency)}
        snapPoints={["85%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {presentation ? (
            <AnalyticsVendorsSheetContent
              currency={currency}
              currencies={currencies}
              scope={timeScope}
              onScopeChange={onScopeChange}
              onCurrencyChange={onCurrencyChange}
              presentation={presentation}
              onViewTransactions={(vendor) => onOpenTransactions(vendorTransactionFocus(vendor))}
            />
          ) : null}
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "budget"}
        onOpenChange={(open) => onActiveSheetChange(open ? "budget" : null)}
        title="Budget performance"
        description="Based on the configured daily budget"
        snapPoints={["70%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {presentation ? <InsightsBudgetPanel data={presentation} /> : null}
        </ScrollView>
      </NativeBottomSheet>
    </>
  );
}
