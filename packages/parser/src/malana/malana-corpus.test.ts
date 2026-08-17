import { describe, expect, it } from "vitest";
import { seedData } from "./index.js";
import { MalanaEngine } from "./malana.js";
import type { MalanaResult } from "./types.js";

type FinancialExpectation = Partial<
  Pick<
    MalanaResult,
    "category" | "trx" | "bal" | "acc" | "trxTypeRich" | "currency" | "otp" | "ref"
  >
>;

interface GoldenSmsCase {
  name: string;
  message: string;
  sender?: string;
  expected: FinancialExpectation;
}

// Expected values are deliberately literal and human-reviewed. Never derive
// this table from parser output: it is the independent oracle used to measure
// whether parser changes improve or regress budget-facing fields.
const GOLDEN_SMS_CASES: GoldenSmsCase[] = [
  {
    name: "debit with an available balance",
    message: "Rs.500 debited from A/c XX1234. Available balance Rs.4500.",
    expected: {
      trx: "500",
      bal: "4500",
      acc: "XX1234",
      trxTypeRich: "EXPENSE",
      currency: "INR",
    },
  },
  {
    name: "debit reference is available for downstream duplicate detection",
    message: "Rs.500 debited from A/c XX1234. Ref No 123456789012.",
    expected: {
      trx: "500",
      trxTypeRich: "EXPENSE",
      ref: "123456789012",
    },
  },
  {
    name: "balance-only notification",
    message: "Available balance in A/c XX1234 is INR 25000.",
    expected: {
      trx: null,
      bal: "25000",
      currency: "INR",
    },
  },
  {
    name: "foreign-currency balance-only notification",
    message: "Available balance in A/c XX1234 is USD 25000.",
    expected: {
      trx: null,
      bal: "25000",
      currency: "USD",
    },
  },
  {
    name: "OTP is not a financial transaction",
    message: "Your OTP is 456789. Valid for 10 minutes. Do not share it.",
    sender: "VM-HDFCBK",
    expected: {
      category: "GRM_OTP",
      trx: null,
      trxTypeRich: null,
    },
  },
  {
    name: "negated debit is not a financial transaction",
    message: "Rs.500 was not debited from A/c XX1234.",
    expected: {
      trx: null,
      trxTypeRich: null,
    },
  },
  {
    name: "failed debit is not a financial transaction",
    message: "Transaction of Rs.500 failed due to insufficient funds.",
    expected: {
      trx: null,
      trxTypeRich: null,
    },
  },
  {
    name: "declined debit is not a financial transaction",
    message: "Rs.500 debit transaction was declined due to insufficient funds.",
    expected: {
      trx: null,
      trxTypeRich: null,
    },
  },
  {
    name: "status-like merchant text does not suppress a completed debit",
    message: "Rs.500 was debited at Declined Cafe from A/c XX1234.",
    expected: {
      trx: "500",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "negated bank transfer is not a financial transaction",
    message: "Rs.500 was not transferred via NEFT from A/c XX1234.",
    expected: {
      trx: null,
      trxTypeRich: null,
    },
  },
  {
    name: "transaction currency follows the transaction amount, not an earlier balance",
    message: "Available balance INR 5000. USD 50 was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "USD",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "seed currency code attached directly to its amount",
    message: "CAD50 was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "CAD",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "currency code after the transaction amount stays associated",
    message: "Available balance INR 5000. 50 USD was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "USD",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "a transaction does not inherit a later balance currency",
    message: "INR 50 was debited from A/c XX1234. Available balance USD 5000.",
    expected: {
      trx: "50",
      currency: "INR",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "alphabetic currency aliases do not match inside words",
    message: "FRAUD50 alert. Rs.20 was debited from A/c XX1234.",
    expected: {
      trx: "20",
      currency: "INR",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "existing won-symbol prefix remains supported",
    message: "₩50 was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "KRW",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "existing NGN amount suffix remains supported",
    message: "50 NGN was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "NGN",
      trxTypeRich: "EXPENSE",
    },
  },
  {
    name: "single-symbol suffix consumes only the currency symbol",
    message: "50 € was debited from A/c XX1234.",
    expected: {
      trx: "50",
      currency: "EUR",
      trxTypeRich: "EXPENSE",
    },
  },
];

describe("Malana golden SMS corpus", () => {
  const engine = new MalanaEngine(seedData);

  for (const sms of GOLDEN_SMS_CASES) {
    it(sms.name, () => {
      expect(engine.parse(sms.message, sms.sender)).toMatchObject(sms.expected);
    });
  }

  it("derives amount prefixes from the supplied seed dictionary", () => {
    const customSeed = structuredClone(seedData);
    customSeed.TOKENS["CRNCY[crncy]"] += ",bucks|nzd";
    const customEngine = new MalanaEngine(customSeed);

    expect(customEngine.parse("bucks50 was debited from A/c XX1234.")).toMatchObject({
      trx: "50",
      currency: "NZD",
      trxTypeRich: "EXPENSE",
    });
  });

  it("decodes annotated multi-word keyword values from the seed", () => {
    const result = engine.parse("picked up", "", "GRM_DELIVERY");

    expect(result.tokens).toContainEqual(
      expect.objectContaining({
        type: "RETPICKUP",
        text: "picked up",
        values: expect.objectContaining({
          _norm: "pickedup",
          status: "pickedup",
          negation: "negatable",
          tense: "past",
          pos: "verb",
        }),
      }),
    );

    expect(engine.parse("expire").tokens).toContainEqual(
      expect.objectContaining({
        type: "EXPIRE",
        text: "expire",
        values: expect.objectContaining({ _norm: "expire", tense: "past", pos: "verb" }),
      }),
    );
  });

  it("tokenizes an HTTPS link as the seed's URL terminal", () => {
    const result = engine.parse("https://bank.example/transaction?id=123");

    expect(result.tokens).toContainEqual(
      expect.objectContaining({
        type: "URL",
        raw: "https://bank.example/transaction?id=123",
        text: "https://bank.example/transaction?id=123",
      }),
    );

    expect(engine.parse("www.bank.example/pay.").tokens).toContainEqual(
      expect.objectContaining({
        type: "URL",
        raw: "www.bank.example/pay",
        text: "www.bank.example/pay",
      }),
    );
  });
});
