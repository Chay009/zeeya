import { createMalanaEngine, type MalanaResult } from "@zeeya/parser/malana";
import { afterEach, describe, expect, it } from "vitest";
import { deriveDashboard } from "../../lib/dashboard";
import type { TransactionSummary } from "../../lib/dashboard-data";
import type { ParsedSms } from "../../lib/sms";
import { createHomePreviewData, summarizeCaughtUpTransactions } from "./data";

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
      capturedExpense: "−₹ 225",
      capturedChange: "−₹ 225",
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
      balance: "₹ 900",
      // The total sums what the card shows, not the stale bank reading.
      balanceMinorUnits: 90_000,
      reportedBalance: "₹ 1,000",
      capturedExpense: "−₹ 100",
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
      capturedExpense: "−₹ 50",
      capturedTransactionCount: 1,
    });
  });
});

describe("createHomePreviewData - transaction categories", () => {
  it("uses verified SQL aggregates when they are available", () => {
    const now = new Date(Date.UTC(2026, 7, 24, 6));
    const message: ParsedSms = {
      id: "sql-aggregate-transaction",
      sender: "VM-TESTBK",
      body: "",
      date: now.getTime(),
      result: minimalResult({
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
      }),
    };

    const home = createHomePreviewData(deriveDashboard([message], now), true, now, undefined, {
      monthTotals: {
        incomeByCurrency: { INR: 999 },
        expenseByCurrency: { INR: 123.45 },
      },
      categoryTotalsByCurrency: {
        INR: [{ category: "Food", totalMinorUnits: 12345 }],
      },
    });

    expect(home.cashflow.income).toBe("₹ 999");
    expect(home.cashflow.expense).toBe("₹ 123.45");
    expect(home.cashflow.categories[0]).toMatchObject({ label: "Food", amount: "₹ 123.45" });
  });

  it("does not substitute derived totals while the aggregate source is unavailable", () => {
    const now = new Date(Date.UTC(2026, 7, 24, 6));
    const message: ParsedSms = {
      id: "aggregate-source-loading",
      sender: "VM-TESTBK",
      body: "",
      date: now.getTime(),
      result: minimalResult({
        bankName: "Test Bank",
        acc: "XX1234",
        trx: "10.00",
        trxTypeRich: "EXPENSE",
        merchantCategory: "Food",
      }),
    };

    const home = createHomePreviewData(deriveDashboard([message], now), true, now);

    expect(home.cashflow.income).toBe("—");
    expect(home.cashflow.expense).toBe("—");
    expect(home.cashflow.categories).toEqual([]);
  });

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

describe("summarizeCaughtUpTransactions", () => {
  it("summarizes bounded SQL transaction rows without raw parser data", () => {
    const row: TransactionSummary = {
      id: "caught-up",
      date: 1,
      amountMinorUnits: 12345,
      currency: "INR",
      direction: "expense",
      accountId: null,
      trxTypeRich: "EXPENSE",
      vendor: "Fallback vendor",
      brandName: "Preferred brand",
      category: "Shopping",
      ref: null,
      bankName: "Bank",
      mandateId: null,
    };

    expect(summarizeCaughtUpTransactions([row])).toEqual([
      {
        key: "caught-up",
        name: "Preferred brand",
        amount: "−₹ 123.45",
        direction: "expense",
      },
    ]);
  });
});

describe("createHomePreviewData — verified-domain-only logo lookup (issue #15)", () => {
  const ORIGINAL_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;

  afterEach(() => {
    if (ORIGINAL_SERVER_URL === undefined) delete process.env.EXPO_PUBLIC_SERVER_URL;
    else process.env.EXPO_PUBLIC_SERVER_URL = ORIGINAL_SERVER_URL;
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

  // An unrecognized merchant never had a fuzzy-search fallback to lose —
  // it always gets the deterministic tile, token configured or not, since
  // there's no verified domain to look up.
  it("has no img for an unrecognized merchant even when logos are configured", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    const home = createHomePreviewData(deriveDashboard([messageFor("Zomato")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Zomato");

    expect(item).toBeDefined();
    expect(item!.img).toBeUndefined();
  });

  it("has no img for a curated brand when no server URL is configured", () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    const home = createHomePreviewData(deriveDashboard([messageFor("Swiggy")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Swiggy");

    expect(item).toBeDefined();
    expect(item!.img).toBeUndefined();
  });

  it("uses the verified domain for a curated brand's logo img once logos are configured", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    const home = createHomePreviewData(deriveDashboard([messageFor("Swiggy")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Swiggy");

    expect(item!.img).toBe(
      "https://api.test/logos/swiggy.com.png",
    );
  });

  it("still keeps the curated tile color for a known brand alongside its verified-domain image", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    const home = createHomePreviewData(deriveDashboard([messageFor("Swiggy")]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Swiggy");

    // Swiggy's curated tile color from knownBrandStyles, unchanged.
    expect(item!.tile).toBe("#fff0bf");
  });

  it("does NOT attempt any logo lookup for a person's name (bene) even with logos configured — false-positive risk", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    // No brandName/vendor — a plain person-to-person transfer, so
    // merchantName() falls through to bene. A person's name can never
    // match a curated brand entry, so this can only ever get the letter
    // tile — no fuzzy search exists to risk a false-positive match.
    const message: ParsedSms = {
      id: "m1",
      sender: "VM-TESTBK",
      body: "",
      date: Date.now(),
      result: minimalResult({
        bankName: "Test Bank",
        bene: "RAJPUROHIT NAREN",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
    };

    const home = createHomePreviewData(deriveDashboard([message]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "RAJPUROHIT NAREN");

    expect(item).toBeDefined();
    expect(item!.img).toBeUndefined();
  });

  it("does not resolve a logo for the raw bank name a transaction falls back to", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    // No brandName/vendor/bene — falls all the way to bankName. "Test
    // Bank" doesn't match any curated entry, so it stays a plain tile
    // (account cards show the bank's own logo separately, via
    // bankVisualFor, which is unaffected by this).
    const message: ParsedSms = {
      id: "m1",
      sender: "VM-TESTBK",
      body: "",
      date: Date.now(),
      result: minimalResult({
        bankName: "Test Bank",
        trx: "100.00",
        trxTypeRich: "EXPENSE",
      }),
    };

    const home = createHomePreviewData(deriveDashboard([message]), true);
    const item = home.activity.allItems.find((entry) => entry.name === "Test Bank");

    expect(item).toBeDefined();
    expect(item!.img).toBeUndefined();
  });
});
