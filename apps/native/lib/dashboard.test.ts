import { describe, it, expect } from "vitest";
import { deriveDashboard, isRecurringTransaction } from "./dashboard";
import type { ParsedSms } from "./sms";
import { createMalanaEngine, type MalanaResult } from "@zeeya/parser/malana";

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

describe("deriveDashboard — account identity", () => {
  it("estimates the current balance from captured transactions after the latest report", () => {
    const messages: ParsedSms[] = [
      sms("balance", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("expense", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: "XX1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({
      balance: 1000,
      estimatedBalance: 800,
      capturedChange: -200,
      capturedTransactionCount: 1,
      estimatedAsOf: 2000,
    });
  });

  it("adds captured income and ignores transactions in another currency", () => {
    const messages: ParsedSms[] = [
      sms("balance", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
        currency: "INR",
      }),
      sms("income", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        trx: "300.00",
        trxTypeRich: "INCOME",
        acc: "XX1234",
        currency: "INR",
      }),
      sms("foreign-expense", "VM-TEST-A", 3000, {
        bankName: "Test Bank",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        acc: "XX1234",
        currency: "USD",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({
      estimatedBalance: 1300,
      capturedChange: 300,
      capturedTransactionCount: 1,
    });
  });

  it("reconciles a new reported balance against captured activity since the previous report", () => {
    const messages: ParsedSms[] = [
      sms("old-balance", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("captured-expense", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: "XX1234",
      }),
      sms("new-balance", "VM-TEST-A", 3000, {
        bankName: "Test Bank",
        bal: "700.00",
        acc: "XX1234",
      }),
      sms("newer-expense", "VM-TEST-A", 4000, {
        bankName: "Test Bank",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
        acc: "XX1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({
      balance: 700,
      estimatedBalance: 650,
      capturedChange: -50,
      capturedTransactionCount: 1,
      reconciliationDelta: -100,
    });
  });

  it("assigns an account-less transaction to the sole account for that bank and currency", () => {
    const messages: ParsedSms[] = [
      sms("balance", "VM-BALANCE", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
        currency: "INR",
      }),
      sms("expense", "VM-TRANSACTION", 2000, {
        bankName: "Test Bank",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: null,
        currency: "INR",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({ estimatedBalance: 800, capturedTransactionCount: 1 });
  });

  it("does not assign an account-less transaction when multiple accounts are possible", () => {
    const messages: ParsedSms[] = [
      sms("balance-1", "VM-BALANCE", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("balance-2", "VM-BALANCE", 1000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX5678",
      }),
      sms("expense", "VM-TRANSACTION", 2000, {
        bankName: "Test Bank",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: null,
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts.map((account) => account.estimatedBalance).sort((a, b) => a - b)).toEqual([
      1000, 2000,
    ]);
    expect(accounts.every((account) => account.capturedTransactionCount === 0)).toBe(true);
  });

  it("applies duplicate referenced transaction notifications to the estimate only once", () => {
    const transaction = {
      bankName: "Test Bank",
      trx: "200.00",
      trxTypeRich: "EXPENSE" as const,
      acc: "XX1234",
      ref: "REF-123",
    };
    const messages: ParsedSms[] = [
      sms("balance", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("expense-1", "VM-TEST-A", 2000, transaction),
      sms("expense-2", "VM-TEST-A", 3000, transaction),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({ estimatedBalance: 800, capturedTransactionCount: 1 });
  });

  it("does not merge unknown accounts from different bank sender IDs", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: null,
      }),
      sms("2", "VM-TEST-B", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: null,
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.sender).sort()).toEqual(["VM-TEST-A", "VM-TEST-B"]);
  });

  it("keeps unknown-account history together for the same bank sender", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: null,
      }),
      sms("2", "vm-test-a", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: null,
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ balance: 2000, last4: null, sender: "vm-test-a" });
    expect(accounts[0]!.history).toHaveLength(2);
  });

  it("merges different mask styles when the exact trailing digits match", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("2", "VM-TEST-B", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "**1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ balance: 2000, last4: "1234" });
    expect(accounts[0]!.history).toHaveLength(2);
  });

  it("does not pad or suffix-merge partial account digits", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX12",
      }),
      sms("2", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX0012",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.last4).sort()).toEqual(["0012", "12"]);
  });

  it("does not merge an unknown account into a numbered account from the same sender", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: null,
      }),
      sms("2", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.last4)).toContain(null);
    expect(accounts.map((account) => account.last4)).toContain("1234");
  });
});

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
// with a real cross-message check against the derived Dashboard. These are
// integration tests over the mandate + inferred-subscription composition —
// the subscription heuristic itself is unit-tested in subscriptions.test.ts.
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

  it("is false for a one-off transaction with no mandate and no repeat", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", 1000, { trxTypeRich: "EXPENSE", trx: "50.00", vendor: "Random Store" }),
    ];
    const dashboard = deriveDashboard(messages);

    expect(isRecurringTransaction(messages[0]!, dashboard)).toBe(false);
  });
});

