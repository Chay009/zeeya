import { createMalanaEngine, type MalanaResult } from "@zeeya/parser/malana";
import { afterEach, describe, expect, it } from "vitest";
import { deriveDashboard } from "../../lib/dashboard";
import type { ParsedSms } from "../../lib/sms";
import { createHomePreviewData, summarizeNewTransactions } from "./data";

// Minimal MalanaResult builder, same pattern as lib/dashboard.test.ts's own
// — only sets the fields a given test actually reads, everything else
// defaults to null/false.
function minimalResult(overrides: Partial<MalanaResult>): MalanaResult {
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

describe("createHomePreviewData — detected accounts", () => {
  it("tracks SBI transactions before the first reported balance", () => {
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

    expect(home.detectedAccounts).toHaveLength(0);
    expect(home.accounts[0]).toMatchObject({
      bankName: "State Bank of India",
      status: "TRACKING",
      last4: "1234",
      balance: "—",
      reportedBalance: null,
      capturedExpense: "−₹225",
      capturedChange: "−₹225",
      capturedTransactionCount: 2,
    });
  });

  it("anchors at the first reported balance without replaying older transactions", () => {
    const engine = createMalanaEngine();
    const debit = (id: string, amount: number, date: number, ref: string): ParsedSms => {
      const body = `Dear UPI user A/C X1234 debited by ${amount.toFixed(2)} on date 21Aug26 trf to SAMPLE MERCHANT Refno ${ref} If not u? call-1800111109 for other services-18001234-SBI`;
      return {
        id,
        sender: "JD-SBIUPI-S",
        body,
        date,
        result: engine.parse(body, "JD-SBIUPI-S"),
      };
    };
    const balanceBody = "Available balance in A/c XX1234 is Rs. 1000.00 -SBI";
    const balanceResult = engine.parse(balanceBody, "JD-SBIUPI-S");
    const messages: ParsedSms[] = [
      debit("before-1", 50, 1_000, "123456789010"),
      debit("before-2", 175, 2_000, "123456789011"),
      {
        id: "first-balance",
        sender: "JD-SBIUPI-S",
        body: balanceBody,
        date: 3_000,
        result: {
          ...balanceResult,
          category: "GRM_BANK",
          bankName: "State Bank of India",
          acc: "1234",
          bal: "1000.00",
          currency: "INR",
        },
      },
      debit("after", 100, 4_000, "123456789012"),
    ];

    const home = createHomePreviewData(
      deriveDashboard(messages, new Date(5_000)),
      true,
      new Date(5_000),
    );

    expect(home.accounts[0]).toMatchObject({
      status: "CALCULATED",
      balance: "₹900",
      reportedBalance: "₹1,000",
      capturedExpense: "−₹100",
      capturedTransactionCount: 1,
    });
  });

  it("does not attach an account-less transaction to an unanchored account", () => {
    const engine = createMalanaEngine();
    const identifiedBody =
      "Dear UPI user A/C X1234 debited by 50.00 on date 21Aug26 trf to SAMPLE PERSON Refno 123456789020 If not u? call-1800111109 for other services-18001234-SBI";
    const unidentifiedBody =
      "Rs.100.00 debited via UPI Refno 123456789021. If not u? call-1800111109 -SBI";
    const unidentifiedResult = engine.parse(unidentifiedBody, "JD-SBIUPI-S");
    const messages: ParsedSms[] = [
      {
        id: "identified",
        sender: "JD-SBIUPI-S",
        body: identifiedBody,
        date: 1_000,
        result: engine.parse(identifiedBody, "JD-SBIUPI-S"),
      },
      {
        id: "unidentified",
        sender: "JD-SBIUPI-S",
        body: unidentifiedBody,
        date: 2_000,
        result: {
          ...unidentifiedResult,
          category: "GRM_BANK",
          bankName: "State Bank of India",
          acc: null,
          trx: "100.00",
          trxTypeRich: "EXPENSE",
          currency: "INR",
          ref: "123456789021",
        },
      },
    ];

    const home = createHomePreviewData(
      deriveDashboard(messages, new Date(3_000)),
      true,
      new Date(3_000),
    );

    expect(home.accounts[0]).toMatchObject({
      balance: "—",
      capturedExpense: "−₹50",
      capturedTransactionCount: 1,
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

describe("summarizeNewTransactions", () => {
  it("summarizes a real debit and credit with signed amounts and direction", () => {
    const engine = createMalanaEngine();
    const debitBody =
      "Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)";
    const creditBody = "Rs.1000.00 credited to A/c XX1234 on 20-Oct-25 (UPI Ref No 123456789099)";
    const messages: ParsedSms[] = [
      {
        id: "1",
        sender: "VM-HDFCBK",
        body: debitBody,
        date: Date.now(),
        result: engine.parse(debitBody, "VM-HDFCBK"),
      },
      {
        id: "2",
        sender: "VM-HDFCBK",
        body: creditBody,
        date: Date.now(),
        result: engine.parse(creditBody, "VM-HDFCBK"),
      },
    ];

    const summaries = summarizeNewTransactions(messages);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ key: "1", direction: "expense" });
    expect(summaries[0]!.amount).toMatch(/^−/);
    expect(summaries[1]).toMatchObject({ key: "2", direction: "income" });
    expect(summaries[1]!.amount).toMatch(/^\+/);
  });

  it("returns an empty list for an empty input, not a placeholder row", () => {
    expect(summarizeNewTransactions([])).toEqual([]);
  });
});

describe("createHomePreviewData — dynamic logo.dev fallback (issue #15)", () => {
  const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
    else process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = ORIGINAL_TOKEN;
  });

  function messageFor(vendor: string): ParsedSms {
    return {
      id: "m1",
      sender: "VM-TESTBK",
      body: "",
      date: Date.now(),
      result: minimalResult({
        bankName: "Test Bank",
        vendor,
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
    };
  }

  it("has no img for an unrecognized merchant when no logo.dev token is configured", () => {
    delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
    const home = createHomePreviewData(deriveDashboard([messageFor("Zomato")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Zomato");

    expect(item).toBeDefined();
    expect(item!.img).toBeUndefined();
  });

  it("uses a dynamic logo.dev img for an unrecognized merchant once a token is configured", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    const home = createHomePreviewData(deriveDashboard([messageFor("Zomato")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Zomato");

    expect(item!.img).toBe(
      "https://img.logo.dev/Zomato?token=pk_test_token&format=webp&retina=true",
    );
  });

  it("still prefers the curated Swiggy entry over a dynamic lookup even when a token is configured", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    const home = createHomePreviewData(deriveDashboard([messageFor("Swiggy")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Swiggy");

    expect(item!.img).toBe("https://cdn.simpleicons.org/swiggy/FC8019");
  });
});
