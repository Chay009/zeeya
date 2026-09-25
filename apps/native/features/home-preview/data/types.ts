import type { ActivityCategoryFilter } from "../../../lib/activity-filters";
import type { HomeActivityItem } from "../../../lib/dashboard-data";
import type { ParsedSms } from "../../../lib/sms";

import type { FlowChartModel } from "./flow-chart-scale";

export type PreviewSub = {
  key: string;
  currency: string;
  name: string;
  letter: string;
  tile: string;
  ink: string;
  bar: string;
  img?: string;
  type: "autopay" | "recurring" | "manual";
  typeLabel: string;
  status: "Active" | "Cancelled";
  amount: string;
  amountValue: number | null;
  meta: string;
  dateLabel: string;
  dateLabelTitle: string;
  reactivated?: boolean;
  timeline: { label: string; time: string; dot: string }[];
};

export type CalendarMonth = {
  key: string;
  label: string;
  spent: string;
  income: string;
  offset: number;
  days: number;
  today?: number;
  nets: Record<number, string>;
};

export type CategorySummary = {
  label: string;
  amount: string;
  color: string;
  pct: number;
};

// Every field ActivityItemRow actually renders — shared by the two real
// activity-item shapes (ActivityItem, from the legacy Dashboard path, and
// HomeActivityViewItem, from the bounded HomeReadModel path) so
// ActivitySection/ActivityItemRow can render either one without branching
// on which path produced it. Each concrete type below still carries its own
// extra fields (ActivityItem.raw, HomeActivityViewItem.detailTarget) that
// only that path's own tap handler reads — this interface is deliberately
// just the rendering subset, not a union of everything either type has.
export interface ActivityRowPresentation {
  key: string;
  letter: string;
  tile: string;
  ink: string;
  img?: string;
  bar: string;
  name: string;
  sub: string;
  amount: string | null;
  direction: "income" | "expense" | "neutral";
  categoryFilters: ActivityCategoryFilter[];
  categorySuggestions: ActivityCategorySuggestion[];
  pills: ActivityPill[];
}

export type ActivityItem = ActivityRowPresentation & {
  // The full parsed message this row summarizes — carried through so a
  // detail screen can show every field the parser extracted (ref, bene,
  // otp, mandateId, upiHandle, ...), not just the handful surfaced in the
  // row itself. See TransactionDetail.
  raw: ParsedSms;
};

export type DetailSection = {
  title: string;
  rows: { label: string; value: string }[];
};

export type ActivityCategorySuggestion = {
  key: string;
  label: string;
};

export type ActivityPill = {
  key: string;
  label: string;
  tone: "bank" | "recurring" | "type" | "subcategory" | "card" | "mandate";
};

export type HomeAccount = {
  id: string;
  key: string;
  bankName: string;
  bankIcon?: string;
  // The bank's real brand colour, from knownBankStyles. The card paints
  // itself with this, so two accounts never look like the same card.
  bankColor: string;
  status: string;
  balance: string;
  balanceMinorUnits: number | null;
  last4: string;
  currency: string;
  netAcross: string;
  balanceMeta: string | null;
  reportedBalance: string | null;
  reportedMeta: string | null;
  capturedIncome: string | null;
  capturedExpense: string | null;
  capturedChange: string | null;
  capturedTransactionCount: number;
  reconciliation: string | null;
  unassignedNote: string | null;
};

export type HomeDetectedAccount = {
  key: string;
  bankName: string;
  bankIcon?: string;
  status: "DETECTED";
  last4: string;
  currency: string;
  evidenceType: string;
  evidenceAt: number;
  evidenceDate: string;
  evidenceSource: string;
  note: string;
};

export type HomeUnassignedReading = {
  key: string;
  bankName: string;
  bankIcon?: string;
  status: "UNASSIGNED";
  balance: string;
  currency: string;
  evidenceAt: number;
  evidenceDate: string;
  evidenceSource: string;
  note: string;
};

export type HomePreviewData = {
  displayName: string;
  greeting: string;
  monthLabel: string;
  account: HomeAccount;
  accounts: HomeAccount[];
  detectedAccounts: HomeDetectedAccount[];
  unassignedReadings: HomeUnassignedReading[];
  cashflow: {
    subtitle: string;
    income: string;
    expense: string;
    flowChart: FlowChartModel;
    calendarMonths: CalendarMonth[];
    categories: CategorySummary[];
    // Every currency with real activity this period, and which one the
    // chart/calendar/category views above are currently scoped to — the
    // headline income/expense figures already show every currency at
    // once (never summed together), but the chart/calendar/categories
    // can only render one currency's numbers at a time, so this makes
    // that scoping visible and switchable instead of silently hiding
    // whichever currency isn't "primary."
    availableCurrencies: string[];
    selectedCurrency: string;
  };
  budget: {
    monthLabel: string;
    spent: string;
    limit: string | null;
    usedPercent: number | null;
    remaining: string | null;
  };
  subscriptions: {
    items: PreviewSub[];
    monthlySpend: string;
    expectedMonthlyMinorUnits: number;
    activeCount: number;
    cancelledCount: number;
  };
  activity: {
    dateLabel: string;
    filters: { value: ActivityCategoryFilter; label: string; count: number }[];
    items: ActivityItem[];
    allItems: ActivityItem[];
  };
};

export interface NewTransactionSummary {
  key: string;
  name: string;
  amount: string | null;
  direction: "income" | "expense" | "neutral";
}

export type HomeActivityViewItem = ActivityRowPresentation & {
  // What a tap on this row should open, and the exact id to open it with —
  // see HomeActivityDetailTarget's own comment in lib/dashboard-data.ts for
  // why this must come from SQL, never be guessed from categories[0].
  detailTarget: HomeActivityItem["detailTarget"];
  // Bounded read-model metadata ActivityList uses for month grouping, spend
  // breakdown, and account scoping — carried from HomeActivityItem instead
  // of the legacy ActivityItem.raw ParsedSms envelope.
  date: number;
  amountMinorUnits: number | null;
  currency: string | null;
  bankName: string | null;
  accountId: string | null;
};

export type HomePreviewDataFromReadModel = Omit<HomePreviewData, "activity"> & {
  activity: {
    dateLabel: string;
    filters: { value: ActivityCategoryFilter; label: string; count: number }[];
    items: HomeActivityViewItem[];
    allItems: HomeActivityViewItem[];
  };
};

