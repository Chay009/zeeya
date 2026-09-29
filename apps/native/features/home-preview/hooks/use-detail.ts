// Shared lifecycle for bounded-read-model detail routes. TanStack Query
// caches each id so revisiting a row feels instant and data changes
// refresh in the background without blanking the screen.
import { localQueryKeys } from "@/lib/local-query-keys";
import { useLocalQuery } from "@/lib/use-local-query";

import { detailState, type DetailState } from "./detail-state";

export type { DetailState, DetailStatus } from "./detail-state";

export function useDetail<T>(
  id: string,
  fetch: (id: string) => Promise<T | null>,
  scope: "transaction" | "activity" | "subscription" | "detail" = "detail",
  /** Seed from data already cached elsewhere, so the push renders content on frame one. */
  seed?: (id: string) => T | undefined,
): DetailState<T> {
  const { data, status, error } = useLocalQuery<T | null>({
    queryKey: localQueryKeys.detail(scope, id),
    queryFn: () => fetch(id),
    enabled: id.length > 0,
    initialData: seed && id ? () => seed(id) : undefined,
  });
  return detailState(id, { status, data, error });
}
