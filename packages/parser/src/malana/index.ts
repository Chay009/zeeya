import packageJson from "../../package.json";
import seeddataRaw from "./data/seeddata.json";
import { MalanaEngine } from "./malana";
import { parseSeedData } from "./asset-schemas";

export { MalanaEngine } from "./malana";
export { supportedMalanaCurrencyCodes } from "./currency-registry";
export { parsePersistedMalanaResult } from "./result-schema";
export { normalizeSmsForParsing } from "./sms-normalizer";
export type {
  SeedData,
  MalanaResult,
  Token,
  TrxTypeRich,
  MalanaCategory,
  MalanaCategoryEvidence,
  MalanaCategoryMatch,
  MalanaCategoryRole,
} from "./types";
export {
  detectBank,
  resolveBankIdentity,
  detectMerchantCategory,
  detectSubcategory,
  detectBrand,
  grammarForSender,
  detectUpiHandle,
  isMandateCancelled,
  extractMandateMerchant,
} from "./enrichment";
export type { BrandMatch } from "./enrichment";
export type { BankIdentity, BankIdentitySource } from "./enrichment";

// The compiled grammar/token/classifier seed pulled from the Truecaller APK
// (resources/assets/malanaSeed/seeddata.json), bundled as a package asset so
// consumers (e.g. the mobile app) don't need to source or load it themselves.
// Validated once here, at module load — not per SMS. Throws loudly on a
// corrupted or version-incompatible seed instead of silently loading bad data.
export const seedData = parseSeedData(seeddataRaw);

// Consumers that persist parsed results (e.g. apps/native's on-device
// ledger) need a version to detect which persisted rows were parsed by an
// older build and may need reprocessing. This package's own package.json
// version is the persistence contract: any parsing, grammar, or enrichment
// change that can alter MalanaResult must bump it so cached rows are reparsed.
export const PARSER_VERSION: string = packageJson.version;

let sharedEngine: MalanaEngine | null = null;

// Convenience factory: a MalanaEngine pre-loaded with the bundled seed.
// Reuses a single instance (the seed/grammar compilation is immutable and
// safe to share across calls).
export function createMalanaEngine(): MalanaEngine {
  if (!sharedEngine) sharedEngine = new MalanaEngine(seedData);
  return sharedEngine;
}
