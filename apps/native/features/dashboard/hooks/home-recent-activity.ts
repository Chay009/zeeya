// Fetches the bounded, filter-scoped HomeActivityItem[] used by Home's
// category pills. The request key is part of the returned lifecycle state so
// a category transition cannot render the previous category's rows for one
// paint before its effect has had a chance to clear them.

import { useCallback, useEffect, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import type { ActivityCategory, HomeActivityItem } from "@/lib/dashboard-data";

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

interface InternalHomeRecentActivityState extends HomeRecentActivityState {
  requestKey: string;
}

function scopeKey(
  category: ActivityCategory | undefined,
  accountId: string | undefined,
  limit: number | undefined,
): string {
  return `${category ?? "all"}:${accountId ?? "all-accounts"}:${limit ?? "default"}`;
}

function requestKey(
  category: ActivityCategory | undefined,
  accountId: string | undefined,
  limit: number | undefined,
  enabled: boolean,
  syncRevision: number,
  reloadGeneration: number,
): string {
  if (!enabled) return "disabled";
  return `${scopeKey(category, accountId, limit)}:${syncRevision}:${reloadGeneration}`;
}

function disabledState(requestKeyValue: string): InternalHomeRecentActivityState {
  return { status: "ready", error: null, items: [], requestKey: requestKeyValue };
}

function scopeKeyFromRequestKey(requestKeyValue: string): string | null {
  if (requestKeyValue === "disabled") return null;
  return requestKeyValue.split(":").slice(0, 3).join(":");
}

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
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const currentRequestKey = requestKey(
    category,
    accountId,
    limit,
    enabled,
    syncRevision,
    reloadGeneration,
  );
  const currentScopeKey = scopeKey(category, accountId, limit);
  const [state, setState] = useState<InternalHomeRecentActivityState>(() =>
    enabled
      ? { status: "loading", error: null, items: [], requestKey: currentRequestKey }
      : disabledState(currentRequestKey),
  );

  useEffect(() => {
    if (!enabled) {
      setState(disabledState(currentRequestKey));
      return;
    }
    let cancelled = false;
    // Clear items when the filter scope changes so old rows never appear under
    // a new label. Pull-to-refresh only bumps syncRevision — keep the last
    // good list visible while the scoped query revalidates.
    setState((previous) => {
      const keepItems =
        scopeKeyFromRequestKey(previous.requestKey) === currentScopeKey ? previous.items : [];
      return { status: "loading", error: null, items: keepItems, requestKey: currentRequestKey };
    });
    void financeDataSource.home
      .loadRecentActivity({ category, accountId, limit, at: Date.now() })
      .then((items) => {
        if (cancelled) return;
        setState({ status: "ready", error: null, items, requestKey: currentRequestKey });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
          items: [],
          requestKey: currentRequestKey,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, category, currentRequestKey, enabled, limit]);

  const reload = useCallback(() => {
    if (enabled) setReloadGeneration((generation) => generation + 1);
  }, [enabled]);

  // React runs effects after rendering. If the query inputs changed, expose
  // the new request's loading state immediately instead of returning the
  // previous request's rows during that gap. Disabled "all" remains ready
  // and empty regardless of sync revisions or reload generations.
  const visibleState = !enabled
    ? disabledState(currentRequestKey)
    : state.requestKey === currentRequestKey
      ? state
      : scopeKeyFromRequestKey(state.requestKey) === currentScopeKey
        ? { status: "loading" as const, error: null, items: state.items }
        : { status: "loading" as const, error: null, items: [] };

  return { ...visibleState, reload };
}
