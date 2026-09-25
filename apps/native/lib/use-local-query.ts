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
 * TanStack Query wrapper for on-device SQLite reads.
 * Keeps the last snapshot visible while a new projection revision loads.
 */
export function useLocalQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
}: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
}): UseLocalQueryResult<T> {
  const result = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
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
