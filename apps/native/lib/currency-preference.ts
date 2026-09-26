/**
 * Currency lists are data, not a presentation-order accident.  Every
 * consumer that receives a list from a storage adapter uses this helper to
 * trim empty values and remove duplicates while preserving the source's
 * intentional order.
 *
 * The source is responsible for putting its product primary currency first
 * (the SQL projection does that from account recency, then the INR fallback).
 * Sorting here would erase that decision and recreate the old `currencies[0]`
 * bug in a different place.
 */
export function normalizeCurrencyCodes(currencies: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const rawCurrency of currencies) {
    const currency = rawCurrency.trim();
    if (currency) unique.add(currency);
  }
  return [...unique];
}

// The primary currency the read model reported, remembered for the session so
// Home (and the boot cache) start with it on the next mount instead of
// loading INR first and then reloading in the real currency.
let rememberedPrimary = "INR";

export function rememberedPrimaryCurrency(): string {
  return rememberedPrimary;
}

export function rememberPrimaryCurrency(currency: string | undefined): void {
  const trimmed = currency?.trim();
  if (trimmed) rememberedPrimary = trimmed;
}

/**
 * Put a known product/account primary first without changing the deterministic
 * order of the remaining source-provided currencies.
 */
export function primaryFirstCurrencies(
  currencies: readonly string[],
  primaryCurrency: string | undefined,
): string[] {
  const normalized = normalizeCurrencyCodes(currencies);
  const primary = primaryCurrency?.trim();
  if (!primary || !normalized.includes(primary)) return normalized;
  return [primary, ...normalized.filter((currency) => currency !== primary)];
}
