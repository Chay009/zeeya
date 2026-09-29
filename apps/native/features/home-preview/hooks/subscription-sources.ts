// Reads shared by the Subscriptions list and a subscription's detail route.
import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { MandateCursor, MandateEventSummary, MandateSummary } from "@/lib/dashboard-data";

import { previewSubFromMandateSummary, type PreviewSub } from "../data";

// Mandates are a small, human-bounded set; the source is paginated anyway.
export async function loadAllMandates(): Promise<MandateSummary[]> {
  const mandates: MandateSummary[] = [];
  let cursor: MandateCursor | undefined;
  do {
    const page = await financeDataSource.mandates.list({ limit: 100, cursor });
    mandates.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return mandates;
}

/** An active mandate that was cancelled at some point before. */
function mandateReactivated(
  mandate: MandateSummary,
  events: readonly Pick<MandateEventSummary, "status">[],
): boolean {
  return mandate.status === "active" && events.some((event) => event.status === "cancelled");
}

export function mandatePreviewSub(
  mandate: MandateSummary,
  events: MandateEventSummary[],
): PreviewSub {
  return previewSubFromMandateSummary(mandate, events, mandateReactivated(mandate, events));
}
