import { describe, expect, it } from "vitest";
import { buildInboxFilter, sortOrderFor } from "./sms-filter";

describe("sortOrderFor", () => {
  it("orders newest-first by date DESC, tiebreaking on _id DESC", () => {
    expect(sortOrderFor("newest-first")).toBe("date DESC, _id DESC");
  });

  it("orders oldest-first by date ASC, tiebreaking on _id ASC", () => {
    // The exact fix a review round asked to have directly tested: a
    // `date`-only ORDER BY has no defined tiebreak among equal-timestamp
    // rows across separate paginated queries, which could shuffle ties
    // between pages and skip or duplicate them at a page boundary. `_id`
    // as a secondary key, matching the primary direction, is what makes
    // repeated queries deterministic.
    expect(sortOrderFor("oldest-first")).toBe("date ASC, _id ASC");
  });
});

describe("buildInboxFilter", () => {
  it("defaults to a newest-first, 5000-message, unbounded read", () => {
    expect(buildInboxFilter()).toEqual({
      box: "inbox",
      maxCount: 5000,
      minDate: undefined,
      maxDate: undefined,
      indexFrom: undefined,
      sortOrder: "date DESC, _id DESC",
    });
  });

  it("passes since/until/indexFrom/maxCount straight through as minDate/maxDate/indexFrom/maxCount", () => {
    expect(
      buildInboxFilter({
        since: 100,
        until: 200,
        indexFrom: 50,
        maxCount: 10,
        order: "oldest-first",
      }),
    ).toEqual({
      box: "inbox",
      maxCount: 10,
      minDate: 100,
      maxDate: 200,
      indexFrom: 50,
      sortOrder: "date ASC, _id ASC",
    });
  });
});
