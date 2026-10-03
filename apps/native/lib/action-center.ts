import type { MessageInsights } from "./message-insights";

// Home's Action Center: the few things from the user's messages that need
// attention now — a bill overdue or due in days, a flight within two days, a
// parcel out for delivery, a card with less credit left than this month's
// card spend, mobile data running out. Each needs a date that makes it
// current; stale or dateless facts never become an alert.

export type ActionTone = "critical" | "warning" | "info";

export interface ActionItem {
  key: string;
  kind: "bill" | "trip" | "delivery" | "card" | "data";
  tone: ActionTone;
  title: string;
  detail: string;
  /** Major units, shown beside the title when present. */
  amount: number | null;
  /** Lower is more urgent. */
  urgency: number;
  /** The moment the item is about (due, departure, last seen), for ties. */
  at: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A bill counts as "due soon" this many days ahead. */
const BILL_SOON_DAYS = 3;
/** A trip shows from this many hours before departure. */
const TRIP_SOON_HOURS = 48;
/** Parcel, data and card facts older than these aren't "now" any more. */
const DELIVERY_FRESH_MS = 1 * DAY_MS;
const DATA_FRESH_MS = 2 * DAY_MS;
const CARD_FRESH_MS = 7 * DAY_MS;
/** Mobile data below this (in MB) is "running low". */
const LOW_DATA_MB = 500;
export const ACTION_CENTER_LIMIT = 4;

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

function dayPhrase(at: number, now: Date): string {
  const days = Math.round((startOfDay(new Date(at)) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function clockTime(at: number): string | null {
  const date = new Date(at);
  if (date.getHours() === 0 && date.getMinutes() === 0) return null;
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "150 MB" / "1.2 GB" / "800MB" → MB; null when the text isn't a data amount. */
export function dataMegabytes(raw: string | null): number | null {
  if (!raw) return null;
  const match = /(\d+(?:\.\d+)?)\s*(kb|mb|gb)/i.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  return unit === "gb" ? value * 1024 : unit === "kb" ? value / 1024 : value;
}

export function deriveActionItems(insights: MessageInsights, now: Date): ActionItem[] {
  const today = startOfDay(now);
  const nowMs = now.getTime();
  const items: ActionItem[] = [];

  for (const bill of insights.billsDue) {
    if (bill.dueAt === null) continue;
    const days = Math.round((bill.dueAt - today) / DAY_MS);
    if (days > BILL_SOON_DAYS) continue;
    const what = bill.kind === "emi" ? "EMI" : bill.kind === "insurance" ? "Premium" : "Bill";
    items.push({
      key: `bill:${bill.key}`,
      kind: "bill",
      tone: days < 0 ? "critical" : "warning",
      title: `${bill.name} ${what.toLowerCase()}`,
      detail:
        days < 0
          ? `Overdue · was due ${dayPhrase(bill.dueAt, now)}`
          : `${what} due ${dayPhrase(bill.dueAt, now)}`,
      amount: bill.amount,
      urgency: days < 0 ? 0 : days <= 1 ? 1 : 3,
      at: bill.dueAt,
    });
  }

  for (const trip of insights.trips) {
    if (trip.departsAt === null) continue;
    const until = trip.departsAt - nowMs;
    // Dated but untimed: keep it for the whole day of departure.
    const untimed = clockTime(trip.departsAt) === null;
    if (until > TRIP_SOON_HOURS * HOUR_MS) continue;
    if (untimed ? trip.departsAt < today : until < -HOUR_MS) continue;
    const time = clockTime(trip.departsAt);
    items.push({
      key: `trip:${trip.key}`,
      kind: "trip",
      tone: "info",
      title: trip.from && trip.to ? `${trip.from} → ${trip.to}` : trip.title,
      detail: `${trip.title} departs ${dayPhrase(trip.departsAt, now)}${time ? ` ${time}` : ""}${trip.gate ? ` · Gate ${trip.gate}` : ""}`,
      amount: null,
      urgency: until <= DAY_MS ? 1 : 3,
      at: trip.departsAt,
    });
  }

  for (const delivery of insights.deliveries) {
    if (!delivery.status || !/out\s+for\s+delivery|arriving/i.test(delivery.status)) continue;
    if (nowMs - delivery.seenAt > DELIVERY_FRESH_MS) continue;
    items.push({
      key: `delivery:${delivery.key}`,
      kind: "delivery",
      tone: "info",
      title: delivery.item ?? "Your parcel",
      detail: `Out for delivery${delivery.merchant ? ` · ${delivery.merchant}` : ""}`,
      amount: null,
      urgency: 2,
      at: delivery.seenAt,
    });
  }

  for (const card of insights.creditCards) {
    if (nowMs - card.asOf > CARD_FRESH_MS) continue;
    // Without the total limit there's no honest "% used"; less credit left
    // than this month's card spend is a fact the messages do state.
    if (card.spentThisMonth <= 0 || card.availableLimit >= card.spentThisMonth) continue;
    items.push({
      key: `card:${card.key}`,
      kind: "card",
      tone: "warning",
      title: `${card.bank}${card.last4 ? ` ••${card.last4}` : ""}`,
      detail: "Less credit left than you've spent this month",
      amount: card.availableLimit,
      urgency: 4,
      at: card.asOf,
    });
  }

  const pack = insights.dataPack;
  const megabytes = dataMegabytes(pack?.dataLeft ?? null);
  if (pack && megabytes !== null && megabytes < LOW_DATA_MB && nowMs - pack.asOf <= DATA_FRESH_MS) {
    items.push({
      key: "data",
      kind: "data",
      tone: "warning",
      title: "Mobile data running low",
      detail: `${pack.dataLeft} left${pack.operator ? ` · ${pack.operator}` : ""}`,
      amount: null,
      urgency: 5,
      at: pack.asOf,
    });
  }

  return items.sort((a, b) => a.urgency - b.urgency || a.at - b.at).slice(0, ACTION_CENTER_LIMIT);
}
