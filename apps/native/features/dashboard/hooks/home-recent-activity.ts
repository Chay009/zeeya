// Fetches the bounded, filter-scoped HomeActivityItem[] used by Home's
// category pills and the Transactions tab. Cached per (scope, sync revision)
// so revisiting the tab is instant instead of a fresh SQLCipher read.
//
// The previous rows stay visible only while the SAME scope revalidates
// (pull-to-refresh / new sync). A category or account change never shows the
// old scope's rows under the new label — it reports loading with no items.

import { useCallback } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { ActivityCategory, HomeActivityItem } from "@/lib/dashboard-data";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

export type HomeRecentActivityStatus = "loading" | "ready" | "error";

export interface HomeRecentActivityState {
  status: HomeRecentActivityStatus;
  error: string | null;
  items: HomeActivityItem[];
}

export interface UseHomeRecentActivityResult extends HomeRecentActivityState {
  // Re-fetches the currently selected category. It is a no-op while the
  // auxiliary query is disabled (the Home "all" path uses the read model).
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
): UseHomeRecentActivityResult {
  const { syncRevision } = useDashboardSync();
  const queryKey = localQueryKeys.recentActivity({ category, accountId, limit }, syncRevision);
  const scope = queryKey[2];

  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey,
    queryFn: () => financeDataSource.home.loadRecentActivity({ category, accountId, limit, at: Date.now() }),
    enabled,
    keepPrevious: (previousKey) => previousKey[1] === "recent-activity" && previousKey[2] === scope,
  });

  const reload = useCallback(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);

  if (!enabled) return { status: "ready", error: null, items: EMPTY, reload };

  const status: HomeRecentActivityStatus = isInitialLoading
    ? "loading"
    : error && !data
      ? "error"
      : data
        ? "ready"
        : "loading";

  return { status, error: status === "error" ? error : null, items: data ?? EMPTY, reload };
}
