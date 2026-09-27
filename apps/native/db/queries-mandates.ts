// Mandate-family read queries against the normalized projection tables
// (mandates, mandate_events — see db/schema.ts / db/projections.ts). Built
// with drizzle-orm's typed query builder, executed through expo-sqlite's
// async API on the same already-keyed connection (db/async-select.ts) so a
// screen read never blocks the JS thread.
import { and, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import type {
  MandateCursor,
  MandateEventCursor,
  MandateEventPage,
  MandateEventQuery,
  MandateEventSummary,
  MandatePage,
  MandateQuery,
  MandateSummary,
} from "../lib/dashboard-data";
import { aliasedColumns, selectAsync } from "./async-select";
import { db } from "./client";
import { ensureProjectionReadable } from "./ingestion";
import { mandateEvents, mandates } from "./schema";
import type { Database } from "./client.native";

const MANDATE_EVENT_COLUMNS = {
  id: mandateEvents.id,
  mandateId: mandateEvents.mandateId,
  status: mandateEvents.status,
  date: mandateEvents.date,
  sender: mandateEvents.sender,
};

function requireDb(): Database {
  if (!db) {
    throw new Error(
      "Local database is not available on this platform (see db/client.web.ts) — " +
        "these queries are Android-only, same as the rest of apps/native/db.",
    );
  }
  return db;
}

const MANDATES_DEFAULT_LIMIT = 25;
const MANDATES_MAX_LIMIT = 100;
const MANDATE_EVENTS_DEFAULT_LIMIT = 30;
const MANDATE_EVENTS_MAX_LIMIT = 100;

function validatedLimit(
  limit: number | undefined,
  defaultLimit: number,
  maxLimit: number,
  label: string,
): number {
  const resolved = limit ?? defaultLimit;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maxLimit) {
    throw new Error(`${label} limit must be an integer from 1 to ${maxLimit}, got ${resolved}`);
  }
  return resolved;
}

function mandateCursorCondition(cursor: MandateCursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(mandates.lastUpdated, cursor.lastUpdated),
    and(eq(mandates.lastUpdated, cursor.lastUpdated), lt(mandates.mandateId, cursor.mandateId)),
  );
}

// Mandates are not inherently human-bounded — a cancelled or expired
// mandate's row is never deleted, so the count grows over the ledger's
// lifetime the same way transactions/activity do (unlike accounts, which
// really are a small, human-bounded set). Keyset-paginated by
// (lastUpdated DESC, mandateId DESC) — mandateId is the tiebreaker for
// mandates sharing the exact same lastUpdated, the same pattern
// db/queries-accounts.ts's queryBalanceHistory uses for (asOf, id).
export async function queryMandates(query: MandateQuery = {}): Promise<MandatePage> {
  const limit = validatedLimit(
    query.limit,
    MANDATES_DEFAULT_LIMIT,
    MANDATES_MAX_LIMIT,
    "Mandate page",
  );
  const database = requireDb();
  await ensureProjectionReadable();

  const cursor = mandateCursorCondition(query.cursor);

  const rows = await selectAsync<MandateSummary>(
    database
      .select(
        aliasedColumns({
          mandateId: mandates.mandateId,
          merchant: mandates.merchant,
          amountMinorUnits: mandates.amountMinorUnits,
          currency: mandates.currency,
          status: mandates.status,
          createdAt: mandates.createdAt,
          lastUpdated: mandates.lastUpdated,
          sender: mandates.sender,
        }),
      )
      .from(mandates)
      .where(cursor)
      .orderBy(desc(mandates.lastUpdated), desc(mandates.mandateId))
      .limit(limit + 1),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? { lastUpdated: last.lastUpdated, mandateId: last.mandateId } : null,
  };
}

function mandateEventCursorCondition(cursor: MandateEventCursor | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(mandateEvents.date, cursor.date),
    and(eq(mandateEvents.date, cursor.date), lt(mandateEvents.id, cursor.id)),
  );
}

// Newest-first, keyset-paginated by (date DESC, id DESC) — id is the
// tiebreaker for events sharing the exact same date, the same pattern
// db/queries-accounts.ts's queryBalanceHistory uses.
export async function queryMandateEvents(query: MandateEventQuery): Promise<MandateEventPage> {
  const limit = validatedLimit(
    query.limit,
    MANDATE_EVENTS_DEFAULT_LIMIT,
    MANDATE_EVENTS_MAX_LIMIT,
    "Mandate event page",
  );
  const database = requireDb();
  await ensureProjectionReadable();

  const conditions = [eq(mandateEvents.mandateId, query.mandateId)];
  const cursor = mandateEventCursorCondition(query.cursor);
  if (cursor) conditions.push(cursor);

  const rows = await selectAsync<MandateEventSummary>(
    database
      .select(aliasedColumns(MANDATE_EVENT_COLUMNS))
      .from(mandateEvents)
      .where(and(...conditions))
      .orderBy(desc(mandateEvents.date), desc(mandateEvents.id))
      .limit(limit + 1),
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
  };
}

// SQLite's default bound-parameter ceiling is 999; stay well under it.
const MANDATE_ID_CHUNK = 500;

// Latest events for MANY mandates in one pass — the subscriptions catalog
// used to call queryMandateEvents once per mandate (N queries, and N
// projection-freshness checks). One freshness check, one indexed read per
// chunk of ids, grouped in memory. Each mandate's list is newest-first
// (date DESC, id DESC — same order as queryMandateEvents) and capped at
// `limitPerMandate`. Every requested id gets an entry, empty if it has no
// events.
export async function queryMandateEventsForMandates(
  mandateIds: readonly string[],
  limitPerMandate: number = MANDATE_EVENTS_DEFAULT_LIMIT,
): Promise<Map<string, MandateEventSummary[]>> {
  const limit = validatedLimit(
    limitPerMandate,
    MANDATE_EVENTS_DEFAULT_LIMIT,
    MANDATE_EVENTS_MAX_LIMIT,
    "Mandate event page",
  );
  const uniqueIds = [...new Set(mandateIds)];
  const grouped = new Map<string, MandateEventSummary[]>(uniqueIds.map((id) => [id, []]));
  if (uniqueIds.length === 0) return grouped;

  const database = requireDb();
  await ensureProjectionReadable();

  for (let start = 0; start < uniqueIds.length; start += MANDATE_ID_CHUNK) {
    const chunk = uniqueIds.slice(start, start + MANDATE_ID_CHUNK);
    const rows = await selectAsync<MandateEventSummary>(
      database
        .select(aliasedColumns(MANDATE_EVENT_COLUMNS))
        .from(mandateEvents)
        .where(inArray(mandateEvents.mandateId, chunk))
        .orderBy(desc(mandateEvents.date), desc(mandateEvents.id)),
    );

    for (const row of rows) {
      const bucket = grouped.get(row.mandateId);
      if (bucket && bucket.length < limit) bucket.push(row);
    }
  }
  return grouped;
}
