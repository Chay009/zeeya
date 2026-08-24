import bankSeedRaw from "./data/bank.json";
import vendorBanksRaw from "./data/vendor_banks.json";

const BANK_SEED: Array<[string, string[]]> = Object.entries(
  bankSeedRaw as Record<string, string[]>,
);
const BANK_SEED_NAMES = BANK_SEED.map(([name]) => name);

function toTitleCase(key: string): string {
  return key
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveCanonicalBankName(key: string): string {
  const lower = key.toLowerCase();
  const exact = BANK_SEED_NAMES.find((name) => name.toLowerCase() === lower);
  if (exact) return exact;

  const prefixMatches = BANK_SEED_NAMES.filter((name) =>
    name.toLowerCase().startsWith(lower + " "),
  );
  if (prefixMatches.length === 1) return prefixMatches[0]!;
  return toTitleCase(key);
}

const VENDOR_BANK_ENTRIES = Object.entries(vendorBanksRaw as Record<string, string[]>);
const VENDOR_BANKS: Array<[string, string[]]> = VENDOR_BANK_ENTRIES.map(([name, aliases]) => [
  resolveCanonicalBankName(name),
  aliases,
]);

function registerTerminalSignature(
  registry: Map<string, string>,
  signature: string,
  bankName: string,
): void {
  const normalized = signature.trim().toLowerCase();
  const existing = registry.get(normalized);
  if (existing && existing !== bankName) {
    throw new Error(
      `Bank terminal signature ${JSON.stringify(signature)} maps to both ${JSON.stringify(existing)} and ${JSON.stringify(bankName)}`,
    );
  }
  registry.set(normalized, bankName);
}

function canonicalTerminalAliasCandidates(name: string): Set<string> {
  const words = name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return new Set();

  const fullInitialism = words.map((word) => word[0]).join("");
  const significantInitialism = words
    .filter((word) => !["and", "of", "the"].includes(word))
    .map((word) => word[0])
    .join("");

  return new Set(
    [words.join(" "), fullInitialism, significantInitialism].filter(
      (signature) => signature.length >= 2,
    ),
  );
}

const BANK_BY_TERMINAL_SIGNATURE = new Map<string, string>();
for (const [name, senders] of BANK_SEED) {
  for (const sender of senders) {
    registerTerminalSignature(BANK_BY_TERMINAL_SIGNATURE, sender, name);
  }
}
for (const [registryName, aliases] of VENDOR_BANK_ENTRIES) {
  const bankName = resolveCanonicalBankName(registryName);
  const candidates = canonicalTerminalAliasCandidates(registryName);
  // vendor_banks.json mixes bank abbreviations with UPI handles and broad
  // sender fragments. Only an alias that is also the bank's normalized name
  // or mechanical acronym is safe as an end-of-message bank signature.
  for (const alias of aliases) {
    if (candidates.has(alias.toLowerCase())) {
      registerTerminalSignature(BANK_BY_TERMINAL_SIGNATURE, alias, bankName);
    }
  }
}

// The expression recognizes only the shared SMS signature syntax. Bank
// knowledge comes entirely from the exact JSON-derived lookup above.
const TERMINAL_BANK_SIGNATURE_RE = /-\s*([a-z0-9][a-z0-9 ]{1,39})\s*[.!]?\s*$/i;

// These legacy body fallbacks cover institutions absent from both extracted
// bank registries. They remain isolated here until their data is migrated to
// a validated Zeeya-owned asset; terminal-signature coverage never depends on
// adding entries to this list.
const LEGACY_BODY_BANK_PATTERNS: Array<[RegExp, string]> = [
  [/bandhan/i, "Bandhan Bank"],
  [/equitas/i, "Equitas Small Finance Bank"],
  [/karnataka bank/i, "Karnataka Bank"],
  [/au small finance|au bank/i, "AU Small Finance Bank"],
  [/uco bank/i, "UCO Bank"],
  [/central bank/i, "Central Bank of India"],
  [/punjab.*sind|sind.*bank/i, "Punjab & Sind Bank"],
  [/airtel.*bank/i, "Airtel Payments Bank"],
  [/jio.*bank/i, "Jio Payments Bank"],
  [/saraswat/i, "Saraswat Bank"],
  [/dbs bank/i, "DBS Bank"],
  [/city union/i, "City Union Bank"],
  [/nsdl/i, "NSDL Payments Bank"],
  [/jupiter/i, "Jupiter"],
  [/\bslice\b/i, "Slice"],
  [/\bcred\b/i, "CRED"],
];

export type BankIdentitySource =
  | "sender-id"
  | "sender-alias"
  | "terminal-signature"
  | "legacy-body";

export interface BankIdentity {
  bankName: string;
  source: BankIdentitySource;
}

export function resolveBankIdentity(sender: string, message: string): BankIdentity | null {
  const normalizedSender = sender.toLowerCase();
  const fragments = normalizedSender.split(/[-_\s]/);

  for (const [bankName, senders] of BANK_SEED) {
    if (senders.some((id) => fragments.includes(id.toLowerCase()))) {
      return { bankName, source: "sender-id" };
    }
  }

  for (const [bankName, aliases] of VENDOR_BANKS) {
    if (aliases.some((alias) => normalizedSender.includes(alias))) {
      return { bankName, source: "sender-alias" };
    }
  }

  const signature = TERMINAL_BANK_SIGNATURE_RE.exec(message)?.[1]?.trim().toLowerCase();
  const signatureBank = signature ? BANK_BY_TERMINAL_SIGNATURE.get(signature) : null;
  if (signatureBank) return { bankName: signatureBank, source: "terminal-signature" };

  const haystack = `${sender} ${message}`;
  for (const [pattern, bankName] of LEGACY_BODY_BANK_PATTERNS) {
    if (pattern.test(haystack)) return { bankName, source: "legacy-body" };
  }

  return null;
}

export function detectBank(sender: string, message: string): string | null {
  return resolveBankIdentity(sender, message)?.bankName ?? null;
}
