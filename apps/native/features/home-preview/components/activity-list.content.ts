import type { ActivityDirectionFilter } from "@/stores/activity-filters-store";

export interface DirectionFilterOption {
  value: ActivityDirectionFilter;
  label: string;
}

// The Transactions screen's static copy and filter definitions, kept out of
// the component so activity-list.tsx consumes typed data instead of
// hardcoding strings inline.
export const ACTIVITY_DIRECTION_FILTERS: readonly DirectionFilterOption[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
];

export const ACTIVITY_COPY = {
  title: "Transactions",
  emptyTitle: "No transactions this month",
  emptyBody: "Payments show up here as soon as a bank message is captured.",
  emptyFilteredTitle: "Nothing matches this filter",
  otherCategoryLabel: "Other",
  searchPlaceholder: "Search merchant, bank, amount",
  searchNoResultsTitle: "No matches",
  searchNoResultsBody: "Try a merchant, a bank, a category or an exact amount.",
  searchResultsCapped: "Showing the newest matches — add a word to narrow down.",
} as const;
