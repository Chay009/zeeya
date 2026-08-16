import seeddataRaw from './data/seeddata.json';
import { MalanaEngine } from './malana';
import type { SeedData } from './types';

export { MalanaEngine } from './malana';
export type { SeedData, MalanaResult, Token } from './types';
export { detectBank, detectMerchantCategory, detectSubcategory, detectBrand, grammarForSender, detectUpiHandle, isMandateCancelled } from './enrichment';
export type { BrandMatch } from './enrichment';

// The compiled grammar/token/classifier seed pulled from the Truecaller APK
// (resources/assets/malanaSeed/seeddata.json), bundled as a package asset so
// consumers (e.g. the mobile app) don't need to source or load it themselves.
export const seedData: SeedData = seeddataRaw as unknown as SeedData;

let sharedEngine: MalanaEngine | null = null;

// Convenience factory: a MalanaEngine pre-loaded with the bundled seed.
// Reuses a single instance (the seed/grammar compilation is immutable and
// safe to share across calls).
export function createMalanaEngine(): MalanaEngine {
  if (!sharedEngine) sharedEngine = new MalanaEngine(seedData);
  return sharedEngine;
}
