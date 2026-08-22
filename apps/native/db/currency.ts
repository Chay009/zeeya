// Exhaustive minor-unit exponent map — exactly the currencies
// @zeeya/parser's currency-registry.ts can produce, nothing else. An
// unrecognized code is rejected, not defaulted to 2 decimals: the parser
// extracts amounts from arbitrary SMS text, so a false match producing a
// bogus 3-letter code is a real possibility, and silently guessing its
// minor-unit scale would store a wrong value with no way to detect it later.
const MINOR_UNIT_EXPONENT: Readonly<Record<string, number>> = {
  AUD: 2,
  CAD: 2,
  EUR: 2,
  GBP: 2,
  GHS: 2,
  HKD: 2,
  INR: 2,
  JPY: 0,
  KES: 2,
  KRW: 0,
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

const DECIMAL_AMOUNT_RE = /^-?\d+(\.\d+)?$/;

// Converts a parser-produced decimal amount string (MalanaResult.trx/bal/
// etc. are always strings, e.g. "5,000.00", "999") directly to an integer
// in minor units via string/BigInt arithmetic — never floating point.
// `1.005 * 100` is already imprecise in JS (evaluates to
// 100.49999999999999) before any rounding runs, so going through
// parseFloat at all would reintroduce the exact error this column exists to
// avoid. Comma-stripping matches apps/native/lib/dashboard.ts's own
// parseAmount, which established that the parser's raw amount strings can
// carry thousands separators.
export function toMinorUnits(rawAmount: string, currencyCode: string): number {
  const exponent = minorUnitExponent(currencyCode);
  const normalized = rawAmount.replace(/,/g, "").trim();
  if (!DECIMAL_AMOUNT_RE.test(normalized)) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(rawAmount)}`);
  }

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
  return amountMinorUnits / 10 ** minorUnitExponent(currencyCode);
}
