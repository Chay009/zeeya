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
      sms("income", "VM-TEST-A", 3000, {
        bankName: "Test Bank",
        trx: "300.00",
        trxTypeRich: "INCOME",
        acc: "XX1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({
      balance: 1000,
      estimatedBalance: 1100,
      capturedIncome: 300,
      capturedExpense: 200,
      capturedChange: 100,
      capturedTransactionCount: 2,
      estimatedAsOf: 3000,
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
      capturedIncome: 0,
      capturedExpense: 50,
      capturedChange: -50,
      capturedTransactionCount: 1,
      reconciliationDelta: -100,
    });
  });

  it("preserves reconciliation insights for every interval between balance readings", () => {
    const messages: ParsedSms[] = [
      sms("may-balance", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
      }),
      sms("may-expense", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: "XX1234",
      }),
      sms("june-balance", "VM-TEST-A", 3000, {
        bankName: "Test Bank",
        bal: "700.00",
        acc: "XX1234",
      }),
      sms("june-income", "VM-TEST-A", 4000, {
        bankName: "Test Bank",
        trx: "300.00",
        trxTypeRich: "INCOME",
        acc: "XX1234",
      }),
      sms("july-balance", "VM-TEST-A", 5000, {
        bankName: "Test Bank",
        bal: "1050.00",
        acc: "XX1234",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({ reconciliationDelta: 50 });
    expect(accounts[0]!.history).toMatchObject([
      {
        balance: 1050,
        reconciliation: {
          previousAsOf: 3000,
          capturedIncome: 300,
          capturedExpense: 0,
          capturedChange: 300,
          capturedTransactionCount: 1,
          expectedBalance: 1000,
          delta: 50,
        },
      },
      {
        balance: 700,
        reconciliation: {
          previousAsOf: 1000,
          capturedIncome: 0,
          capturedExpense: 200,
          capturedChange: -200,
          capturedTransactionCount: 1,
          expectedBalance: 800,
          delta: -100,
        },
      },
      { balance: 1000, reconciliation: null },
    ]);
  });

  it("applies an account-less transaction when one bank account is possible", () => {
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

  it("keeps a validated balance estimate when later income omits account digits", () => {
    const messages: ParsedSms[] = [
      sms("feb-balance", "VA-CBSSBI-S", 1000, {
        bankName: "State Bank of India",
        bal: "105614.00",
        acc: "XX7521",
      }),
      sms("income-without-account", "VA-SBIUPI-S", 2000, {
        bankName: "State Bank of India",
        trx: "120000.00",
        trxTypeRich: "INCOME",
        acc: null,
      }),
      sms("expense-with-account", "VA-SBIUPI-S", 3000, {
        bankName: "State Bank of India",
        trx: "25614.00",
        trxTypeRich: "EXPENSE",
        acc: "XX7521",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts[0]).toMatchObject({
      balance: 105614,
      estimatedBalance: 200000,
      capturedIncome: 120000,
      capturedExpense: 25614,
      capturedChange: 94386,
      capturedTransactionCount: 2,
    });
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

  it("keeps BOB balance readings from rotating sender IDs under one bank", () => {
    const messages: ParsedSms[] = [
      sms("1", "JK-BOBSMS-S", 1000, {
        bankName: "Bank of Baroda",
        bal: "28739.94",
        acc: null,
      }),
      sms("2", "JX-BOBSMS-S", 2000, {
        bankName: "Bank of Baroda",
        bal: "28890.45",
        acc: null,
      }),
      sms("3", "JD-BOBSMS-S", 3000, {
        bankName: "  BANK   OF BARODA ",
        bal: "9444.60",
        acc: null,
      }),
      sms("4", "JK-BOBSMS-S", 4000, {
        bankName: "Bank of Baroda",
        bal: "3678.60",
        acc: null,
      }),
    ];

    const { accounts, banks } = deriveDashboard(messages);

    expect(accounts).toHaveLength(0);
    expect(banks).toHaveLength(1);
    expect(banks[0]).toMatchObject({ bankName: "Bank of Baroda", accounts: [] });
    expect(banks[0]!.unassignedReadings.map((reading) => reading.sender)).toEqual([
      "JK-BOBSMS-S",
      "JD-BOBSMS-S",
      "JX-BOBSMS-S",
      "JK-BOBSMS-S",
    ]);
    expect(
      banks[0]!.unassignedReadings.every((reading) => reading.association.kind === "unassigned"),
    ).toBe(true);
  });

  it("keeps earlier and later unknown readings separate when explicit digits later confirm one account", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: null,
      }),
      sms("2", "vm-test-a", 2000, {
        bankName: "Test Bank",
        bal: "2000.00",
        acc: "XX1234",
      }),
      sms("3", "VM-ANOTHER-SENDER", 3000, {
        bankName: "Test Bank",
        bal: "3000.00",
        acc: null,
      }),
    ];

    const { accounts, banks } = deriveDashboard(messages);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ balance: 2000, last4: "1234", sender: "vm-test-a" });
    expect(accounts[0]!.history).toMatchObject([
      { balance: 2000, association: { kind: "confirmed", accountLast4: "1234" } },
    ]);
    expect(banks[0]!.unassignedReadings).toMatchObject([
      {
        balance: 3000,
        association: { kind: "suggested", accountLast4: "1234", reason: "sole-account" },
      },
      { balance: 1000, association: { kind: "suggested", accountLast4: "1234" } },
    ]);
  });

  it("does not suggest a sole confirmed account in another currency", () => {
    const messages: ParsedSms[] = [
      sms("confirmed", "VM-TEST-A", 1000, {
        bankName: "Test Bank",
        bal: "1000.00",
        acc: "XX1234",
        currency: "INR",
      }),
      sms("unknown", "VM-TEST-A", 2000, {
        bankName: "Test Bank",
        bal: "50.00",
        acc: null,
        currency: "USD",
      }),
    ];

    const { banks } = deriveDashboard(messages);

    expect(banks[0]!.unassignedReadings).toMatchObject([
      { balance: 50, currency: "USD", association: { kind: "unassigned" } },
    ]);
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

  it("keeps repeated balance SMS under one account when bank-name formatting differs", () => {
    const june = Date.UTC(2026, 5, 10);
    const july = Date.UTC(2026, 6, 10);
    const messages: ParsedSms[] = [
      sms("june-balance", "VM-SBIINB", june, {
        bankName: "State Bank of India",
        bal: "105614.00",
        acc: "XX7521",
      }),
      sms("july-balance", "VM-SBIINB", july, {
        bankName: "  STATE   BANK OF INDIA ",
        bal: "1999.00",
        acc: "XX7521",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      bankName: "State Bank of India",
      last4: "7521",
      balance: 1999,
      asOf: july,
    });
    expect(accounts[0]!.history).toEqual([
      {
        balance: 1999,
        currency: "INR",
        asOf: july,
        detectedBankName: "  STATE   BANK OF INDIA ",
        detectedAccount: "XX7521",
        association: { kind: "confirmed", accountLast4: "7521" },
        sender: "VM-SBIINB",
        reconciliation: {
          previousAsOf: june,
          capturedIncome: 0,
          capturedExpense: 0,
          capturedChange: 0,
          capturedTransactionCount: 0,
          expectedBalance: 105614,
          delta: -103615,
        },
      },
      {
        balance: 105614,
        currency: "INR",
        asOf: june,
        detectedBankName: "State Bank of India",
        detectedAccount: "XX7521",
        association: { kind: "confirmed", accountLast4: "7521" },
        sender: "VM-SBIINB",
        reconciliation: null,
      },
    ]);
  });

  it("does not broaden transaction attribution when balance bank names are normalized", () => {
    const messages: ParsedSms[] = [
      sms("balance", "VM-SBIINB", 1000, {
        bankName: "State Bank of India",
        bal: "1000.00",
        acc: "XX7521",
      }),
      sms("expense", "VM-SBIINB", 2000, {
        bankName: "STATE BANK OF INDIA",
        trx: "200.00",
        trxTypeRich: "EXPENSE",
        acc: "XX7521",
      }),
    ];

    const { accounts, banks } = deriveDashboard(messages);

    expect(banks).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      balance: 1000,
      estimatedBalance: 1000,
      capturedTransactionCount: 0,
    });
  });

  it("keeps three balance SMS with the same bank and account in one card", () => {
    const messages: ParsedSms[] = [
      sms("may", "VM-SBIINB", Date.UTC(2026, 4, 10), {
        bankName: "State Bank of India",
        bal: "1000",
        acc: "XX7521",
      }),
      sms("june", "VM-SBIINB", Date.UTC(2026, 5, 10), {
        bankName: "State Bank of India",
        bal: "900",
        acc: "XX7521",
      }),
      sms("july", "VM-SBIINB", Date.UTC(2026, 6, 10), {
        bankName: "State Bank of India",
        bal: "800",
        acc: "XX7521",
      }),
    ];

    const { accounts } = deriveDashboard(messages);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.history).toHaveLength(3);
    expect(accounts[0]!.history.map((reading) => reading.balance)).toEqual([800, 900, 1000]);
    expect(accounts[0]!.history.every((reading) => reading.association.kind === "confirmed")).toBe(
      true,
    );
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

  it("keeps an unknown reading unassigned when two confirmed accounts are possible", () => {
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
      sms("3", "VM-TEST-A", 3000, {
        bankName: "Test Bank",
        bal: "3000.00",
        acc: "XX5678",
      }),
    ];

    const { accounts, banks } = deriveDashboard(messages);

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.last4).sort()).toEqual(["1234", "5678"]);
    expect(banks[0]!.unassignedReadings).toMatchObject([
      { balance: 1000, association: { kind: "unassigned" } },
    ]);
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

describe("deriveDashboard — detected bank visibility", () => {
  it("surfaces a bank detected from transaction-only SBI messages", () => {
    const engine = createMalanaEngine();
    const bodies = [
      "Dear UPI user A/C X1234 debited by 50.00 on date 21Aug26 trf to SAMPLE PERSON Refno 123456789012 If not u? call-1800111109 for other services-18001234-SBI",
      "Dear UPI user A/C X1234 debited by 175.00 on date 28Jul26 trf to SAMPLE MERCHANT Refno 123456789013 If not u? call-1800111109 for other services-18001234-SBI",
    ];
    const messages: ParsedSms[] = bodies.map((body, index) => ({
      id: `sbi-${index}`,
      sender: "+916300000000",
      body,
      date: now + index,
      result: engine.parse(body, "+916300000000"),
    }));

    const dashboard = deriveDashboard(messages);

    expect(messages.map((message) => message.result.bankName)).toEqual([
      "State Bank of India",
      "State Bank of India",
    ]);
    expect(dashboard.recent).toHaveLength(2);
    expect(dashboard.detectedAccounts).toEqual([
      expect.objectContaining({
        bankName: "State Bank of India",
        last4: "1234",
        currency: "INR",
      }),
    ]);
  });

  it("does not duplicate a detected account after a balance confirms it", () => {
    const messages: ParsedSms[] = [
      sms("transaction", "VM-TESTBK", 1000, {
        bankName: "Test Bank",
        acc: "X1234",
        trx: "50.00",
        trxTypeRich: "EXPENSE",
      }),
      sms("balance", "VM-TESTBK", 2000, {
        bankName: "Test Bank",
        acc: "XX1234",
        bal: "950.00",
      }),
    ];

    const dashboard = deriveDashboard(messages);

    expect(dashboard.accounts).toHaveLength(1);
    expect(dashboard.detectedAccounts).toHaveLength(0);
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

describe("deriveDashboard categorized activity", () => {
  it("keeps non-transaction category matches in the activity feed", () => {
    const messages: ParsedSms[] = [
      sms("travel", "VM-AIRLINE", now, {
        category: null,
        matchedCategories: ["GRM_TRAVEL"],
        pnr: "ABC123",
      }),
      sms("transaction", "VM-TESTBK", now - 1, {
        matchedCategories: ["GRM_BANK"],
        trxTypeRich: "EXPENSE",
        trx: "500",
      }),
    ];

    const { activity, recent } = deriveDashboard(messages);

    expect(activity.map((message) => message.id)).toEqual(["travel", "transaction"]);
    expect(recent.map((message) => message.id)).toEqual(["transaction"]);
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
