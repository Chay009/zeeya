import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import { seriesQueryErrorMessage } from "./series-query-error";

export { seriesQueryErrorMessage } from "./series-query-error";

export interface SeriesQueryState<T> {
  value: T | null;
  error: string | null;
  isInitialLoading: boolean;
}

// TanStack Query-backed series reads for Insights charts. Keeps the last
// good series visible while a refresh or data-change re-read is in flight.
export function useSeriesQuery<T>(
  seriesKey: string,
  fetch: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): SeriesQueryState<T> {
  const { data, error, isInitialLoading } = useLocalQuery<T>({
    queryKey: localQueryKeys.series(seriesKey, deps),
    queryFn: async () => {
      try {
        return await fetch();
      } catch (cause: unknown) {
        console.error("Zeeya insights series query failed", cause);
        throw new Error(seriesQueryErrorMessage(cause));
      }
    },
    enabled,
    // A different key can represent a different currency/date scope. Cached
    // data for this exact key still stays visible during same-scope refreshes.
    keepPrevious: false,
  });

  return {
    value: data ?? null,
    error,
    isInitialLoading,
  };
}
