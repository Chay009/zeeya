import { describe, expect, it } from "vitest";

import { localQueryStatus } from "@/lib/use-local-query";

import { detailState } from "./detail-state";

describe("localQueryStatus", () => {
  it("is loading only while there is nothing to show and no failure", () => {
    expect(localQueryStatus({ pending: true, hasData: false, error: null })).toBe("loading");
  });

  it("keeps data on screen when a background re-read fails", () => {
    expect(localQueryStatus({ pending: false, hasData: true, error: "database is locked" })).toBe(
      "ready",
    );
  });

  it("is an error only when the read failed with nothing to show", () => {
    expect(localQueryStatus({ pending: false, hasData: false, error: "database is locked" })).toBe(
      "error",
    );
  });

  it("treats a disabled query (never pending, no data) as ready", () => {
    expect(localQueryStatus({ pending: false, hasData: false, error: null })).toBe("ready");
  });
});

describe("detailState", () => {
  it("is ready with the value once loaded", () => {
    expect(detailState("txn-1", { status: "ready", data: { id: "txn-1" }, error: null })).toEqual({
      status: "ready",
      value: { id: "txn-1" },
      error: null,
    });
  });

  // "No such row" must not look like a failure: one means go back, the
  // other means retry.
  it("is not-found (not error) when the read succeeded with no row", () => {
    expect(detailState("txn-1", { status: "ready", data: null, error: null }).status).toBe(
      "not-found",
    );
  });

  it("is an error carrying the message when the read failed", () => {
    expect(detailState("txn-1", { status: "error", data: undefined, error: "locked" })).toEqual({
      status: "error",
      value: null,
      error: "locked",
    });
  });

  it("is loading before the first read resolves", () => {
    expect(detailState("txn-1", { status: "loading", data: undefined, error: null }).status).toBe(
      "loading",
    );
  });

  it("is not-found for an empty id without reading", () => {
    expect(detailState("", { status: "ready", data: undefined, error: null }).status).toBe(
      "not-found",
    );
  });
});
