import type { ParsedSms } from "./sms";
import { trxDirection } from "./transaction-direction";

// Everything the parser extracts beyond the transaction basics — due dates,
// card limits, cashback, trips, deliveries, fund NAVs, data packs, places —
// turned into the few facts a screen can show.
//
// Two steps, split by when they can run:
//  - toMessageFact (projection time): keeps, per message, only the fields
//    these insights read — never the body or the token tree — so the
//    `message_facts` projection table can serve them without any read ever
//    touching sms_ledger.
//  - deriveMessageInsights (read time): turns facts into insights against
//    TODAY's clock (what's due soon, this month's mix), so they stay right
//    across midnight without a re-projection.
// Each list is empty when the user's messages carry no such data, so a
// screen shows a card only when there is something real to show.

export interface MessageFactFields {
  bankName: string | null;
  last4: string;
  trx: string | null;
  trxTypeRich: ParsedSms["result"]["trxTypeRich"];
  isFromCard: boolean;
  /** The message paid by UPI (a UPI handle, or "UPI" in the text). */
  viaUpi: boolean;
  isOnlineBrand: boolean;
  /**
   * The parser matched a known brand, so `isOnlineBrand: false` really means
   * in store. Absent on facts projected before this field existed.
   */
  brandKnown?: boolean;
  location: string | null;
  merchant: string | null;
  creditLimit: string | null;
  dueDate: string | null;
  billAmount: string | null;
  emiAmount: string | null;
  policyNo: string | null;
  cashback: string | null;
  pnr: string | null;
  flight: string | null;
  trainBusNo: string | null;
  departure: string | null;
  arrival: string | null;
  departureCode: string | null;
  arrivalCode: string | null;
  boardingGate: string | null;
  fare: string | null;
  trackingId: string | null;
  orderNo: string | null;
  deliveryStatus: string | null;
  item: string | null;
  navValue: string | null;
  folio: string | null;
  dataLeft: string | null;
  packBalance: string | null;
}

export interface MessageFact {
  id: string;
  date: number;
  sender: string;
  currency: string;
  fields: MessageFactFields;
}

export interface BillDue {
  key: string;
  name: string;
  kind: "bill" | "emi" | "insurance";
  /** Major units; null when the message names a due date but no amount. */
  amount: number | null;
  currency: string;
  /** Local-midnight ms when the due date could be read; null otherwise. */
  dueAt: number | null;
  /** The due date as the message wrote it, for when it can't be read. */
  dueLabel: string | null;
  reference: string | null;
  /** When the reminder arrived. */
  seenAt: number;
}

export interface CreditCardSnapshot {
  key: string;
  bank: string;
  last4: string;
  /** Available credit the bank last reported. */
  availableLimit: number;
  currency: string;
  asOf: number;
  /** Card spends captured this month. */
  spentThisMonth: number;
}

export interface Trip {
  key: string;
  title: string;
  pnr: string | null;
  from: string | null;
  to: string | null;
  departure: string | null;
  /** Departure as local ms when the message's date (and time) could be read. */
  departsAt: number | null;
  gate: string | null;
  fare: number | null;
  seenAt: number;
}

export interface Delivery {
  key: string;
  item: string | null;
  merchant: string | null;
  status: string | null;
  trackingId: string | null;
  seenAt: number;
}

export interface Investment {
  key: string;
  name: string;
  folio: string | null;
  nav: number;
  asOf: number;
}

export interface DataPack {
  dataLeft: string | null;
  packBalance: string | null;
  operator: string | null;
  asOf: number;
}

export interface PlaceSpend {
  place: string;
  amount: number;
  count: number;
}

export interface MessageInsights {
  billsDue: BillDue[];
  creditCards: CreditCardSnapshot[];
  /** This month's spending by how it was paid (major units, primary currency). */
  paymentMix: { card: number; upi: number; other: number; count: number };
  /**
   * This month's spending at online brands, in store (a known offline brand
   * or a point-of-sale location), and where the message doesn't say.
   */
  onlineMix: { online: number; offline: number; unknown: number };
  cashback: { total: number; count: number };
  trips: Trip[];
  deliveries: Delivery[];
  investments: Investment[];
  dataPack: DataPack | null;
  places: PlaceSpend[];
}

