// Single-transaction detail and activity-list read queries against the
// normalized projection tables. Built with drizzle-orm's typed query builder,
// executed through expo-sqlite's async API on the same already-keyed
// connection (db/async-select.ts) so a screen read never blocks the JS thread.
import { and, desc, eq, gte, lt, lte, or, type SQL } from "drizzle-orm";
import { parsePersistedMalanaResult } from "@zeeya/parser/malana";
import type {
  ActivityCursor,
  ActivityDetail,
  ActivityPage,
  ActivityQuery,
  ActivitySummary,
  TransactionDetail,
} from "../lib/dashboard-data";
import { aliasedColumns, selectAsync } from "./async-select";
import { db } from "./client";
import { ensureProjectionReadable } from "./ingestion";
import { activity, smsLedger, transactions } from "./schema";
import type { Database } from "./client.native";

function requireDb(): Database {
  if (!db) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return db;
}

const ACTIVITY_DEFAULT_LIMIT = 30;
const ACTIVITY_MAX_LIMIT = 100;

function validatedLimit(limit: number | undefined): number {
  const resolved = limit ?? ACTIVITY_DEFAULT_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > ACTIVITY_MAX_LIMIT) {
    throw new Error(
      `Activity page limit must be an integer from 1 to ${ACTIVITY_MAX_LIMIT}, got ${resolved}`,
    );
  }
  return resolved;
}

// A string-typed persisted MalanaResult field, allowlisted one at a time
// into TransactionDetail below — never the parsed object itself. Returns
// null for anything not a non-empty string, which is exactly how
// TransactionDetail's fields are typed (string | null).
function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// null (not false) when `value` isn't a real boolean — i.e. the validated
// result the field would have come from doesn't exist (missing/corrupt/
// invalid-schema parsed_result). A validated MalanaResult's own boolean
// fields (isFromCard, isOnlineBrand) are always real true/false, never
// undefined, so this only ever falls through to null when there was no
// validated result to read from in the first place — "unknown" and "no"
// are kept distinguishable, per TransactionDetail/ActivityDetail's own
// isFromCard/isOnlineBrand comments.
function boolField(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// Decodes and validates one sms_ledger row's parsed_result, returning the
// validated MalanaResult (or null if the row has no parsed_result, the
// JSON doesn't parse, or it fails parsePersistedMalanaResult's schema
// validation — the same Zod schema ingestion.ts uses to decode it). Never
// throws. Shared by queryTransactionDetail and queryActivityDetail so the
// two single-row-join detail queries can't silently diverge in how they
// validate the exact same kind of ledger row.
function decodeValidatedResult(
  parsedResult: string | null,
): ReturnType<typeof parsePersistedMalanaResult> {
  if (!parsedResult) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(parsedResult);
  } catch {
    return null;
  }
  return parsePersistedMalanaResult(decoded);
}

// The category-specific product-detail fields both TransactionDetail and
// ActivityDetail carry — an explicit allowlist off a validated
// MalanaResult, never a spread of the object itself. Returns every field
// as null when `result` is null (missing/corrupt/schema-invalid
// parsed_result), never throwing and never falling back to an unsafe cast.
function allowlistedDetailFields(result: ReturnType<typeof parsePersistedMalanaResult>) {
  return {
    trxType: stringField(result?.trxType),
    isFromCard: boolField(result?.isFromCard),
    creditLimit: stringField(result?.creditLimit),
    bene: stringField(result?.bene),
    beneAcc: stringField(result?.beneAcc),
    location: stringField(result?.location),
    billAmount: stringField(result?.billAmount),
    emiAmount: stringField(result?.emiAmount),
    dueDate: stringField(result?.dueDate),
    policyNo: stringField(result?.policyNo),
    rechargeAmount: stringField(result?.rechargeAmount),
    mandateAmount: stringField(result?.mandateAmount),
    mandateMerchant: stringField(result?.mandateMerchant),
    pnr: stringField(result?.pnr),
    flight: stringField(result?.flight),
    departure: stringField(result?.departure),
    departureCode: stringField(result?.departureCode),
    arrival: stringField(result?.arrival),
    arrivalCode: stringField(result?.arrivalCode),
    fare: stringField(result?.fare),
    trainBusNo: stringField(result?.trainBusNo),
    boardingGate: stringField(result?.boardingGate),
    orderNo: stringField(result?.orderNo),
    trackingId: stringField(result?.trackingId),
    deliveryStatus: stringField(result?.deliveryStatus),
    item: stringField(result?.item),
    otp: stringField(result?.otp),
    otpExpiry: stringField(result?.otpExpiry),
    cashback: stringField(result?.cashback),
    discount: stringField(result?.discount),
    offerCode: stringField(result?.offerCode),
    offerCategory: stringField(result?.offerCategory),
    dataLeft: stringField(result?.dataLeft),
    packBalance: stringField(result?.packBalance),
    navValue: stringField(result?.navValue),
    folio: stringField(result?.folio),
    marginAmount: stringField(result?.marginAmount),
    isOnlineBrand: boolField(result?.isOnlineBrand),
    upiHandle: stringField(result?.upiHandle),
  };
}

