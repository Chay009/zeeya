export type DetailStatus = "loading" | "ready" | "not-found" | "error";

export interface DetailState<T> {
  status: DetailStatus;
  value: T | null;
  error: string | null;
}

export const DETAIL_INITIAL_STATE: Readonly<DetailState<unknown>> = {
  status: "loading",
  value: null,
  error: null,
};

export function reduceDetail<T>(
  outcome: { kind: "resolve"; value: T | null } | { kind: "reject"; error: string },
): DetailState<T> {
  if (outcome.kind === "resolve") {
    return {
      status: outcome.value === null ? "not-found" : "ready",
      value: outcome.value,
      error: null,
    };
  }
  return { status: "error", value: null, error: outcome.error };
}