export const EMPTY_MESSAGE_INSIGHTS: MessageInsights = {
  billsDue: [],
  creditCards: [],
  paymentMix: { card: 0, upi: 0, other: 0, count: 0 },
  onlineMix: { online: 0, offline: 0, unknown: 0 },
  cashback: { total: 0, count: 0 },
  trips: [],
  deliveries: [],
  investments: [],
  dataPack: null,
  places: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a due date stays relevant after it passes. */
const OVERDUE_GRACE_DAYS = 3;
/** Deliveries and trips older than this are history, not status. */
const DELIVERY_WINDOW_DAYS = 10;
const TRIP_WINDOW_DAYS = 30;
/** How far back a read needs facts: the longest window above, plus margin. */
export const MESSAGE_FACTS_WINDOW_DAYS = 120;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseAmountString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function fullYear(year: number): number {
  return year >= 100 ? year : 2000 + year;
}

/**
 * Reads the date formats bank and biller SMS use — "15-10-2026",
 * "15/10/26", "15-Oct-2026", "15 Oct 2026", "15 Oct", "Oct 15, 2026",
 * "2026-10-15" — to local midnight. A date with no year takes the year that
 * puts it nearest `reference` (a "05 Jan" reminder read in December is next
 * year). Null when it can't be read.
 */
export function parseLooseDate(raw: string | null | undefined, reference: Date): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]) - 1;
    day = Number(match[3]);
  }
  if (!match) {
    match = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})\b/.exec(text);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]) - 1;
      year = fullYear(Number(match[3]));
    }
  }
  if (!match) {
    // A year is never the hours of a time ("05 Oct 06:15").
    match =
      /^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]*([a-z]{3})[a-z]*[-/.,\s]*(?:(\d{2,4})(?![\d:]))?/.exec(
        text,
      );
    if (match && MONTHS.includes(match[2]!)) {
      day = Number(match[1]);
      month = MONTHS.indexOf(match[2]!);
      year = match[3] ? fullYear(Number(match[3])) : undefined;
    } else {
      match = null;
    }
  }
  if (!match) {
    match =
      /^([a-z]{3})[a-z]*[-/.\s]*(\d{1,2})(?:st|nd|rd|th)?,?[-/.\s]*(?:(\d{2,4})(?![\d:]))?/.exec(
        text,
      );
    if (match && MONTHS.includes(match[1]!)) {
      month = MONTHS.indexOf(match[1]!);
      day = Number(match[2]);
      year = match[3] ? fullYear(Number(match[3])) : undefined;
    } else {
      match = null;
    }
  }
  if (day === undefined || month === undefined || month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }
  if (year === undefined) {
    const candidates = [-1, 0, 1].map((offset) =>
      new Date(reference.getFullYear() + offset, month!, day!).getTime(),
    );
    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - reference.getTime()) < Math.abs(best - reference.getTime())
        ? candidate
        : best,
    );
  }
  const date = new Date(year, month, day);
  return date.getMonth() === month ? date.getTime() : null;
}

/**
 * A departure like "05 Oct 06:15" or "2026-10-05 18:40" to local ms — the
 * date read as parseLooseDate does, plus the clock time when there is one.
 * Null when there's no readable date, so nothing counts down to a guess.
 */
