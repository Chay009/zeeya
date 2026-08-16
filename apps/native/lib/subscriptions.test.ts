import { describe, it, expect } from "vitest";
import {
  deriveSubscriptions,
  isInferredRecurringTransaction,
  subscriptionMonthlyTotals,
} from "./subscriptions";
import type { ParsedSms } from "./sms";
import type { MalanaResult } from "@zeeya/parser/malana";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

// Minimal MalanaResult builder — only sets the fields deriveSubscriptions
// actually reads, everything else defaults to null/false so each test stays
// focused on what it's verifying.
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

describe("deriveSubscriptions — cadence and deduplication", () => {
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
    expect(deriveSubscriptions(messages)).toHaveLength(0);
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
    expect(deriveSubscriptions(messages)).toHaveLength(0);
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
    expect(deriveSubscriptions(messages)).toHaveLength(0);
  });

  it("recognizes two occurrences ~30 days apart as 'possible'", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.merchant).toBe("Netflix");
    expect(subscriptions[0]!.count).toBe(2);
    // Only one gap has been confirmed — real, but not yet confident.
    expect(subscriptions[0]!.confidence).toBe("possible");
  });

  it("is 'likely' once a third occurrence confirms a second consecutive monthly gap", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 60 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("3", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.count).toBe(3);
    expect(subscriptions[0]!.confidence).toBe("likely");
  });

  it("drops a subscription that hasn't renewed in over 60 days, even with a clean prior history", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 400 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now - 370 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
    ];
    expect(deriveSubscriptions(messages)).toHaveLength(0);
  });

  it("tolerates a small price change but rejects a wildly different amount", () => {
    const tolerant: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      // A ~5% price bump — still the same subscription.
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "209.00", vendor: "Netflix" }),
    ];
    expect(deriveSubscriptions(tolerant)).toHaveLength(1);

    const unrelated: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "999.00", vendor: "Netflix" }),
    ];
    expect(deriveSubscriptions(unrelated)).toHaveLength(0);
  });

  it("merges merchant name variants (case, whitespace, trailing '.com')", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "NETFLIX",
      }),
      sms("2", "VM-TESTBK", now, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix.com",
      }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.count).toBe(2);
  });

  it("excludes ATM withdrawals, transfers, and investments from subscription candidacy", () => {
    for (const trxTypeRich of ["ATM_WITHDRAWAL", "TRANSFER", "INVESTMENT"] as const) {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
          trxTypeRich,
          trx: "500.00",
          vendor: "Repeats Monthly",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich, trx: "500.00", vendor: "Repeats Monthly" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(0);
    }
  });

  it("excludes a message already tied to a tracked UPI mandate", () => {
    const messages: ParsedSms[] = [
      sms("1", "VA-SBIUPI-S", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "OpenAI LLC",
        mandateId: "umn-A",
      }),
      sms("2", "VA-SBIUPI-S", now, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "OpenAI LLC",
        mandateId: "umn-A",
      }),
    ];
    expect(deriveSubscriptions(messages)).toHaveLength(0);
  });

  it("displays the latest charge's amount, not the first historical one", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "209.00", vendor: "Netflix" }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.amount).toBe(209);
  });

  it("recovers a valid trailing run after an earlier broken cadence", () => {
    const messages: ParsedSms[] = [
      // An isolated, unrelated-looking earlier charge — 140 days before the
      // next one, well outside any recurring band.
      sms("1", "VM-TESTBK", now - 200 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      // A clean, real monthly run starts here, unrelated to the above.
      sms("2", "VM-TESTBK", now - 60 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("3", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("4", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(1);
    // Only the 3 occurrences forming the unbroken trailing run count — the
    // earlier isolated charge doesn't inflate the count or vouch for it.
    expect(subscriptions[0]!.count).toBe(3);
    expect(subscriptions[0]!.confidence).toBe("likely");
  });

  describe("boundaries", () => {
    it("includes a gap of exactly 20 days", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 20 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(1);
    });

    it("excludes a gap of 19 days", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 19 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(0);
    });

    it("includes a gap of exactly 45 days", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 45 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(1);
    });

    it("excludes a gap of 46 days", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 46 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(0);
    });

    it("includes a subscription last seen exactly 60 days ago", () => {
      // deriveSubscriptions's own `new Date()` would run a moment after `now`
      // was captured above, so an exact-boundary case needs an explicit
      // reference clock instead of racing that drift.
      const clock = new Date(now);
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 90 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now - 60 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
      ];
      expect(deriveSubscriptions(messages, clock)).toHaveLength(1);
    });

    it("excludes a subscription last seen 61 days ago", () => {
      const clock = new Date(now);
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 91 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now - 61 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "199.00",
          vendor: "Netflix",
        }),
      ];
      expect(deriveSubscriptions(messages, clock)).toHaveLength(0);
    });

    it("includes an amount exactly 10% higher", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "100.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "110.00", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(1);
    });

    it("excludes an amount just over 10% higher", () => {
      const messages: ParsedSms[] = [
        sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
          trxTypeRich: "EXPENSE",
          trx: "100.00",
          vendor: "Netflix",
        }),
        sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "110.01", vendor: "Netflix" }),
      ];
      expect(deriveSubscriptions(messages)).toHaveLength(0);
    });
  });
});

describe("subscriptionMonthlyTotals", () => {
  it("sums only 'likely' subscriptions, never 'possible' ones", () => {
    const likely: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 60 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("3", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const possible: ParsedSms[] = [
      sms("4", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "50.00",
        vendor: "Random Gym",
      }),
      sms("5", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "50.00", vendor: "Random Gym" }),
    ];
    const subscriptions = deriveSubscriptions([...likely, ...possible]);
    expect(subscriptions.map((s) => s.confidence).sort()).toEqual(["likely", "possible"]);

    expect(subscriptionMonthlyTotals(subscriptions)["INR"]).toBe(199);
  });

  it("returns an empty record when there are no 'likely' subscriptions", () => {
    const possibleOnly: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "50.00",
        vendor: "Random Gym",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "50.00", vendor: "Random Gym" }),
    ];
    const subscriptions = deriveSubscriptions(possibleOnly);

    expect(subscriptionMonthlyTotals(subscriptions)).toEqual({});
  });
});

describe("isInferredRecurringTransaction", () => {
  it("is true when merchant+amount+currency matches within tolerance", () => {
    const messages: ParsedSms[] = [
      sms("1", "VM-TESTBK", now - 30 * DAY_MS, {
        trxTypeRich: "EXPENSE",
        trx: "199.00",
        vendor: "Netflix",
      }),
      sms("2", "VM-TESTBK", now, { trxTypeRich: "EXPENSE", trx: "199.00", vendor: "Netflix" }),
    ];
    const subscriptions = deriveSubscriptions(messages);

    expect(isInferredRecurringTransaction(messages[1]!, subscriptions)).toBe(true);
  });

  it("is false when currency differs from the matched subscription", () => {
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
    const subscriptions = deriveSubscriptions(messages);

    expect(subscriptions).toHaveLength(0);
    expect(isInferredRecurringTransaction(messages[1]!, subscriptions)).toBe(false);
  });

  it("is false for a one-off transaction with no repeat", () => {
    const one = sms("1", "VM-TESTBK", now, {
      trxTypeRich: "EXPENSE",
      trx: "50.00",
      vendor: "Random Store",
    });
    expect(isInferredRecurringTransaction(one, [])).toBe(false);
  });
});