describe("deriveDashboard — duplicate referenced transactions", () => {
  it("deduplicates references extracted by Malana from raw SMS text", () => {
    const engine = createMalanaEngine();
    const body = "Rs.500 debited from A/c XX1234. Ref No 123456789012.";
    const messages: ParsedSms[] = [
      {
        id: "sms-1",
        sender: "VM-TESTBK",
        body,
        date: now,
        result: engine.parse(body, "VM-TESTBK"),
      },
      {
        id: "sms-2",
        sender: "VM-TESTBK",
        body,
        date: now + 1000,
        result: engine.parse(body, "VM-TESTBK"),
      },
    ];

    const { monthExpenseByCurrency, recent } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(500);
    expect(recent.map((message) => message.id)).toEqual(["sms-2"]);
  });

  it("counts duplicate notifications for one referenced transaction only once", () => {
    const transaction = {
      bankName: "Test Bank",
      acc: "XX1234",
      trxType: "debit",
      trxTypeRich: "EXPENSE" as const,
      trx: "500.00",
      currency: "INR",
      ref: "REF-123",
    };
    const messages: ParsedSms[] = [
      sms("sms-1", "VM-TESTBK", now, transaction),
      sms("sms-2", "VM-TESTBK", now + 1000, transaction),
    ];

    const { monthExpenseByCurrency, recent } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(500);
    expect(recent).toHaveLength(1);
  });

  it("keeps the newest notification when duplicate input is not pre-sorted", () => {
    const transaction = {
      bankName: "Test Bank",
      acc: "XX1234",
      trxTypeRich: "EXPENSE" as const,
      trx: "500.00",
      currency: "INR",
      ref: "REF-123",
    };
    const messages: ParsedSms[] = [
      sms("older", "VM-TESTBK", now - 1000, transaction),
      sms("newer", "VM-TESTBK", now, transaction),
    ];

    const { recent } = deriveDashboard(messages);

    expect(recent.map((message) => message.id)).toEqual(["newer"]);
  });

  it("does not merge a debit with its refund when they share a reference", () => {
    const messages: ParsedSms[] = [
      sms("debit", "VM-TESTBK", now - 1000, {
        bankName: "Test Bank",
        acc: "XX1234",
        trxType: "debit",
        trxTypeRich: "EXPENSE",
        trx: "500.00",
        currency: "INR",
        ref: "REF-123",
      }),
      sms("refund", "VM-TESTBK", now, {
        bankName: "Test Bank",
        acc: "XX1234",
        trxType: "credit",
        trxTypeRich: "INCOME",
        trx: "500.00",
        currency: "INR",
        ref: "REF-123",
      }),
    ];

    const { monthExpenseByCurrency, monthIncomeByCurrency, recent } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(500);
    expect(monthIncomeByCurrency["INR"]).toBe(500);
    expect(recent).toHaveLength(2);
  });

  it("does not guess that identical no-reference transactions are duplicates", () => {
    const transaction = {
      bankName: "Test Bank",
      acc: "XX1234",
      trxTypeRich: "EXPENSE" as const,
      trx: "500.00",
      currency: "INR",
    };
    const messages: ParsedSms[] = [
      sms("sms-1", "VM-TESTBK", now - 1000, transaction),
      sms("sms-2", "VM-TESTBK", now, transaction),
    ];

    const { monthExpenseByCurrency, recent } = deriveDashboard(messages);

    expect(monthExpenseByCurrency["INR"]).toBe(1000);
    expect(recent).toHaveLength(2);
  });

  it("keeps matching references separate across accounts and currencies", () => {
    const base = {
      bankName: "Test Bank",
      trxTypeRich: "EXPENSE" as const,
      trx: "500.00",
      ref: "REF-123",
    };
    const messages: ParsedSms[] = [
      sms("inr-1", "VM-TESTBK", now, { ...base, acc: "XX1234", currency: "INR" }),
      sms("inr-2", "VM-TESTBK", now, { ...base, acc: "XX5678", currency: "INR" }),
      sms("usd", "VM-TESTBK", now, { ...base, acc: "XX1234", currency: "USD" }),
    ];

    const { monthExpenseByCurrency, recent } = deriveDashboard(messages);

    expect(monthExpenseByCurrency).toEqual({ INR: 1000, USD: 500 });
    expect(recent).toHaveLength(3);
  });

  it("deduplicates referenced neutral wallet movements in recent activity", () => {
    const transaction = {
      bankName: "Test Wallet",
      acc: "XX1234",
      trxTypeRich: "WALLET_CREDIT" as const,
      trx: "500.00",
      currency: "INR",
      ref: "REF-123",
    };
    const messages: ParsedSms[] = [
      sms("sms-1", "VM-WALLET", now - 1000, transaction),
      sms("sms-2", "VM-WALLET", now, transaction),
    ];

    const { recent } = deriveDashboard(messages);

    expect(recent.map((message) => message.id)).toEqual(["sms-2"]);
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

// Light integration coverage proving deriveDashboard actually wires
// subscriptions.ts's output through — the heuristic's own cadence/
// tolerance/recency behavior is exhaustively covered in subscriptions.test.ts.
describe("deriveDashboard — subscriptions integration", () => {
  it("does not infer a subscription from duplicate notifications sharing a reference", () => {
    const transaction = {
      bankName: "Test Bank",
      acc: "XX1234",
      trxTypeRich: "EXPENSE" as const,
      trx: "199.00",
      currency: "INR",
      ref: "REF-123",
      vendor: "Netflix",
    };
    const messages: ParsedSms[] = [
      sms("sms-1", "VM-TESTBK", now - 30 * DAY_MS, transaction),
      sms("sms-2", "VM-TESTBK", now, transaction),
    ];

    const { subscriptions } = deriveDashboard(messages);

    expect(subscriptions).toHaveLength(0);
  });

  it("surfaces a recognized recurring charge in dashboard.subscriptions", () => {
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
