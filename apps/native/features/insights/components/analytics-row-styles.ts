import { StyleSheet } from "react-native";

/** Shared row/column flex primitives for Analytics lists and sheets. */
export const analyticsRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  column: {
    flexDirection: "column",
  },
  amountColumn: {
    width: 76,
    textAlign: "right",
  },
  percentColumn: {
    width: 32,
    textAlign: "right",
  },
  trendColumn: {
    width: 40,
    textAlign: "right",
  },
  chartDonutRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
  },
  donutSlot: {
    width: 156,
    height: 156,
    alignItems: "center",
    justifyContent: "center",
  },
  legendColumn: {
    flex: 1,
    minWidth: 0,
    rowGap: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  subCardRow: {
    flexDirection: "row",
    columnGap: 10,
    marginTop: 16,
  },
  subCard: {
    flex: 1,
    minWidth: 0,
  },
});
