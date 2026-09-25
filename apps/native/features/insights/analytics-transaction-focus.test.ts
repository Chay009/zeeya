import { describe, expect, it } from "vitest";

import {
  categoryTransactionFocus,
  vendorTransactionFocus,
} from "./analytics-transaction-focus";

describe("analytics transaction focus", () => {
  it("maps food categories to the Food chip", () => {
    expect(categoryTransactionFocus("Food & Dining")).toEqual({
      searchQuery: "",
      chip: "Food",
    });
  });

  it("maps vendors to a search query", () => {
    expect(vendorTransactionFocus("Swiggy")).toEqual({ searchQuery: "Swiggy" });
  });
});
