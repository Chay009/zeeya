// Shared lifecycle for bounded-read-model detail routes. TanStack Query
// caches each id so revisiting a row feels instant and sync revisions
// refresh in the background without blanking the screen.
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import {
  DETAIL_INITIAL_STATE,
  type DetailState,
  type DetailStatus,
} from "./detail-reducer";

export type { DetailState, DetailStatus } from "./detail-reducer";
export { DETAIL_INITIAL_STATE, reduceDetail } from "./detail-reducer";

export function useDetail<T>(
  id: string,
  fetch: (id: string) => Promise<T | null>,
  scope: "transaction" | "activity" | "subscription" | "detail" = "detail",
): DetailState<T> {
  const { syncRevision } = useDashboardSync();
  const { data, error, isInitialLoading } = useLocalQuery({
    queryKey: localQueryKeys.detail(scope, id, syncRevision),
    queryFn: () => fetch(id),
    enabled: id.length > 0,
  });

  if (!id) {
    return { status: "not-found", value: null, error: null };
  }
  if (isInitialLoading) {
    return DETAIL_INITIAL_STATE as DetailState<T>;
  }
  if (error) {
    return { status: "error", value: null, error };
  }
  if (data === null || data === undefined) {
    return { status: "not-found", value: null, error: null };
  }
  return { status: "ready", value: data, error: null };
}
