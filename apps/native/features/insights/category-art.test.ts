import { describe, expect, it } from "vitest";

import { titleCase, transactionCategoryLabel } from "@/lib/transaction-category";

import { categoryArt } from "./category-visual";

// Labels exactly as the app shows them: the parser's merchant categories
// (packages/parser vendor_seed / vendor_brands) and transaction types,
// title-cased by transactionCategoryLabel.
const label = (raw: string) => transactionCategoryLabel(raw, null);

describe("categoryArt", () => {
  it.each([
    ["food", "cat-food"],
    ["hospitality", "cat-food"],
    ["wines", "cat-food"],
    ["travel", "cat-travel"],
    ["railway", "cat-travel"],
    ["fuel", "cat-fuel"],
    ["automobile", "cat-transport"],
    ["shopping", "cat-shopping"],
    ["e-commerce", "cat-shopping"],
    ["fashion", "cat-shopping"],
    ["cosmetics", "cat-shopping"],
    ["salon", "cat-shopping"],
    ["entertainment", "cat-entertainment"],
    ["communication", "cat-bills"],
    ["payments", "cat-bills"],
    ["monetary", "cat-invest"],
    ["medical", "cat-health"],
    ["lab", "cat-health"],
    ["fitness", "cat-health"],
    ["household", "cat-home"],
    ["hardware", "cat-home"],
    ["electronic", "cat-electronics"],
    ["gadget", "cat-electronics"],
    ["stationary", "cat-education"],
    ["publishing", "cat-education"],
    ["transfer", "cat-transfer"],
    ["withdrawal", "cat-cash"],
  ])("merchant category %s → %s", (raw, art) => {
    expect(categoryArt(label(raw))).toBe(art);
  });

  it.each([
    ["upi", "cat-transfer"],
    ["neft", "cat-transfer"],
    ["imps", "cat-transfer"],
    ["wallet", "cat-transfer"],
    ["atm", "cat-cash"],
    ["emi", "cat-emi"],
    ["autdbt", "cat-emi"],
    ["refund", "cat-cashback"],
    ["cashback", "cat-cashback"],
  ])("transaction type %s → %s", (raw, art) => {
    expect(categoryArt(titleCase(raw))).toBe(art);
  });

  it("keeps electronics apart from electricity bills", () => {
    expect(categoryArt("Electronic")).toBe("cat-electronics");
    expect(categoryArt("Electricity")).toBe("cat-bills");
  });

  it("falls back to the generic coin", () => {
    expect(categoryArt("Transaction")).toBe("cat-other");
    expect(categoryArt("Pet")).toBe("cat-other");
  });
});
