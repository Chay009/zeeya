// Runtime schema and version validation for the Truecaller-extracted seed
// assets (seeddata.json, categorizer.json), validated once at module load
// (see index.ts / enrichment.ts) — not per SMS.
//
// Replaces the previous `as unknown as SeedData` / `as unknown as
// CategorizerData` unsafe casts, which accepted any shape silently. A
// corrupted or incompatible asset should fail loudly at startup, not load
// quietly and misbehave downstream on data the engine was never built for.

import { z } from 'zod';

// ── seeddata.json ────────────────────────────────────────────────────────────
//
// The seed this app ships (and every version the engine has been verified
// against, including the Yuga ground-truth comparison) is REPOVERSION 1.0.72 /
// VERSION 1.1.36 / COUNTRY IN. This engine's grammar (bank sender lists,
// keyword dictionary, currency handling) is India-specific by construction —
// loading a seed for a different country would silently misclassify
// everything, not just miss a few edge cases.
const SUPPORTED_REPOVERSIONS = ['1.0.72'];
const SUPPORTED_VERSIONS = ['1.1.36'];
const SUPPORTED_COUNTRIES = ['IN'];

const GrammarCategorySchema = z.object({
  GRMR: z.array(z.record(z.string(), z.string())),
  STRUCT: z.array(z.string()),
  PATTERN: z.array(z.string()),
});

export const SeedDataSchema = z.object({
  REPOVERSION: z.string().refine(v => SUPPORTED_REPOVERSIONS.includes(v), {
    message: `Unsupported seeddata.json REPOVERSION (expected one of: ${SUPPORTED_REPOVERSIONS.join(', ')})`,
  }),
  VERSION: z.string().refine(v => SUPPORTED_VERSIONS.includes(v), {
    message: `Unsupported seeddata.json VERSION (expected one of: ${SUPPORTED_VERSIONS.join(', ')})`,
  }),
  COUNTRY: z.string().refine(v => SUPPORTED_COUNTRIES.includes(v), {
    message: `Unsupported seeddata.json COUNTRY — this engine's grammar is India-specific (expected one of: ${SUPPORTED_COUNTRIES.join(', ')})`,
  }),
  TOKENS: z.record(z.string(), z.string()),
  // Real shape confirmed directly against the seed: { CLS_ID: string[] } —
  // a flat list of "identifier-like" token types (BOOKINGID, PNR, ORDERID,
  // ...). Currently unused by the engine (see malana.ts's own hardcoded
  // grammar-routing table) — preserved here typed, not wired into behavior.
  CLASSIFIER: z.object({
    CLS_ID: z.array(z.string()),
  }),
  GRAMMAR: z.record(z.string(), GrammarCategorySchema),
});

export type SeedData = z.infer<typeof SeedDataSchema>;

export function parseSeedData(raw: unknown): SeedData {
  const result = SeedDataSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid seeddata.json: ${result.error.message}`);
  }
  return result.data;
}

// ── categorizer.json ─────────────────────────────────────────────────────────
//
// Naive Bayes binary classifier trained on Indian SMS data. Each word entry's
// probability tuple is [P(w|class0), P(w|class1), count0, count1, logRatio,
// logRatio] (indices 2-5 — training counts and a precomputed log-ratio pair —
// are currently unused by the engine, which only reads indices 0/1 and
// recomputes the ratio itself at inference time; preserved here typed rather
// than assumed safe to drop). meta is [prior0, prior1, totalWords0,
// totalWords1, uniqueWords0, uniqueWords1, ...] — engine only reads meta[0]/
// meta[1] (the class priors); the remaining values are training-corpus
// statistics, also preserved typed without changing inference behavior.
const SUPPORTED_CATEGORIZER_VERSIONS = [17];

const ProbabilityTupleSchema = z.tuple([
  z.number(), z.number(), z.number(), z.number(), z.number(), z.number(),
]);

const CategorizerEntrySchema = z.object({
  word: z.string(),
  probability: ProbabilityTupleSchema,
});

const MetaTupleSchema = z.tuple([
  z.number(), z.number(), z.number(), z.number(), z.number(),
  z.number(), z.number(), z.number(), z.number(), z.number(),
]);

export const CategorizerDataSchema = z.object({
  probabilities: z.array(CategorizerEntrySchema),
  meta: MetaTupleSchema,
  version: z.number().refine(v => SUPPORTED_CATEGORIZER_VERSIONS.includes(v), {
    message: `Unsupported categorizer.json version (expected one of: ${SUPPORTED_CATEGORIZER_VERSIONS.join(', ')})`,
  }),
});

export type CategorizerData = z.infer<typeof CategorizerDataSchema>;

export function parseCategorizerData(raw: unknown): CategorizerData {
  const result = CategorizerDataSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid categorizer.json: ${result.error.message}`);
  }
  return result.data;
}
