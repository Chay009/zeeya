import type { SeedData } from "./types.js";

const ISO_EXCEPTIONS: Readonly<Record<string, string>> = {
  rs: "INR",
  $: "USD",
  s$: "SGD",
  ksh: "KES",
  kr: "SEK",
  ghc: "GHS",
};

// Symbols used by real messages and already covered by the parser's public
// regression suite, but absent from this India seed's CRNCY dictionary.
const EXTRA_ALIASES: Readonly<Record<string, string>> = {
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  A$: "AUD",
  C$: "CAD",
  HK$: "HKD",
  NZ$: "NZD",
  "₩": "KRW",
  NGN: "NGN",
};

function isoForSeedNormalization(normalized: string): string | null {
  const lower = normalized.toLowerCase();
  const exception = ISO_EXCEPTIONS[lower];
  if (exception) return exception;
  return /^[a-z]{3}$/.test(lower) ? lower.toUpperCase() : null;
}

export interface CurrencyPrefixMatch {
  iso: string;
  length: number;
}

export class CurrencyRegistry {
  readonly aliases: readonly string[];
  private readonly isoByAlias: ReadonlyMap<string, string>;

  constructor(seed: SeedData) {
    const isoByAlias = new Map<string, string>();
    const currencyDefinition = Object.entries(seed.TOKENS).find(([key]) =>
      key.startsWith("CRNCY["),
    )?.[1];

    for (const entry of currencyDefinition?.split(",") ?? []) {
      const [alias, normalized = alias] = entry.split("|");
      if (!alias || !normalized) continue;
      const iso = isoForSeedNormalization(normalized);
      if (iso) isoByAlias.set(alias.toLowerCase(), iso);
    }

    for (const [alias, iso] of Object.entries(EXTRA_ALIASES)) {
      isoByAlias.set(alias.toLowerCase(), iso);
    }

    this.isoByAlias = isoByAlias;
    this.aliases = [...isoByAlias.keys()].sort((a, b) => b.length - a.length);
  }

  isoForAlias(alias: string): string | null {
    return this.isoByAlias.get(alias.trim().toLowerCase()) ?? null;
  }

  matchAmountPrefix(text: string, previousCharacter = ""): CurrencyPrefixMatch | null {
    const lower = text.toLowerCase();
    for (const alias of this.aliases) {
      if (!lower.startsWith(alias)) continue;
      if (/^[a-z0-9]/i.test(alias) && /[\p{L}\p{N}_]/u.test(previousCharacter)) continue;

      let length = alias.length;
      if (text[length] === ".") length++;
      while (/\s/.test(text[length] ?? "")) length++;
      if (!/\d/.test(text[length] ?? "")) continue;

      return { iso: this.isoByAlias.get(alias)!, length };
    }
    return null;
  }
}

// Every distinct ISO code the registry can produce for a given seed. The
// class itself stays internal to the package — a consumer that only needs
// "which currencies exist" (e.g. apps/native/db/currency.ts's parity test)
// shouldn't need isoForAlias/matchAmountPrefix/aliases as part of its
// public surface.
export function supportedMalanaCurrencyCodes(seed: SeedData): readonly string[] {
  const registry = new CurrencyRegistry(seed);
  const codes = new Set<string>();
  for (const alias of registry.aliases) {
    const iso = registry.isoForAlias(alias);
    if (iso) codes.add(iso);
  }
  return [...codes].sort();
}
