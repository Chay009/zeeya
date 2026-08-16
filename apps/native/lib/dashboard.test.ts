import { describe, it, expect } from "vitest";
import { deriveDashboard, isRecurringTransaction, trxDirection } from "./dashboard";
import type { ParsedSms } from "./sms";
import type { MalanaResult } from "@zeeya/parser/malana";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

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

  it("is true when merchant+amount+currency matches the guessed Subscriptions list", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[1]!, dashboard)).toBe(true);
  });

  it("is false when merchant+amount match but currency differs", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "20.00",
        vendor: "Netflix",
        currency: "USD",
      }),
      sms("2", "VM-TESTBK", now, {
        trxTypeRich: "EXPENSE",
        trx: "20.00",
        vendor: "Netflix",
        currency: "INR",
      }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(dashboard.subscriptions).toHaveLength(0);
    expect(isRecurringTransaction(messages[1]!, dashboard)).toBe(false);
  });

  it("is false for a one-off transaction with no mandate and no repeat", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", 1000, { trxTypeRich: "EXPENSE", trx: "50.00", vendor: "Random Store" }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[0]!, dashboard)).toBe(false);
  });
});

// trxDirection is the single source of truth dashboard totals and the
// Recent list's sign both read from — previously two independently
// hardcoded lists that had already drifted apart (TRANSFER/RECHARGE/
// INVESTMENT were expenses in neither).
describe("trxDirection", () => {
  it("classifies every debit-shaped type as an expense", () => {
    for (const type of [
      "EXPENSE",
      "AUTO_DEBIT",
      "WALLET_DEBIT",
      "ATM_WITHDRAWAL",
      "TRANSFER",
      "RECHARGE",
      "INVESTMENT",
    ] as const) {
      expect(trxDirection(type)).toBe("expense");
    }
  });

  it("classifies credit-shaped types as income", () => {
    expect(trxDirection("INCOME")).toBe("income");
    expect(trxDirection("SALARY")).toBe("income");
  });

  it("treats a wallet top-up as neutral, not income", () => {
    expect(trxDirection("WALLET_CREDIT")).toBe("neutral");
  });

  it("treats a balance-only notice and null as neutral", () => {
    expect(trxDirection("BALANCE_UPDATE")).toBe("neutral");
    expect(trxDirection(null)).toBe("neutral");
  });
});

describe("deriveDashboard — currency-separated monthly totals", () => {
  it("keeps a TRANSFER debit out of income and counts it as an expense", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now, { trxTypeRich: "TRANSFER", trx: "5000.00" }),
    ];
    const { monthExpenseByCurrency, monthIncomeByCurrency } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(5000);
    expect(monthIncomeByCurrency["INR"]).toBeUndefined();
  });

  it("counts RECHARGE and INVESTMENT as expenses", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now, { trxTypeRich: "RECHARGE", trx: "399.00" }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "INVESTMENT", trx: "2000.00" }),
    ];
    const { monthExpenseByCurrency } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(2399);
  });

  it("does not add a WALLET_CREDIT top-up to income or expense", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now, { trxTypeRich: "WALLET_CREDIT", trx: "500.00" }),
    ];
    const { monthExpenseByCurrency, monthIncomeByCurrency } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBeUndefined();
    expect(monthIncomeByCurrency["INR"]).toBeUndefined();
  });

  it("keeps totals in different currencies separate instead of summing them together", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "1000.00", currency: "INR" }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "50.00", currency: "USD" }),
    ];
    const { monthExpenseByCurrency } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(1000);
    expect(monthExpenseByCurrency["USD"]).toBe(50);
  });

  it("excludes transactions from a different month", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 400 * DAY_MS, { trxTypeRich: "EXPENSE", trx: "1000.00" }),
    ];
    const { monthExpenseByCurrency } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBeUndefined();
  });
});

describe("deriveDashboard — subscription cadence and deduplication", () => {
  it("does not treat two same-day messages as a recurring subscription", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      // A duplicate confirmation SMS for the same charge, minutes later.
      sms("2", "VM-TESTBK", now + 5 * 60_000, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
    ];
    const { subscriptions } = deriveDashboard(messages);

    expect(subscriptions).toHaveLength(0);
  });

  it("does not treat two occurrences a few days apart as monthly", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 3 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "500.00",
        vendor: "Random Store",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "500.00", vendor: "Random Store" }),
    ];
    const { subscriptions } = deriveDashboard(messages);

    expect(subscriptions).toHaveLength(0);
  });

  it("does not treat two occurrences a year apart as monthly", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 365 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "500.00",
        vendor: "Annual Fee",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "500.00", vendor: "Annual Fee" }),
    ];
    const { subscriptions } = deriveDashboard(messages);

    expect(subscriptions).toHaveLength(0);
  });

  it("recognizes two occurrences ~30 days apart as a subscription", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const { subscriptions } = deriveDashboard(messages);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.merchant).toBe("Netflix");
    expect(subscriptions[0]!.count).toBe(2);
  });

  it("does not double-count a mandate-linked recurring debit as a heuristic Subscription", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "OpenAI LLC",
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateEvent: "active",
      }),
      sms("2", "VA-SBIUPI-S", now, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "OpenAI LLC",
        mandateId: "umn-A",
        mandateMerchant: "OpenAI LLC",
        mandateEvent: "active",
      }),
    ];
    const { subscriptions, mandates } = deriveDashboard(messages);

    expect(mandates).toHaveLength(1);
    expect(subscriptions).toHaveLength(0);
  });
});
