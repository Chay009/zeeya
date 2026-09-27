import { keepPreviousData, useQuery } from "@tanstack/react-query";

export interface UseLocalQueryResult<T> {
  data: T | undefined;
  error: string | null;
  /** True only on the first fetch when no cached/placeholder data exists. */
  isInitialLoading: boolean;
  /** True when refreshing with prior data still visible. */
  isRevalidating: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Whether the previous result may stay on screen while the new key loads.
 *  - true (default): always — right for the same view re-reading after a sync.
 *  - false: never — the new key means different content.
 *  - function: decide from the previous key, e.g. keep only when the filter
 *    scope is unchanged so one category's rows never show under another.
 */
export type KeepPrevious = boolean | ((previousKey: readonly unknown[]) => boolean);

/**
 * TanStack Query wrapper for on-device SQLite reads. Results never go stale
 * on their own (staleTime ∞) — revisiting a tab is instant — and are
 * re-read only when lib/live-queries.ts invalidates them (a committed write
 * or a new day). An invalidated query that isn't mounted re-reads on its
 * next mount, showing its cached data meanwhile.
 */
export function useLocalQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  keepPrevious = true,
  initialData,
}: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  keepPrevious?: KeepPrevious;
  /**
   * Seed from data already in hand (e.g. the list row that was tapped), so
   * the screen renders on its first frame. Return undefined when there's
   * nothing to seed from. Kept fresh like any other result: data changes
   * invalidate it.
   */
  initialData?: () => T | undefined;
}): UseLocalQueryResult<T> {
  const result = useQuery({
    queryKey,
    queryFn,
    enabled,
    initialData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    placeholderData:
      keepPrevious === true
        ? keepPreviousData
        : keepPrevious === false
          ? undefined
          : (previous, previousQuery) =>
              previousQuery && keepPrevious(previousQuery.queryKey) ? previous : undefined,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const error = result.error
    ? result.error instanceof Error
      ? result.error.message
      : String(result.error)
    : null;

  // TanStack re-renders a component only for the result fields it READS
  // (tracked properties). Reading isFetching here for every caller made
  // every query re-render its screen twice per refetch — fetch start and
  // fetch end — and every data change refetches every mounted local query.
  //  - isInitialLoading uses isPending ("no data yet"), which flips once.
  //  - isRevalidating is a getter, so only callers that actually show a
  //    refresh state subscribe to fetch start/end.
  return {
    data: result.data,
    error,
    isInitialLoading: result.isPending && enabled,
    get isRevalidating() {
      return result.data !== undefined && result.isFetching;
    },
    refetch: result.refetch,
  };
}
