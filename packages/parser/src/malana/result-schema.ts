// Runtime validation for a persisted MalanaResult — the single source of
// truth for what a consumer (e.g. apps/native's on-device ledger) may trust
// after decoding cached JSON. A consumer reproducing this 50+-field shape
// itself, or only spot-checking a couple of fields, would drift from this
// file the moment MalanaResult's real shape changes; importing this schema
// instead means it can't.
//
// Field-by-field against types.ts's MalanaResult, not a loose "looks like
// an object" check — a value can be syntactically valid JSON and pass a
// shallow shape check (e.g. `{ category: "GRM_BANK", ref: 3 }`) while still
// crashing downstream code that calls string methods on what it assumes is
// a string (dashboard.ts's ref.replace(), for one).
import { z } from "zod";
import type { MalanaResult, Token } from "./types";

const TokenSchema: z.ZodType<Token> = z.lazy(() =>
  z.object({
    type: z.string(),
    raw: z.string(),
    text: z.string(),
    values: z.record(z.string(), z.string()),
    locked: z.boolean(),
    matched: z.boolean(),
    children: z.array(TokenSchema),
  }),
);

const MalanaCategorySchema = z.enum([
  "GRM_BANK",
  "GRM_BILL",
  "GRM_STOCKUPDATES",
  "GRM_TRAVEL",
  "GRM_DELIVERY",
  "GRM_EVENT",
  "GRM_APPOINTMENT",
  "GRM_NOTIF",
  "GRM_OTP",
  "GRM_OFFERS",
  "GRM_TELECOM",
  "GRM_CALLALERTS",
  "GRM_VOID",
]);

const MalanaCategoryRoleSchema = z.enum(["financial", "information", "safety", "internal"]);

const MalanaCategoryEvidenceSchema = z.union([
  z.object({ kind: z.literal("grammar-tag"), value: z.string() }),
  z.object({ kind: z.literal("marker"), value: z.string() }),
  z.object({ kind: z.literal("policy"), value: z.enum(["inactive-status", "route"]) }),
]);

const MalanaCategoryMatchSchema = z.object({
  category: MalanaCategorySchema,
  role: MalanaCategoryRoleSchema,
  evidence: z.array(MalanaCategoryEvidenceSchema),
  tags: z.record(z.string(), z.string()),
});

const TrxTypeRichSchema = z.enum([
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "INVESTMENT",
  "BALANCE_UPDATE",
  "SALARY",
  "AUTO_DEBIT",
  "RECHARGE",
  "WALLET_CREDIT",
  "WALLET_DEBIT",
  "ATM_WITHDRAWAL",
]);

const nullableString = z.string().nullable();

export const MalanaResultSchema = z.object({
  category: z.string().nullable(),
  matchedCategories: z.array(MalanaCategorySchema).optional(),
  categoryMatches: z.array(MalanaCategoryMatchSchema).optional(),
  tags: z.record(z.string(), z.string()),
  tokens: z.array(TokenSchema),

  bankName: nullableString,
  merchantCategory: nullableString,
  subcategory: nullableString,

  trx: nullableString,
  bal: nullableString,
  acc: nullableString,
  trxType: nullableString,
  trxTypeRich: TrxTypeRichSchema.nullable(),
  currency: nullableString,
  isFromCard: z.boolean(),
  creditLimit: nullableString,
  ref: nullableString,
  bene: nullableString,
  beneAcc: nullableString,
  vendor: nullableString,
  location: nullableString,

  otp: nullableString,
  otpExpiry: nullableString,

  pnr: nullableString,
  flight: nullableString,
  departure: nullableString,
  arrival: nullableString,
  fare: nullableString,
  trainBusNo: nullableString,
  boardingGate: nullableString,
  departureCode: nullableString,
  arrivalCode: nullableString,

  orderNo: nullableString,
  trackingId: nullableString,
  deliveryStatus: nullableString,
  item: nullableString,

  billAmount: nullableString,
  emiAmount: nullableString,
  dueDate: nullableString,
  policyNo: nullableString,
  rechargeAmount: nullableString,
  mandateAmount: nullableString,
  mandateId: nullableString,
  mandateEvent: z.enum(["active", "cancelled"]).nullable(),
  mandateMerchant: nullableString,

  cashback: nullableString,
  discount: nullableString,
  offerCode: nullableString,
  offerCategory: nullableString,

  dataLeft: nullableString,
  packBalance: nullableString,

  navValue: nullableString,
  folio: nullableString,
  marginAmount: nullableString,

  brandName: nullableString,
  isOnlineBrand: z.boolean(),

  upiHandle: nullableString,

  isSpam: z.boolean(),
  spamScore: z.number(),
}) satisfies z.ZodType<MalanaResult>;

// `satisfies z.ZodType<MalanaResult>` above only checks one direction —
// that the schema's inferred type is *assignable to* MalanaResult. A
// newly-added *optional* field on MalanaResult would still satisfy that
// check even though this schema doesn't declare it, and since Zod object
// schemas strip unrecognized keys by default (no `.passthrough()`), such a
// field would then be silently dropped at parse time with no compile- or
// run-time signal that this file has drifted from the real type.
//
// This asserts the two types are exactly equal (both directions), not
// just assignable one way, using the standard "distributive conditional
// over a generic" trick: two types are structurally identical iff this
// pair of conditional types are identical, which TypeScript can only
// prove when neither side has an extra/missing member relative to the
// other. If MalanaResult gains, loses, or changes a field without a
// matching change here, this line fails to compile.
type AssertExactMatch<T, Expected> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends Expected ? 1 : 2 ? true : false;
const _resultSchemaMatchesMalanaResult: AssertExactMatch<
  MalanaResult,
  z.infer<typeof MalanaResultSchema>
> = true;
void _resultSchemaMatchesMalanaResult;

// Validates a decoded (JSON.parse'd) value against the exact MalanaResult
// contract — for a consumer reading back a persisted result, not for the
// engine's own hot parse path. Returns null on failure rather than
// throwing, since the intended use (e.g. loading a cached SQLite row) wants
// to skip a corrupted row, not crash the caller.
export function parsePersistedMalanaResult(value: unknown): MalanaResult | null {
  const result = MalanaResultSchema.safeParse(value);
  return result.success ? result.data : null;
}
