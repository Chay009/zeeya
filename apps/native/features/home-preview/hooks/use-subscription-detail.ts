import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { localQueryKeys } from "@/lib/local-query-keys";
import { queryClient } from "@/lib/query-client";

import {
  previewSubFromSubscriptionSummary,
  subscriptionPreviewKey,
  type PreviewSub,
} from "../data";
import { mandatePreviewSub } from "./subscription-sources";
import { useDetail } from "./use-detail";

async function fetchSubscriptionDetail(key: string): Promise<PreviewSub | null> {
  if (key.startsWith("mandate:")) {
    const mandateId = key.slice("mandate:".length);
    const [mandate, events] = await Promise.all([
      financeDataSource.mandates.get(mandateId),
      financeDataSource.mandates.listEvents({ mandateId, limit: 30 }),
    ]);
    return mandate ? mandatePreviewSub(mandate, events.items) : null;
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

// The Subscriptions list already holds every PreviewSub (built by the same
// builders fetchSubscriptionDetail uses), so a tap from the list renders the
// detail immediately instead of a skeleton followed by a full mandate scan.
function seedFromCatalog(key: string): PreviewSub | undefined {
  return queryClient
    .getQueryData<PreviewSub[]>(localQueryKeys.subscriptionsCatalog())
    ?.find((item) => item.key === key);
}

export function useSubscriptionDetail(key: string | undefined) {
  const fetch = useCallback(
    (id: string) => (id.length > 0 ? fetchSubscriptionDetail(id) : Promise.resolve(null)),
    [],
  );
  return useDetail<PreviewSub>(key ?? "", fetch, "subscription", seedFromCatalog);
}
