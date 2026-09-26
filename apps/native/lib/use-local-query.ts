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
 * TanStack Query wrapper for on-device SQLite reads. Results are cached per
 * key for the session (staleTime ∞; keys carry the sync revision, so a new
 * sync is a new key), which is what makes revisiting a tab instant.
 */
export function useLocalQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  keepPrevious = true,
}: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  keepPrevious?: KeepPrevious;
}): UseLocalQueryResult<T> {
  const result = useQuery({
    queryKey,
    queryFn,
    enabled,
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
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const error = result.error
    ? result.error instanceof Error
      ? result.error.message
      : String(result.error)
    : null;

  return {
    data: result.data,
    error,
    isInitialLoading: result.data === undefined && result.isFetching,
    isRevalidating: result.data !== undefined && result.isFetching,
    refetch: result.refetch,
  };
}
