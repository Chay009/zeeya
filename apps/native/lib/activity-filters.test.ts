import { describe, expect, it } from "vitest";
import type { MalanaCategory, MalanaResult } from "@zeeya/parser/malana";
import { filterActivityByCategory } from "./activity-filters";
import type { ParsedSms } from "./sms";

function message(id: string, categories: MalanaCategory[]): ParsedSms {
  return {
    id,
    sender: "VM-TEST",
    body: "test",
    date: Number(id),
    result: {
      category: categories[0] ?? null,
      matchedCategories: categories,
    } as MalanaResult,
  };
}

describe("filterActivityByCategory", () => {
  const activity = [
    message("3", ["GRM_TRAVEL", "GRM_BANK"]),
    message("2", ["GRM_DELIVERY"]),
    message("1", ["GRM_OTP"]),
  ];

  it("keeps the complete activity feed for All", () => {
    expect(filterActivityByCategory(activity, "all").map((item) => item.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });

  it("includes a multi-category message under every matching pill", () => {
    expect(filterActivityByCategory(activity, "GRM_TRAVEL").map((item) => item.id)).toEqual(["3"]);
    expect(filterActivityByCategory(activity, "GRM_BANK").map((item) => item.id)).toEqual(["3"]);
  });

  it("does not fall back to the legacy primary category metadata", () => {
    const legacyOnly = message("4", []);
    legacyOnly.result.category = "GRM_BANK";

    expect(filterActivityByCategory([legacyOnly], "GRM_BANK")).toEqual([]);
  });

  it("keeps internal categories out of All", () => {
    const internal = message("5", ["GRM_VOID", "GRM_CALLALERTS", "GRM_TELECOM"]);

    expect(filterActivityByCategory([internal], "all")).toEqual([]);
  });
});
