import { describe, expect, it } from "vitest";
import { seedData } from "./index.js";
import { MalanaEngine } from "./malana.js";

const engine = new MalanaEngine(seedData);

describe("Malana category composition", () => {
  it("keeps the bank transaction when a message is primarily travel", () => {
    const result = engine.parse(
      "INR 2,500 debited from A/c XX1234 for flight ticket. PNR AB1234.",
      "VM-HDFCBK",
    );

    expect(result.category).toBe("GRM_TRAVEL");
    expect(result.matchedCategories).toEqual(expect.arrayContaining(["GRM_TRAVEL", "GRM_BANK"]));
    expect(result.trx).toBe("2500");
    expect(result.trxTypeRich).toBe("EXPENSE");
    expect(
      result.categoryMatches?.find((match) => match.category === "GRM_BANK")?.evidence,
    ).toContainEqual({ kind: "grammar-tag", value: "trx" });
  });

  it("preserves one validated merchant across travel and bank composition", () => {
    const result = engine.parse(
      "INR 2,500 debited from A/c XX1234 to MakeMyTrip on 20-Aug-2026 for flight ticket. PNR AB1234.",
      "VM-HDFCBK",
    );

    expect(result.vendor).toBe("MakeMyTrip");
    expect(result.currency).toBe("INR");
    expect(result.trx).toBe("2500");
    expect(result.matchedCategories).toEqual(["GRM_TRAVEL", "GRM_BANK"]);
  });

  it("discovers a confirmed bill recharge without a forced category", () => {
    const result = engine.parse("Recharge Rs.399 successful.");

    expect(result.matchedCategories).toContain("GRM_BILL");
    expect(
      result.categoryMatches?.find((match) => match.category === "GRM_BILL")?.evidence,
    ).toContainEqual({ kind: "grammar-tag", value: "rechrgsucc" });
    expect(result.rechargeAmount).toBe("399");
    expect(result.trx).toBe("399");
    expect(result.trxTypeRich).toBe("RECHARGE");
  });

  it("retains OTP as a safety match without creating money", () => {
    const result = engine.parse(
      "Your OTP is 456789 for a purchase of Rs.5000. Do not share it.",
      "VM-HDFCBK",
    );

    expect(result.matchedCategories).toEqual(["GRM_OTP"]);
    expect(result.categoryMatches?.find((match) => match.category === "GRM_OTP")?.role).toBe(
      "safety",
    );
    expect(result.trx).toBeNull();
    expect(result.trxTypeRich).toBeNull();
    expect(result.billAmount).toBeNull();
    expect(result.creditLimit).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("returns category matches in deterministic policy order", () => {
    const message = "INR 2,500 debited from A/c XX1234 for flight ticket. PNR AB1234.";

    expect(engine.parse(message, "VM-HDFCBK").matchedCategories).toEqual([
      "GRM_TRAVEL",
      "GRM_BANK",
    ]);
  });

  it("keeps stock updates as financial information without inventing a transaction", () => {
    const result = engine.parse("NAV Rs.25.50 for folio 123456. Total units 100.");

    expect(result.category).toBe("GRM_STOCKUPDATES");
    expect(result.matchedCategories).toEqual(["GRM_STOCKUPDATES"]);
    expect(
      result.categoryMatches?.find((match) => match.category === "GRM_STOCKUPDATES")?.role,
    ).toBe("financial");
    expect(result.trx).toBeNull();
  });

  it("keeps delivery details without treating the order number as money", () => {
    const result = engine.parse("Your order #OD987654 from Flipkart is out for delivery today.");

    expect(result.category).toBe("GRM_DELIVERY");
    expect(result.matchedCategories).toEqual(["GRM_DELIVERY"]);
    expect(result.orderNo).toBe("987654");
    expect(result.trx).toBeNull();
  });

  it("keeps delivery and bank facets without counting two transactions", () => {
    const result = engine.parse(
      "INR 499 debited from A/c XX1234 for your order #OD987654. It is out for delivery.",
      "VM-HDFCBK",
    );
    expect(result.matchedCategories).toEqual(["GRM_DELIVERY", "GRM_BANK"]);
    expect(result.orderNo).toBe("987654");
    expect(result.trx).toBe("499");
    expect(result.trxTypeRich).toBe("EXPENSE");
    expect(result.categoryMatches?.filter((match) => match.tags.trx !== undefined)).toHaveLength(1);
  });

  it("distinguishes event and appointment information", () => {
    const event = engine.parse("Your ticket is booked. Seat 12 for the show on 20-Aug-2026.");
    const appointment = engine.parse(
      "Your appointment ID 12345 is scheduled on 20-Aug-2026 at 10:30 AM.",
    );

    expect(event.category).toBe("GRM_EVENT");
    expect(event.matchedCategories).toEqual(["GRM_EVENT"]);
    expect(event.trx).toBeNull();
    expect(appointment.category).toBe("GRM_APPOINTMENT");
    expect(appointment.matchedCategories).toEqual(["GRM_APPOINTMENT"]);
    expect(appointment.trx).toBeNull();
  });

  it("does not let an ambiguous seat marker override strong travel evidence", () => {
    const result = engine.parse("Flight AI202 is confirmed. PNR ABC123, seat 12A.");

    expect(result.category).toBe("GRM_TRAVEL");
    expect(result.matchedCategories?.[0]).toBe("GRM_TRAVEL");
    expect(result.trx).toBeNull();
  });

  it("keeps offers as safety information and ignores advertised amounts", () => {
    const result = engine.parse("Special offer: Get a personal loan of Rs.5 lakh. Apply now.");

    expect(result.category).toBe("GRM_OFFERS");
    expect(result.matchedCategories).toEqual(["GRM_OFFERS"]);
    expect(result.categoryMatches?.find((match) => match.category === "GRM_OFFERS")?.role).toBe(
      "safety",
    );
    expect(result.trx).toBeNull();
    expect(result.trxTypeRich).toBeNull();
    expect(result.cashback).toBeNull();
    expect(result.discount).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("does not hide a grammar-proven bank debit merely because its merchant says offer", () => {
    const result = engine.parse(
      "Rs.500 debited from A/c XX1234 at Offer Store. Available balance Rs.4500.",
      "VM-HDFCBK",
    );

    expect(result.matchedCategories).toEqual(["GRM_OFFERS", "GRM_BANK"]);
    expect(result.trx).toBe("500");
    expect(result.trxTypeRich).toBe("EXPENSE");
    expect(result.categoryMatches?.filter((match) => match.tags.trx !== undefined)).toHaveLength(1);
  });

  it("records failed transactions as notification safety evidence", () => {
    const result = engine.parse("Transaction of Rs.500 failed due to insufficient funds.");

    expect(result.matchedCategories).toEqual(["GRM_NOTIF"]);
    expect(
      result.categoryMatches?.find((match) => match.category === "GRM_NOTIF")?.evidence,
    ).toContainEqual({ kind: "policy", value: "inactive-status" });
    expect(result.trx).toBeNull();
    expect(result.trxTypeRich).toBeNull();
  });

  it.each(["Payment of Rs.500 is pending with the bank.", "Debit of Rs.500 failed."])(
    "does not count an inactive operation: %s",
    (message) => {
      const result = engine.parse(message, "VM-HDFCBK");

      expect(result.matchedCategories).toContain("GRM_NOTIF");
      expect(result.trx).toBeNull();
      expect(result.trxTypeRich).toBeNull();
    },
  );

  it("keeps an OTP about a recharge safety-only", () => {
    const result = engine.parse("OTP 123456 is for recharge of Rs.399. Do not share it.");

    expect(result.matchedCategories).toEqual(["GRM_OTP"]);
    expect(result.trx).toBeNull();
    expect(result.rechargeAmount).toBeNull();
  });

  it("keeps internal grammars out of the product category surface", () => {
    for (const category of ["GRM_VOID", "GRM_CALLALERTS", "GRM_TELECOM"] as const) {
      const result = engine.parse("Generic service information.", "", category);
      expect(result.category).toBeNull();
      expect(result.matchedCategories).toEqual([]);
      expect(result.categoryMatches).toEqual([]);
    }
  });
});
