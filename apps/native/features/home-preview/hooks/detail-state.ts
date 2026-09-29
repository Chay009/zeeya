import type { LocalQueryStatus } from "@/lib/use-local-query";

export type DetailStatus = "loading" | "ready" | "not-found" | "error";

export interface DetailState<T> {
  status: DetailStatus;
  value: T | null;
  error: string | null;
}

/**
 * What a detail route renders. "not-found" (the read succeeded and the row
 * doesn't exist) is distinct from "error" (the read failed): one means go
 * back, the other means retry. Data already on screen wins over a failed
 * background re-read.
 */
export function detailState<T>(
  id: string,
  query: { status: LocalQueryStatus; data: T | null | undefined; error: string | null },
): DetailState<T> {
  if (!id) return { status: "not-found", value: null, error: null };
  if (query.status === "loading") return { status: "loading", value: null, error: null };
  if (query.status === "error") return { status: "error", value: null, error: query.error };
  if (query.data === null || query.data === undefined) {
    return { status: "not-found", value: null, error: null };
  }
  return { status: "ready", value: query.data, error: null };
}
