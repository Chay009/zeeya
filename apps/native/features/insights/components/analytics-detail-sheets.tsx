import { ScrollView } from "react-native";

import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";

import { formatAnalyticsSheetSubtitle } from "../analytics-format";
import {
  categoryTransactionFocus,
  vendorTransactionFocus,
  type AnalyticsTransactionFocus,
} from "../analytics-transaction-focus";
import type { AnalyticsDirection, AnalyticsTab } from "../analytics-scope";
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
import { InvestmentList, OnlineMixSheetContent, PlaceList } from "./message-insight-cards";
import type { MessageInsights } from "@/lib/message-insights";

export type AnalyticsDetailSheet =
  | "categories"
  | "transactions"
  | "subscriptions"
  | "vendors"
  | "budget"
  | "investments"
  | "places"
  | "online"
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
  currencies,
  onCurrencyChange,
  messageInsights,
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
  currencies: string[];
  onCurrencyChange: (currency: string) => void;
  messageInsights: MessageInsights;
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
            onViewTransactions={(category) =>
              onOpenTransactions(categoryTransactionFocus(category))
            }
          />
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "transactions"}
        onOpenChange={(open) => onActiveSheetChange(open ? "transactions" : null)}
        title={direction === "income" ? "Latest income" : "Latest spending"}
        // Honest about the window: the newest payments, not the whole period.
        description={`Newest ${transactions.length} · ${currency}`}
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
        title="Merchants"
        description={formatAnalyticsSheetSubtitle(at, tab, currency)}
        snapPoints={["85%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {presentation ? (
            <AnalyticsVendorsSheetContent
              currency={currency}
              currencies={currencies}
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

      <NativeBottomSheet
        isOpen={activeSheet === "investments"}
        onOpenChange={(open) => onActiveSheetChange(open ? "investments" : null)}
        title="Investments"
        description="Latest NAV from your fund messages"
        snapPoints={["70%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <InvestmentList investments={messageInsights.investments} />
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "places"}
        onOpenChange={(open) => onActiveSheetChange(open ? "places" : null)}
        title="Where you spend"
        description={`This month · ${currency}`}
        snapPoints={["70%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <PlaceList places={messageInsights.places} currency={currency} />
        </ScrollView>
      </NativeBottomSheet>

      <NativeBottomSheet
        isOpen={activeSheet === "online"}
        onOpenChange={(open) => onActiveSheetChange(open ? "online" : null)}
        title="Online vs in store"
        description={`This month · ${currency}`}
        snapPoints={["55%"]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <OnlineMixSheetContent insights={messageInsights} currency={currency} />
        </ScrollView>
      </NativeBottomSheet>
    </>
  );
}
