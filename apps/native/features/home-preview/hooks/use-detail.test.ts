// Unit tests for the pure reducer that powers useDetail's state
// transitions. The hook itself wires this reducer up to React's effect
// lifecycle — it doesn't need its own test because (a) the codebase has
// no React hook testing infra (see
// features/dashboard/hooks/new-since-last-view.ts's own comment for the
// convention), and (b) every meaningful behavior lives in this reducer.
// The reducer distinguishes four mutually-exclusive outcomes:
//
//   1. resolve with non-null value → "ready"   (carry value)
//   2. resolve with null            → "not-found" (distinct from error;
//                                      a successful SQL query that returned
//                                      no rows is a real "doesn't exist"
//                                      answer, not a failure)
//   3. reject with a string         → "error"   (carry error message)
//   4. initial state                 → "loading" (covered by the
//                                      DETAIL_INITIAL_STATE constant itself)
//
// These cases are exhaustive of every state a route will ever render.
import { describe, expect, it } from "vitest";

import { DETAIL_INITIAL_STATE, reduceDetail } from "./detail-reducer";

describe("reduceDetail", () => {
  it("transitions from loading to ready when the fetch resolves with a non-null value", () => {
    const next = reduceDetail({ kind: "resolve", value: { id: "txn-1" } });
    expect(next).toEqual({
      status: "ready",
      value: { id: "txn-1" },
      error: null,
    });
  });

  it("transitions from loading to not-found (not error) when the fetch resolves with null", () => {
    // The critical distinction — collapsing "no such row" into "error"
    // would mean the user can't tell whether to retry or navigate back.
    const next = reduceDetail({ kind: "resolve", value: null });
    expect(next).toEqual({
      status: "not-found",
      value: null,
      error: null,
    });
  });

  it("transitions from loading to error and carries the rejection message when the fetch rejects", () => {
    const next = reduceDetail({ kind: "reject", error: "database is locked" });
    expect(next).toEqual({
      status: "error",
      value: null,
      error: "database is locked",
    });
  });

  it("never carries a value when transitioning to error or not-found", () => {
    const errored = reduceDetail({ kind: "reject", error: "x" });
    expect(errored.value).toBeNull();
    const notFound = reduceDetail({ kind: "resolve", value: null });
    expect(notFound.value).toBeNull();
  });

  it("the initial state is loading with no value or error", () => {
    expect(DETAIL_INITIAL_STATE).toEqual({
      status: "loading",
      value: null,
      error: null,
    });
  });

  it("the four status values (loading, ready, not-found, error) are mutually exclusive across the reducer", () => {
    // Property-style guard — the reducer must never produce a state where
    // value is set but status isn't "ready", or where both error and value
    // are set, since the route components only render `value` when
    // status === "ready".
    const cases: Array<ReturnType<typeof reduceDetail<unknown>>> = [
      reduceDetail({ kind: "resolve", value: { id: "txn-1" } }),
      reduceDetail({ kind: "resolve", value: null }),
      reduceDetail({ kind: "reject", error: "x" }),
    ];
    for (const state of cases) {
      if (state.status === "ready") {
        expect(state.value).not.toBeNull();
        expect(state.error).toBeNull();
      } else {
        expect(state.value).toBeNull();
      }
    }
  });
});
