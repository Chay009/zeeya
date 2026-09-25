import type { Href } from "expo-router";

import type { HomeActivityViewItem } from "./data/types";

// Typed expo-router href for activity row taps — financial messages open the
// SQL transaction detail route; everything else opens activity detail.
export function buildTransactionDetailRoute(transactionId: string): Href {
  return {
    pathname: "/transaction-detail/[id]",
    params: { id: transactionId },
  };
}

export function buildActivityDetailRoute(item: HomeActivityViewItem): Href {
  if (item.detailTarget.kind === "transaction") {
    return {
      pathname: "/transaction-detail/[id]",
      params: { id: item.detailTarget.id },
    };
  }
  return {
    pathname: "/activity-detail/[id]",
    params: { id: item.detailTarget.id },
  };
}
