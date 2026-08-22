import seeddataRaw from "./data/seeddata.json";
import { MalanaEngine } from "./malana";
import { parseSeedData } from "./asset-schemas";

export { MalanaEngine } from "./malana";
export { CurrencyRegistry } from "./currency-registry";
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
  detectMerchantCategory,
  detectSubcategory,
  detectBrand,
  grammarForSender,
  detectUpiHandle,
  isMandateCancelled,
  extractMandateMerchant,
} from "./enrichment";
export type { BrandMatch } from "./enrichment";

// The compiled grammar/token/classifier seed pulled from the Truecaller APK
// (resources/assets/malanaSeed/seeddata.json), bundled as a package asset so
// consumers (e.g. the mobile app) don't need to source or load it themselves.
// Validated once here, at module load — not per SMS. Throws loudly on a
// corrupted or version-incompatible seed instead of silently loading bad data.
export const seedData = parseSeedData(seeddataRaw);

let sharedEngine: MalanaEngine | null = null;

// Convenience factory: a MalanaEngine pre-loaded with the bundled seed.
// Reuses a single instance (the seed/grammar compilation is immutable and
// safe to share across calls).
export function createMalanaEngine(): MalanaEngine {
  if (!sharedEngine) sharedEngine = new MalanaEngine(seedData);
  return sharedEngine;
}
