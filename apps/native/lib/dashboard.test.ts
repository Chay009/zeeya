import { describe, it, expect } from "vitest";
import { deriveDashboard, isRecurringTransaction } from "./dashboard";
import type { ParsedSms } from "./sms";
import type { MalanaResult } from "@zeeya/parser/malana";

// Minimal MalanaResult builder — only sets the fields deriveDashboard actually
// reads, everything else defaults to null/false so each test stays focused on
// what it's verifying.
function result(overrides: Partial<MalanaResult>): MalanaResult {
  return {
    category: "GRM_BANK",
    tags: {},
    tokens: [],
    bankName: null,
    merchantCategory: null,
    subcategory: null,
    trx: null,
    bal: null,
    acc: null,
    trxType: null,
    trxTypeRich: null,
    currency: "INR",
    isFromCard: false,
    creditLimit: null,
    ref: null,
    bene: null,
    beneAcc: null,
    vendor: null,
    location: null,
    otp: null,
    otpExpiry: null,
    pnr: null,
    flight: null,
    departure: null,
    arrival: null,
    fare: null,
    trainBusNo: null,
    boardingGate: null,
    departureCode: null,
    arrivalCode: null,
    orderNo: null,
    trackingId: null,
    deliveryStatus: null,
    item: null,
    billAmount: null,
    emiAmount: null,
    dueDate: null,
    policyNo: null,
    rechargeAmount: null,
    mandateAmount: null,
    mandateId: null,
    mandateEvent: null,
    mandateMerchant: null,
    cashback: null,
    discount: null,
    offerCode: null,
    offerCategory: null,
    dataLeft: null,
    packBalance: null,
    navValue: null,
    folio: null,
    marginAmount: null,
    brandName: null,
    isOnlineBrand: false,
    upiHandle: null,
    isSpam: false,
    spamScore: 0,
    ...overrides,
  };
}

function sms(id: string, sender: string, date: number, r: Partial<MalanaResult>): ParsedSms {
  return { id, sender, body: "", date, result: result(r) };
}

describe("deriveDashboard — mandates", () => {
  it("groups messages sharing a mandateId into one mandate with full event history", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", 1000, {
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "1999.00",
        mandateEvent: "active",
      }),
      sms("2", "VA-SBIUPI-S", 2000, {
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "1999.00",
        mandateEvent: "cancelled",
      }),
    ];

    const { mandates } = deriveDashboard(messages);

    expect(mandates).toHaveLength(1);
    expect(mandates[0]!.mandateId).toBe("umn-A");
    expect(mandates[0]!.status).toBe("cancelled"); // latest event wins
    expect(mandates[0]!.history).toHaveLength(2);
    expect(mandates[0]!.history[0]!.status).toBe("cancelled"); // newest first
    expect(mandates[0]!.history[1]!.status).toBe("active");
  });

  it("does not merge distinct mandates (different mandateId) for the same merchant", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", 1000, {
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "1999.00",
        mandateEvent: "cancelled",
      }),
      sms("2", "VA-SBIUPI-S", 2000, {
        mandateId: "umn-B",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "499.00",
        mandateEvent: "active",
      }),
    ];

    const { mandates, mandatesByMerchant } = deriveDashboard(messages);

    expect(mandates).toHaveLength(2);
    expect(mandatesByMerchant).toHaveLength(1);
    expect(mandatesByMerchant[0]!.merchant).toBe("OpenAI LLC");
    expect(mandatesByMerchant[0]!.mandates).toHaveLength(2);
  });

  it("groups distinct merchants into separate tree branches", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", 1000, {
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "1999.00",
        mandateEvent: "active",
      }),
      sms("2", "VA-SBIUPI-S", 1000, {
        mandateId: "umn-C",
        mandateMerchant: "Netflix",
        mandateAmount: "649.00",
        mandateEvent: "active",
      }),
    ];

    const { mandatesByMerchant } = deriveDashboard(messages);

    expect(mandatesByMerchant).toHaveLength(2);
    expect(mandatesByMerchant.map((g) => g.merchant).sort()).toEqual(["Netflix", "OpenAI LLC"]);
  });

  it("does not create a mandate entry for messages with no mandateId", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", 1000, { trxTypeRich: "EXPENSE", trx: "500.00", vendor: "Swiggy" }),
    ];

    const { mandates, mandatesByMerchant } = deriveDashboard(messages);

    expect(mandates).toHaveLength(0);
    expect(mandatesByMerchant).toHaveLength(0);
  });
});

// The Recent list's "· Recurring" label used to check a parser field
// (subcategory === "recurring") that detectSubcategory() never actually
// returns — dead code, confirmed by reading enrichment.ts directly. Replaced
// with a real cross-message check against the derived Dashboard.
describe("isRecurringTransaction", () => {
  it("is true when the message's mandateId matches a tracked mandate", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", 1000, {
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateAmount: "1999.00",
        mandateEvent: "active",
      }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[0]!, dashboard)).toBe(true);
  });

  it("is true when merchant+amount matches the guessed Subscriptions list", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", 1000, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      sms("2", "VM-TESTBK", 2000, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[1]!, dashboard)).toBe(true);
  });

  it("is false for a one-off transaction with no mandate and no repeat", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", 1000, { trxTypeRich: "EXPENSE", trx: "50.00", vendor: "Random Store" }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[0]!, dashboard)).toBe(false);
  });
});