export function parseDepartureTime(raw: string | null | undefined, reference: Date): number | null {
  const day = parseLooseDate(raw, reference);
  if (day === null || !raw) return null;
  const time = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(raw);
  if (!time) return day;
  let hours = Number(time[1]);
  const minutes = Number(time[2]);
  const meridiem = time[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return day;
  const date = new Date(day);
  date.setHours(hours, minutes);
  return date.getTime();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const RICH_KEYS = [
  "creditLimit",
  "dueDate",
  "billAmount",
  "emiAmount",
  "cashback",
  "pnr",
  "flight",
  "trainBusNo",
  "trackingId",
  "orderNo",
  "deliveryStatus",
  "navValue",
  "dataLeft",
  "packBalance",
  "location",
] as const;

/**
 * The fact a message contributes, or null when it carries nothing these
 * insights read (no rich field and no captured spend).
 */
export function toMessageFact(message: ParsedSms): MessageFact | null {
  const { result } = message;
  const isSpend =
    result.trxTypeRich !== null &&
    trxDirection(result.trxTypeRich) === "expense" &&
    parseAmountString(result.trx) !== null;
  if (!isSpend && !RICH_KEYS.some((key) => result[key])) return null;
  const merchant = result.brandName ?? result.vendor ?? result.mandateMerchant ?? null;
  return {
    id: message.id,
    date: message.date,
    sender: message.sender,
    currency: result.currency ?? "INR",
    fields: {
      bankName: result.bankName,
      last4: result.acc ? result.acc.replace(/\D/g, "").slice(-4) : "",
      trx: result.trx,
      trxTypeRich: result.trxTypeRich,
      isFromCard: result.isFromCard,
      viaUpi: Boolean(result.upiHandle) || /\bupi\b/i.test(message.body),
      isOnlineBrand: result.isOnlineBrand,
      brandKnown: Boolean(result.brandName),
      location: result.location,
      merchant: merchant ? titleCase(merchant.trim()) : null,
      creditLimit: result.creditLimit,
      dueDate: result.dueDate,
      billAmount: result.billAmount,
      emiAmount: result.emiAmount,
      policyNo: result.policyNo,
      cashback: result.cashback,
      pnr: result.pnr,
      flight: result.flight,
      trainBusNo: result.trainBusNo,
      departure: result.departure,
      arrival: result.arrival,
      departureCode: result.departureCode,
      arrivalCode: result.arrivalCode,
      boardingGate: result.boardingGate,
      fare: result.fare,
      trackingId: result.trackingId,
      orderNo: result.orderNo,
      deliveryStatus: result.deliveryStatus,
      item: result.item,
      navValue: result.navValue,
      folio: result.folio,
      dataLeft: result.dataLeft,
      packBalance: result.packBalance,
    },
  };
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

function isSameMonth(ms: number, at: Date): boolean {
  const date = new Date(ms);
  return date.getFullYear() === at.getFullYear() && date.getMonth() === at.getMonth();
}

/** Keeps the newest item per key. */
function newestBy<T extends { seenAt: number }>(items: T[], key: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const current = byKey.get(key(item));
    if (!current || item.seenAt > current.seenAt) byKey.set(key(item), item);
  }
  return [...byKey.values()];
}

export function deriveMessageInsights(
  facts: readonly MessageFact[],
  now: Date,
  currency: string,
): MessageInsights {
  const today = startOfDay(now);
  const bills: BillDue[] = [];
  const cardLimits = new Map<string, CreditCardSnapshot>();
  const cardSpend = new Map<string, number>();
  const paymentMix = { card: 0, upi: 0, other: 0, count: 0 };
  const onlineMix = { online: 0, offline: 0, unknown: 0 };
  const cashback = { total: 0, count: 0 };
  const trips: Trip[] = [];
  const deliveries: Delivery[] = [];
  const investments = new Map<string, Investment>();
  let dataPack: DataPack | null = null;
  const places = new Map<string, PlaceSpend>();

  for (const fact of facts) {
    const f = fact.fields;
    const sameCurrency = fact.currency === currency;
    const thisMonth = isSameMonth(fact.date, now);
    const name = f.merchant;

    // Bills, EMIs and insurance premiums with a due date.
    if (f.dueDate && sameCurrency) {
      const dueAt = parseLooseDate(f.dueDate, new Date(fact.date));
      if (dueAt === null || dueAt >= today - OVERDUE_GRACE_DAYS * DAY_MS) {
        bills.push({
          key: `${(name ?? f.bankName ?? fact.sender).toLowerCase()}|${f.policyNo ?? f.last4}`,
          name: name ?? f.bankName ?? "Bill",
          kind: f.emiAmount ? "emi" : f.policyNo ? "insurance" : "bill",
          amount:
            parseAmountString(f.billAmount) ??
            parseAmountString(f.emiAmount) ??
            parseAmountString(f.trx),
          currency: fact.currency,
          dueAt,
          dueLabel: dueAt === null ? f.dueDate : null,
          reference: f.policyNo,
          seenAt: fact.date,
        });
      }
    }

    // A card's available credit, newest per card.
    const availableLimit = parseAmountString(f.creditLimit);
    if (availableLimit !== null && f.bankName && sameCurrency) {
      const key = `${f.bankName}|${f.last4}`;
      const current = cardLimits.get(key);
      if (!current || fact.date > current.asOf) {
        cardLimits.set(key, {
          key,
          bank: f.bankName,
          last4: f.last4,
          availableLimit,
          currency: fact.currency,
          asOf: fact.date,
          spentThisMonth: 0,
        });
      }
    }

    // This month's spending: how it was paid, where, online or not.
    const amount = parseAmountString(f.trx);
    const isExpense = f.trxTypeRich !== null && trxDirection(f.trxTypeRich) === "expense";
    if (thisMonth && isExpense && amount !== null && sameCurrency) {
      paymentMix.count += 1;
      if (f.isFromCard) {
        paymentMix.card += amount;
        if (f.bankName) {
          const key = `${f.bankName}|${f.last4}`;
          cardSpend.set(key, (cardSpend.get(key) ?? 0) + amount);
        }
      } else if (f.viaUpi) {
        paymentMix.upi += amount;
      } else {
        paymentMix.other += amount;
      }
      // No matched brand means the parser can't tell — not "in store".
      if (f.isOnlineBrand) onlineMix.online += amount;
      else if (f.brandKnown || f.location) onlineMix.offline += amount;
      else onlineMix.unknown += amount;
      if (f.location) {
        const place = titleCase(f.location);
        const current = places.get(place) ?? { place, amount: 0, count: 0 };
        current.amount += amount;
        current.count += 1;
        places.set(place, current);
      }
    }

    // Cashback credited this month.
    const cashbackAmount = parseAmountString(f.cashback);
    if (thisMonth && cashbackAmount !== null && sameCurrency) {
      cashback.total += cashbackAmount;
      cashback.count += 1;
    }

    // Trips: flights, trains, buses seen in the last month.
    if ((f.pnr || f.flight || f.trainBusNo) && fact.date >= today - TRIP_WINDOW_DAYS * DAY_MS) {
      trips.push({
        key: (f.pnr ?? f.flight ?? f.trainBusNo ?? fact.id).toLowerCase(),
        title: f.flight ?? (f.trainBusNo ? `Train ${f.trainBusNo}` : (name ?? "Trip")),
        pnr: f.pnr,
        from: (f.departureCode ?? f.departure)?.toUpperCase() ?? null,
        to: (f.arrivalCode ?? f.arrival)?.toUpperCase() ?? null,
        departure: f.departure,
        departsAt: parseDepartureTime(f.departure, new Date(fact.date)),
        gate: f.boardingGate,
        fare: parseAmountString(f.fare),
        seenAt: fact.date,
      });
    }

    // Deliveries still in motion.
    if (
      (f.trackingId || f.orderNo || f.deliveryStatus) &&
      fact.date >= today - DELIVERY_WINDOW_DAYS * DAY_MS
    ) {
      deliveries.push({
        // Without an id, two parcels from one shop only merge when the item
        // matches too; with no item either, each message stands alone.
        key: (f.trackingId ?? f.orderNo ?? (f.item ? `${name}|${f.item}` : fact.id)).toLowerCase(),
        item: f.item,
        merchant: name,
        status: f.deliveryStatus,
        trackingId: f.trackingId ?? f.orderNo,
        seenAt: fact.date,
      });
    }

    // Mutual fund NAVs, newest per folio.
    const nav = parseAmountString(f.navValue);
    if (nav !== null) {
      const key = (f.folio ?? name ?? fact.sender).toLowerCase();
      const current = investments.get(key);
      if (!current || fact.date > current.asOf) {
        investments.set(key, {
          key,
          name: name ?? "Mutual fund",
          folio: f.folio,
          nav,
          asOf: fact.date,
        });
      }
    }

    // The newest mobile data / pack status.
    if ((f.dataLeft || f.packBalance) && (!dataPack || fact.date > dataPack.asOf)) {
      dataPack = {
        dataLeft: f.dataLeft,
        packBalance: f.packBalance,
        operator: name,
        asOf: fact.date,
      };
    }
  }

  const isDelivered = (status: string | null) => (status ? /delivered\b/i.test(status) : false);

  return {
    billsDue: newestBy(bills, (bill) => bill.key).sort(
      (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER),
    ),
    creditCards: [...cardLimits.values()]
      .map((card) => ({ ...card, spentThisMonth: cardSpend.get(card.key) ?? 0 }))
      .sort((a, b) => b.asOf - a.asOf),
    paymentMix,
    onlineMix,
    cashback,
    trips: newestBy(trips, (trip) => trip.key).sort((a, b) => b.seenAt - a.seenAt),
    deliveries: newestBy(deliveries, (delivery) => delivery.key)
      // Delivered more than two days ago is done; recent deliveries stay as good news.
      .filter((delivery) => !isDelivered(delivery.status) || delivery.seenAt >= today - 2 * DAY_MS)
      .sort((a, b) => b.seenAt - a.seenAt),
    investments: [...investments.values()].sort((a, b) => b.asOf - a.asOf),
    dataPack,
    places: [...places.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
  };
}
