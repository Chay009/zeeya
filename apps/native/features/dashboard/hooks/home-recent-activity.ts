// Fetches the bounded, filter-scoped HomeActivityItem[] used by Home's
// category pills and the Transactions tab. Cached per scope so revisiting
// the tab is instant instead of a fresh SQLCipher read.
//
// The previous rows stay visible only while the SAME scope revalidates
// (pull-to-refresh / data change). A category or account change never shows the
// old scope's rows under the new label — it reports loading with no items.

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import type { ActivityCategory, HomeActivityItem } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery, type LocalQueryStatus } from "@/lib/use-local-query";

export interface UseHomeRecentActivityResult {
  status: LocalQueryStatus;
  error: string | null;
  items: HomeActivityItem[];
  reload: () => void;
}

const EMPTY: HomeActivityItem[] = [];

export function useHomeRecentActivity(
  category: ActivityCategory | undefined,
  limit?: number,
  // When false, the hook never issues a fetch and reports a stable
  // "ready with no items" state. Home uses this for its "all" pill because
  // the read model already carries the bounded unfiltered preview.
  enabled: boolean = true,
  accountId?: string,
  // A period ([from, to), epoch ms), transactions-only and/or search scope —
  // the Transactions tab reads one month, or an all-time search, in SQL.
  period?: { from?: number; to?: number; transactionsOnly?: boolean; search?: string },
): UseHomeRecentActivityResult {
  const from = period?.from;
  const to = period?.to;
  const transactionsOnly = period?.transactionsOnly;
  const search = period?.search;
  const queryKey = localQueryKeys.recentActivity({
    category,
    accountId,
    limit,
    from,
    to,
    transactionsOnly,
    search,
  });
  const scope = queryKey[2];
  const searching = queryKey[3] !== "";

  const { data, status, error, reload } = useLocalQuery({
    queryKey,
    queryFn: () =>
      financeDataSource.home.loadRecentActivity({
        category,
        accountId,
        limit,
        from,
        to,
        transactionsOnly,
        search,
        at: Date.now(),
      }),
    enabled,
    // Same scope, and either the same search or still searching: typing keeps
    // the last results up instead of flashing skeletons on every keystroke.
    keepPrevious: (previousKey) =>
      previousKey[1] === "recent-activity" &&
      previousKey[2] === scope &&
      (previousKey[3] === queryKey[3] || (searching && previousKey[3] !== "")),
  });

  // Disabled (Home's "all" pill reads the read model instead): a stable,
  // empty "ready" — TanStack never fetches a disabled query.
  if (!enabled) return { status: "ready", error: null, items: EMPTY, reload };
  return { status, error, items: data ?? EMPTY, reload };
}