// Single-row lookup by transaction id, joined through its indexed smsId to
// read exactly one sms_ledger row's parsed_result — the one sanctioned
// exception to "SQL never joins back to the ledger" (see
// TransactionDetail's own comment): category-specific fields (travel,
// delivery, OTP, bills, ...) live only in that JSON today. Selects a single
// identified row, never scans. A missing row, missing parsed_result, or
// corrupt/invalid JSON all resolve to null category-specific fields, never
// a thrown error or an unsafe cast. Only an explicit allowlist of scalar
// fields is copied out; the validated MalanaResult itself, its `tags` map,
// and its `tokens` tree are never returned. Pure non-financial messages
// (travel/delivery/OTP/event/offer with no parsed transaction amount) have
// no transactions row at all and so can't be looked up here — see
// queryActivityDetail below for those.
export async function queryTransactionDetail(id: string): Promise<TransactionDetail | null> {
  const database = requireDb();
  await ensureProjectionReadable();

  const [row] = await selectAsync<TransactionDetailRow>(
    database
      .select(
        aliasedColumns({
          id: transactions.id,
          date: transactions.date,
          amountMinorUnits: transactions.amountMinorUnits,
          currency: transactions.currency,
          direction: transactions.direction,
          accountId: transactions.accountId,
          trxTypeRich: transactions.trxTypeRich,
          vendor: transactions.vendor,
          brandName: transactions.brandName,
          category: transactions.category,
          ref: transactions.ref,
          bankName: transactions.bankName,
          mandateId: transactions.mandateId,
          merchantCategory: transactions.merchantCategory,
          subcategory: transactions.subcategory,
          parsedResult: smsLedger.parsedResult,
        }),
      )
      .from(transactions)
      .innerJoin(smsLedger, eq(transactions.smsId, smsLedger.id))
      .where(eq(transactions.id, id))
      .limit(1),
  );

  if (!row) return null;

  const result = decodeValidatedResult(row.parsedResult);

  return {
    id: row.id,
    date: row.date,
    amountMinorUnits: row.amountMinorUnits,
    currency: row.currency,
    direction: row.direction,
    accountId: row.accountId,
    trxTypeRich: row.trxTypeRich,
    vendor: row.vendor,
    brandName: row.brandName,
    category: row.category,
    ref: row.ref,
    bankName: row.bankName,
    mandateId: row.mandateId,
    merchantCategory: row.merchantCategory,
    subcategory: row.subcategory,
    mandateEvent:
      result?.mandateEvent === "active" || result?.mandateEvent === "cancelled"
        ? result.mandateEvent
        : null,
    ...allowlistedDetailFields(result),
  };
}

const activityColumns = {
  id: activity.id,
  date: activity.date,
  category: activity.category,
  bankName: activity.bankName,
  brandName: activity.brandName,
  vendor: activity.vendor,
  trxTypeRich: activity.trxTypeRich,
  subcategory: activity.subcategory,
  mandateEvent: activity.mandateEvent,
  isFromCard: activity.isFromCard,
  amountMinorUnits: activity.amountMinorUnits,
  currency: activity.currency,
  direction: activity.direction,
} as const;

// Raw rows as SQLite returns them through getAllAsync — no Drizzle column
// decoding on this path, so the one boolean-mode column (is_from_card) comes
// back as 0/1 and is decoded explicitly.
type TransactionDetailRow = Pick<
  TransactionDetail,
  | "id"
  | "date"
  | "amountMinorUnits"
  | "currency"
  | "direction"
  | "accountId"
  | "trxTypeRich"
  | "vendor"
  | "brandName"
  | "category"
  | "ref"
  | "bankName"
  | "mandateId"
  | "merchantCategory"
  | "subcategory"
