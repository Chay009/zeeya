import { describe, expect, it } from "vitest";

import { seriesQueryErrorMessage } from "./series-query-error";

describe("series query presentation errors", () => {
  it("keeps technical query details out of user-facing chart copy", () => {
    expect(seriesQueryErrorMessage(new Error("SQLITE_BUSY: projection locked"))).toBe(
      "This chart is temporarily unavailable. Try again.",
    );
    expect(seriesQueryErrorMessage("unknown failure")).toBe(
      "This chart is temporarily unavailable. Try again.",
    );
  });
});
