import { detectAirports } from "./enrichment";
import type { MalanaResult } from "./types";

// Precise extraction for the rich fields the seed grammar only tags coarsely
// (it stores the bare word "due" as a due date, drops "Avl Lmt", keeps only
// the digits of an alphanumeric PNR or tracking id, …). Runs once on the
// composed result: a field is filled when the grammar left it empty or with
// a value that cannot be what it names, and a value that already looks right
// is never overwritten. Every pattern is anchored on the field's own label
// ("due date", "Avl Lmt", "PNR", "tracking id", …), so text without that
// label is never read as the field.

const AMOUNT = String.raw`(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)`;
const DATE = String.raw`(\d{1,2}[-/.\s](?:\d{1,2}|[a-z]{3,9})[-/.\s,]*\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}(?:\s+\d{2,4})?|[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?)`;

const DUE_DATE = new RegExp(
  String.raw`(?:due\s*(?:date)?|payable\s*(?:by|on|before)|pay\s*(?:by|before)|last\s*date)\s*(?:is|on|by|of)?\s*[:\-]?\s*` +
    DATE,
  "i",
);
const TOTAL_DUE = new RegExp(
  String.raw`(?:total\s*(?:amt\.?|amount)?\s*due|amount\s*due|bill\s*(?:amt\.?|amount)?(?:\s*of)?|premium(?:\s*amount)?(?:\s*of)?)\s*(?:is|of|:)?\s*` +
    AMOUNT,
  "i",
);
const EMI = new RegExp(String.raw`emi\s*(?:amount|amt\.?)?\s*(?:of|is|:)?\s*` + AMOUNT, "i");
const AVAILABLE_LIMIT = new RegExp(
  String.raw`(?:avl|avbl|avail(?:able)?)\.?\s*(?:cr(?:edit|\.)?\s*)?(?:lmt|limit)\.?\s*(?:is|:)?\s*` +
    AMOUNT,
  "i",
);
const CASHBACK = new RegExp(
  String.raw`(?:cashback\s*(?:of|worth|amount)?\s*(?:is|:)?\s*` +
    AMOUNT +
    String.raw`|` +
    AMOUNT +
    String.raw`\s*(?:has\s*been\s*)?(?:credited\s*(?:as|towards)\s*)?cashback)`,
  "i",
);
const PNR = /\bpnr\s*(?:no\.?|number)?\s*(?:is|:|-)?\s*([a-z0-9]{5,10})\b/i;
const FLIGHT = /\b(6E|AI|UK|SG|QP|IX|I5|G8|9I|S5)\s?-?\s?(\d{2,4})\b/;
const ROUTE = /\bfrom\s+([a-z][a-z .]{1,30}?)\s+to\s+([a-z][a-z .]{1,30}?)(?=\s+(?:on|departs?|at|dep|via|scheduled)\b|[.,]|$)/i;
const DEPARTS = new RegExp(String.raw`\bdepart(?:s|ure|ing)?\s*(?:on|at|:)?\s*(` + String.raw`\d{1,2}\s+[a-z]{3}(?:\s+\d{1,2}[:.]\d{2})?|\d{1,2}[:.]\d{2})`, "i");
const GATE = /\bgate\s*(?:no\.?)?\s*[:\-]?\s*([a-z]?\d{1,3}[a-z]?)\b/i;
const TRACKING = /\b(?:tracking|awb|track(?:ing)?\s*(?:id|no\.?|number))\s*(?:id|no\.?|number)?\s*(?:is|:|-)?\s*([a-z0-9]{6,})\b/i;
const ITEM = /\border\s*(?:no\.?|id|#)?\s*[\w-]+\s*for\s+(.+?)\s+(?:has\s+been|is|was|will)\b/i;
const DELIVERY_STATUS = /\b(out\s+for\s+delivery|delivered|shipped|dispatched|arriving\s+(?:today|tomorrow))\b/i;
const NAV = new RegExp(String.raw`\bnav\b[^.]*?\b(?:is|:)\s*` + AMOUNT, "i");
const FOLIO = /\bfolio\s*(?:no\.?|number)?\s*(?:is|:|-)?\s*([\d/]{4,})/i;
const DATA_LEFT = /\bdata\s*(?:left|balance|remaining)\s*(?:is|:)?\s*([\d.]+\s*(?:gb|mb))\b/i;
// A statement or due notice tells you what you owe; it is not a payment.
const BILL_NOTICE =
  /\b(?:statement|total\s*(?:amt\.?|amount)?\s*due|min(?:imum)?\.?\s*(?:amt\.?|amount)?\s*due|payment\s*due\s*date)\b/i;
const COMPLETED_PAYMENT =
  /\b(?:debited|credited|received|spent|paid|withdrawn|charged|deducted|purchase\s+of|txn\s+of|transaction\s+of)\b/i;

function looksLikeAmount(value: string | null): boolean {
  return value !== null && /\d/.test(value);
}

function looksLikeDate(value: string | null): boolean {
  return value !== null && /\d/.test(value) && /[a-z]{3}|[-/.]/i.test(value);
}

function capture(pattern: RegExp, message: string, group = 1): string | null {
  const match = pattern.exec(message);
  const value = match?.[group]?.trim();
  return value ? value : null;
}

function plainAmount(value: string | null): string | null {
  return value ? value.replace(/,/g, "") : null;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
}

export function extractRichFields(message: string, result: MalanaResult): MalanaResult {
  const next: MalanaResult = { ...result };

  // Bills, EMIs, premiums.
  if (!looksLikeDate(next.dueDate)) next.dueDate = capture(DUE_DATE, message);
  if (!looksLikeAmount(next.billAmount)) next.billAmount = plainAmount(capture(TOTAL_DUE, message));
  if (!looksLikeAmount(next.emiAmount)) next.emiAmount = plainAmount(capture(EMI, message));

  // A statement / due notice is not a spend, unless a payment verb says it
  // also records one ("Rs 500 paid towards your card statement").
  if (BILL_NOTICE.test(message) && !COMPLETED_PAYMENT.test(message)) {
    next.trx = null;
    next.trxType = null;
    next.trxTypeRich = null;
  }

  // Cards.
  if (!looksLikeAmount(next.creditLimit)) {
    next.creditLimit = plainAmount(capture(AVAILABLE_LIMIT, message));
  }

  // Cashback — and a cashback amount the grammar filed as a bill amount.
  const cashback = plainAmount(
    capture(CASHBACK, message, 1) ?? capture(CASHBACK, message, 2),
  );
  if (!looksLikeAmount(next.cashback) && cashback) {
    next.cashback = cashback;
    if (next.billAmount === cashback && !TOTAL_DUE.test(message)) next.billAmount = null;
  }

  // Travel.
  const pnr = capture(PNR, message);
  if (pnr && (!next.pnr || pnr.length > next.pnr.length)) next.pnr = pnr.toUpperCase();
  const flight = FLIGHT.exec(message);
  if (flight && (!next.flight || !/[a-z]/i.test(next.flight))) {
    next.flight = `${flight[1]!.toUpperCase()} ${flight[2]}`;
  }
  const route = ROUTE.exec(message);
  if (route) {
    if (!next.departureCode) next.departureCode = detectAirports(route[1]!)[0]?.code ?? null;
    if (!next.arrivalCode) next.arrivalCode = detectAirports(route[2]!)[0]?.code ?? null;
    if (!next.arrival) next.arrival = titleCase(route[2]!);
  }
  const departs = capture(DEPARTS, message);
  if (departs && !next.departure) next.departure = departs;
  if (!next.boardingGate) next.boardingGate = capture(GATE, message);

  // Deliveries.
  const tracking = capture(TRACKING, message);
  if (tracking && (!next.trackingId || tracking.length > next.trackingId.length)) {
    next.trackingId = tracking.toUpperCase();
  }
  const item = capture(ITEM, message);
  if (item && (!next.item || /^(track|order|your)$/i.test(next.item))) next.item = item;
  if (!next.deliveryStatus) {
    const status = capture(DELIVERY_STATUS, message);
    next.deliveryStatus = status ? status.toLowerCase() : null;
  }

  // Funds.
  if (!looksLikeAmount(next.navValue)) next.navValue = plainAmount(capture(NAV, message));
  if (!next.folio) next.folio = capture(FOLIO, message);

  // Mobile data.
  if (!next.dataLeft) next.dataLeft = capture(DATA_LEFT, message);

  return next;
}
