import type { ActivityDirectionFilter } from "@/stores/activity-filters-store";

export interface DirectionFilterOption {
  value: ActivityDirectionFilter;
  label: string;
}

// The Activity screen's static copy and filter definitions, kept out of
// the component so activity-list.tsx consumes typed data instead of
// hardcoding strings inline.
export const ACTIVITY_DIRECTION_FILTERS: readonly DirectionFilterOption[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
];

export const ACTIVITY_COPY = {
  totalSpendLabel: "Total Spend",
  emptyTitle: "No activity yet",
  emptyBody: "Connect your messages to see transactions here.",
  otherCategoryLabel: "Others",
  directionLabel: {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
  },
} as const;