> & { parsedResult: string | null };

type RawActivityRow = Omit<ActivitySummary, "isFromCard"> & { isFromCard: number };

type RawActivityDetailRow = RawActivityRow & {
  parsedResult: string | null;
  transactionId: string | null;
  accountId: string | null;
  ref: string | null;
  merchantCategory: string | null;
};

function decodeActivityRow(row: RawActivityRow): ActivitySummary {
  return { ...row, isFromCard: row.isFromCard === 1 };
}

function activityCursorCondition(cursor: ActivityCursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(activity.date, cursor.date),
    and(eq(activity.date, cursor.date), lt(activity.id, cursor.id)),
  );
}

// Newest-first, keyset-paginated by (date DESC, id DESC) — id is the
// tiebreaker for rows sharing the exact same date, the same pattern
// db/ingestion.ts's queryTransactionPage uses.
export async function queryActivityPage(query: ActivityQuery = {}): Promise<ActivityPage> {
  const limit = validatedLimit(query.limit);
  const database = requireDb();
  await ensureProjectionReadable();

  const conditions: SQL[] = [];
  if (query.category) conditions.push(eq(activity.category, query.category));
  if (query.from !== undefined) conditions.push(gte(activity.date, query.from));
  if (query.to !== undefined) conditions.push(lte(activity.date, query.to));
  const cursor = activityCursorCondition(query.cursor);
  if (cursor) conditions.push(cursor);

  const rawRows = await selectAsync<RawActivityRow>(
    database
      .select(aliasedColumns(activityColumns))
      .from(activity)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activity.date), desc(activity.id))
      .limit(limit + 1),
  );
  const rows = rawRows.map(decodeActivityRow);

  const hasMore = rows.length > limit;
  const items: ActivitySummary[] = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
  };
}

// Single-row lookup by the activity row's own id (`${smsId}|${category}`).
// Every category the Activity screen shows — including pure non-financial
// ones (travel/delivery/OTP/event/offer) — has an activity row, unlike
// transactions, which projectTransaction only creates when a message
// parsed both a trx amount and trxTypeRich. Seeks the one identified
// activity row, inner-joins its one ledger row (required — an activity row
// always has a smsId FK), and left-joins transactions by the shared smsId
// (optional — null for a non-financial message) purely to surface
// transactionId/accountId/ref, never re-deriving amount/currency/direction
// (those already live on the activity row itself, written once by
// projectActivityRows). Never scans; category-specific fields go through
// the same validated allowlist queryTransactionDetail uses.
export async function queryActivityDetail(activityId: string): Promise<ActivityDetail | null> {
  const database = requireDb();
  await ensureProjectionReadable();

  const [rawRow] = await selectAsync<RawActivityDetailRow>(
    database
      .select(
        aliasedColumns({
          ...activityColumns,
          parsedResult: smsLedger.parsedResult,
          transactionId: transactions.id,
          accountId: transactions.accountId,
          ref: transactions.ref,
          merchantCategory: transactions.merchantCategory,
        }),
      )
      .from(activity)
      .innerJoin(smsLedger, eq(activity.smsId, smsLedger.id))
      .leftJoin(transactions, eq(activity.smsId, transactions.smsId))
      .where(eq(activity.id, activityId))
      .limit(1),
  );

  if (!rawRow) return null;
  const row = { ...rawRow, isFromCard: rawRow.isFromCard === 1 };

  const result = decodeValidatedResult(row.parsedResult);

  return {
    ...allowlistedDetailFields(result),
    id: row.id,
    date: row.date,
    category: row.category,
    bankName: row.bankName,
    brandName: row.brandName,
    vendor: row.vendor,
    trxTypeRich: row.trxTypeRich,
    subcategory: row.subcategory,
    // activity.mandate_event/is_from_card are the same presentation fields
    // ActivitySummary already carries, written once at projection time —
    // deliberately placed after the allowlistedDetailFields spread so
    // these two (already-known-correct, non-JSON-derived) values win over
    // whatever that spread's own isFromCard happened to compute from the
    // ledger JSON, rather than the two silently disagreeing.
    mandateEvent: row.mandateEvent,
    isFromCard: row.isFromCard,
    amountMinorUnits: row.amountMinorUnits,
    currency: row.currency,
    direction: row.direction,
    transactionId: row.transactionId,
    accountId: row.accountId,
    ref: row.ref,
    merchantCategory: row.merchantCategory,
  };
}
