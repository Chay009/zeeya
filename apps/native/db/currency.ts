// Minor-unit exponent per ISO 4217, scoped to exactly the currencies
// @zeeya/parser's currency-registry.ts can actually produce — not a general
// "every world currency" table, since anything outside this set can't reach
// the local DB from the parser today. JPY and KRW have 0 minor units (no
// paise/cents equivalent); every other currency here has 2. Money is stored
// as an integer in minor units (paise for INR, cents for USD, etc.) rather
// than SQLite REAL — floating point can't represent decimal currency amounts
// exactly, and this schema hasn't shipped yet, so there's no reason to let
// that assumption spread into ingestion code.
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

export function minorUnitExponent(currencyCode: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
}

export function toMinorUnits(amount: number, currencyCode: string): number {
  return Math.round(amount * 10 ** minorUnitExponent(currencyCode));
}

export function fromMinorUnits(amountMinorUnits: number, currencyCode: string): number {
  return amountMinorUnits / 10 ** minorUnitExponent(currencyCode);
}
