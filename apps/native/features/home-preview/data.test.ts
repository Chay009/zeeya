import { createMalanaEngine } from "@zeeya/parser/malana";
import { describe, expect, it } from "vitest";
import { deriveDashboard } from "../../lib/dashboard";
import type { ParsedSms } from "../../lib/sms";
import { createHomePreviewData } from "./data";

describe("createHomePreviewData — detected accounts", () => {
  it("shows SBI account identity when transaction messages have no balance", () => {
    const engine = createMalanaEngine();
    const bodies = [
      "Dear UPI user A/C X1234 debited by 50.00 on date 21Aug26 trf to SAMPLE PERSON Refno 123456789012 If not u? call-1800111109 for other services-18001234-SBI",
      "Dear UPI user A/C X1234 debited by 175.00 on date 28Jul26 trf to SAMPLE MERCHANT Refno 123456789013 If not u? call-1800111109 for other services-18001234-SBI",
    ];
    const messages: ParsedSms[] = bodies.map((body, index) => ({
      id: `sbi-${index}`,
      sender: "+916300000000",
      body,
      date: Date.UTC(2026, 7, 24, 6, index),
      result: engine.parse(body, "+916300000000"),
    }));

    const home = createHomePreviewData(
      deriveDashboard(messages, new Date(Date.UTC(2026, 7, 24))),
      true,
      new Date(Date.UTC(2026, 7, 24)),
    );

    expect(home.accounts).toHaveLength(0);
    expect(home.detectedAccounts[0]).toMatchObject({
      bankName: "State Bank of India",
      status: "DETECTED",
      last4: "1234",
    });
  });
});

describe("createHomePreviewData - transaction categories", () => {
  it("shows only parser-returned spending categories, capped at three", () => {
    const engine = createMalanaEngine();
    const body = "INR 2,500 debited from A/c XX1234 for flight ticket. PNR AB1234.";
    const parsed = engine.parse(body, "VM-HDFCBK");
    const messages: ParsedSms[] = [
      {
        id: "flight-transaction",
        sender: "VM-HDFCBK",
        body,
        date: Date.UTC(2026, 7, 24, 6),
        result: parsed,
      },
    ];

    const home = createHomePreviewData(
      deriveDashboard(messages, new Date(Date.UTC(2026, 7, 24))),
      true,
      new Date(Date.UTC(2026, 7, 24)),
    );
    const transaction = home.activity.allItems.find((item) => item.amount !== null);

    expect(parsed.matchedCategories).toContain("GRM_TRAVEL");
    expect(transaction).toBeDefined();
    expect(transaction!.categorySuggestions).toHaveLength(1);
    expect(transaction!.categorySuggestions[0]!.label).toBe("Travel");
    expect(transaction!.categorySuggestions.map((category) => category.label)).not.toContain(
      "Bank",
    );
  });
});
