// Insights from the rich fields parsed out of messages — bills due, card
// limits, cashback, trips, deliveries, NAVs, data packs, payment mix — read
// from the message_facts projection (never sms_ledger) and derived against
// the caller's clock.
import {
  deriveMessageInsights,
  MESSAGE_FACTS_WINDOW_DAYS,
  type MessageFact,
  type MessageFactFields,
  type MessageInsights,
} from "../lib/message-insights";
import { readClient } from "./connection";
import { readConsistentSnapshot } from "./projection-snapshot";
import type { AsyncQueryClient } from "./queries";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MessageInsightsQuery {
  currency: string;
  /** The reading clock, epoch ms. */
  at: number;
}

export async function queryMessageInsightsUnsafe(
  query: MessageInsightsQuery,
  client: AsyncQueryClient = readClient(),
): Promise<MessageInsights> {
  const at = new Date(query.at);
  if (!Number.isFinite(at.getTime()))
    throw new Error(`at must be a valid timestamp, got ${query.at}`);
  const since = query.at - MESSAGE_FACTS_WINDOW_DAYS * DAY_MS;
  const rows = await client.getAllAsync<{
    id: string;
    date: number;
    sender: string;
    currency: string;
    payload: string;
  }>(
    `SELECT id, date, sender, currency, payload
     FROM message_facts
     WHERE date >= ?
     ORDER BY date, id`,
    [since],
  );
  const facts: MessageFact[] = [];
  for (const row of rows) {
    try {
      facts.push({
        id: row.id,
        date: row.date,
        sender: row.sender,
        currency: row.currency,
        fields: JSON.parse(row.payload) as MessageFactFields,
      });
    } catch {
      // A malformed payload is one unusable fact, not a failed screen.
    }
  }
  return deriveMessageInsights(facts, at, query.currency);
}

export function queryMessageInsights(query: MessageInsightsQuery): Promise<MessageInsights> {
  return readConsistentSnapshot(() => queryMessageInsightsUnsafe(query));
}
