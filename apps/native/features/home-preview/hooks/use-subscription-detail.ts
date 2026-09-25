import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { MandateSummary } from "@/lib/dashboard-data";

import {
  previewSubFromMandateSummary,
  previewSubFromSubscriptionSummary,
  subscriptionPreviewKey,
  type PreviewSub,
} from "../data";
import { useDetail } from "./use-detail";

async function loadAllMandates(): Promise<MandateSummary[]> {
  const mandates: MandateSummary[] = [];
  let pageCursor: { lastUpdated: number; mandateId: string } | undefined;
  do {
    const page = await financeDataSource.mandates.list({ limit: 100, cursor: pageCursor });
    mandates.push(...page.items);
    pageCursor = page.nextCursor ?? undefined;
  } while (pageCursor);
  return mandates;
}

function mandateReactivated(
  mandate: MandateSummary,
  events: { status: "active" | "cancelled" }[],
): boolean {
  return mandate.status === "active" && events.some((event) => event.status === "cancelled");
}

async function fetchSubscriptionDetail(key: string): Promise<PreviewSub | null> {
  if (key.startsWith("mandate:")) {
    const mandateId = key.slice("mandate:".length);
    const mandates = await loadAllMandates();
    const mandate = mandates.find((candidate) => candidate.mandateId === mandateId);
    if (!mandate) return null;
    const events = await financeDataSource.mandates.listEvents({ mandateId, limit: 30 });
    return previewSubFromMandateSummary(
      mandate,
      events.items,
      mandateReactivated(mandate, events.items),
    );
  }

  if (key.startsWith("subscription:")) {
    const subscriptions = await financeDataSource.subscriptions.list({ at: Date.now() });
    const subscription = subscriptions.find(
      (candidate) => subscriptionPreviewKey(candidate.merchant, candidate.currency) === key,
    );
    return subscription ? previewSubFromSubscriptionSummary(subscription) : null;
  }

  return null;
}

export function useSubscriptionDetail(key: string | undefined) {
  const fetch = useCallback(
    (id: string) => (id.length > 0 ? fetchSubscriptionDetail(id) : Promise.resolve(null)),
    [],
  );
  return useDetail<PreviewSub>(key ?? "", fetch, "subscription");
}
