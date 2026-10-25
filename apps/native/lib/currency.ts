import { ungroupDecimal } from "@zeeya/parser/normalize";

// Minor-unit exponent for exactly the currencies the Malana engine's
// CurrencyRegistry can produce — see this file's own currency.test.ts
// parity test, which constructs a real CurrencyRegistry against the real
// seed and asserts these keys match it exactly, so this cannot silently
// drift again the way it already did once.
//
// This is deliberately scoped to Malana specifically (createMalanaEngine,
// what apps/native/lib/sms.ts actually uses for on-device parsing), not
// "@zeeya/parser" as a whole — the package's separate legacy per-bank
// parsers (packages/parser/src/banks/, see e.g. src/tests/icici.test.ts)
// are a different code path with no CurrencyRegistry involved at all, and
// aren't reachable from native ingestion.
const MINOR_UNIT_EXPONENT: Readonly<Record<string, number>> = {
  AED: 2,
  AUD: 2,
  CAD: 2,
  CNY: 2,
  EGP: 2,
  EUR: 2,
  GBP: 2,
  GHS: 2,
  HKD: 2,
  INR: 2,
  JPY: 0,
  KES: 2,
  KRW: 0,
  LKR: 2,
  NGN: 2,
  NZD: 2,
  SEK: 2,
  SGD: 2,
  USD: 2,
};

export function minorUnitExponent(currencyCode: string): number {
  const exponent = MINOR_UNIT_EXPONENT[currencyCode];
  if (exponent === undefined) {
    throw new Error(`Unsupported currency code for minor-unit conversion: ${currencyCode}`);
  }
  return exponent;
}

// Exposed only so currency.test.ts's parity check can compare this table's
// actual key set against a real CurrencyRegistry's real output — comparing
// against a second, separately hand-typed list in the test file would just
// be two hardcoded lists agreeing with each other, not a genuine mechanical
// check against Malana itself.
export function supportedCurrencyCodes(): readonly string[] {
  return Object.keys(MINOR_UNIT_EXPONENT);
}

// Converts a parser-produced decimal amount string (MalanaResult.trx/bal/
// etc. are always strings, e.g. "5,000.00", "999") directly to an integer
// in minor units via string/BigInt arithmetic — never floating point.
// `1.005 * 100` is already imprecise in JS (evaluates to
// 100.49999999999999) before any rounding runs, so going through
// parseFloat at all would reintroduce the exact error this column exists to
// avoid. Grouping rules live in @zeeya/parser/normalize so every reader
// accepts the same Western and Indian comma patterns.
export function toMinorUnits(rawAmount: string, currencyCode: string): number {
  const exponent = minorUnitExponent(currencyCode);
  const normalized = ungroupDecimal(rawAmount);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integerPart, fractionalPart = ""] = unsigned.split(".");

  if (fractionalPart.length > exponent) {
    throw new Error(
      `${JSON.stringify(rawAmount)} has more precision than ${currencyCode} supports (${exponent} decimal place${exponent === 1 ? "" : "s"})`,
    );
  }

  const paddedFractional = fractionalPart.padEnd(exponent, "0");
  const digits = `${integerPart}${paddedFractional}`.replace(/^0+(?=\d)/, "");
  const minorUnits = BigInt(digits) * (negative ? -1n : 1n);

  if (
    minorUnits > BigInt(Number.MAX_SAFE_INTEGER) ||
    minorUnits < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`${JSON.stringify(rawAmount)} is too large to represent as a safe integer`);
  }

  const result = Number(minorUnits);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${JSON.stringify(rawAmount)} did not convert to a safe integer`);
  }
  return result;
}

export function fromMinorUnits(amountMinorUnits: number, currencyCode: string): number {
  if (!Number.isSafeInteger(amountMinorUnits)) {
    throw new Error(`Not a valid minor-units integer: ${amountMinorUnits}`);
  }
  return amountMinorUnits / 10 ** minorUnitExponent(currencyCode);
}
