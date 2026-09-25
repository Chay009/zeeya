// Fetches db/queries-home.ts's bounded HomeReadModel for the Home screen.
// TanStack Query keeps the last snapshot visible while a new projection revision loads.

import { useCallback, useState } from "react";

import { financeDataSource } from "@/features/dashboard/dashboard-data-source";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import type { HomeReadModelStatus, HomeReadModelState } from "./home-read-model-controller";

export type { HomeReadModelStatus, HomeReadModelState } from "./home-read-model-controller";

export interface UseHomeReadModelResult extends HomeReadModelState {
  reload: (currency: string) => void;
}

export function useHomeReadModel(initialCurrency: string): UseHomeReadModelResult {
  const { syncRevision } = useDashboardSync();
  const [currency, setCurrency] = useState(initialCurrency);

  const { data, error, isInitialLoading, refetch } = useLocalQuery({
    queryKey: localQueryKeys.homeReadModel(currency, syncRevision),
    queryFn: () => financeDataSource.home.load({ currency, at: Date.now() }),
  });

  const reload = useCallback(
    (nextCurrency: string) => {
      if (nextCurrency !== currency) {
        setCurrency(nextCurrency);
        return;
      }
      void refetch();
    },
    [currency, refetch],
  );

  const status: HomeReadModelStatus = isInitialLoading ? "loading" : error ? "error" : "ready";

  return {
    status,
    error,
    model: data ?? null,
    currency,
    reload,
  };
}
