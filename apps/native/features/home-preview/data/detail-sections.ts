import type { Token } from "@zeeya/parser/malana";
import type { ParsedSms } from "../../../lib/sms";
import { formatDateTimeFull } from "../../dashboard/utils/format";
import type { DetailSection } from "./types";

// The category-specific allowlisted fields TransactionDetail and
// ActivityDetail both carry (see lib/dashboard-data.ts's own comments on
// each — every field here already excludes raw SMS body, grammar tags, and
// the parser's token tree; this is the SQL-backed product detail, never the
// dev-only parser dump transactionDetailSections below produces). Grouped
// by product area the same way transactionDetailSections groups
// MalanaResult fields, so the two detail screens (product vs. dev-dump)
// read as visually related without sharing implementation.
interface ProductDetailFields {
  merchantCategory: string | null;
  subcategory: string | null;
  trxType: string | null;
  isFromCard: boolean | null;
  creditLimit: string | null;
  bene: string | null;
  beneAcc: string | null;
  location: string | null;
  billAmount: string | null;
  emiAmount: string | null;
  dueDate: string | null;
  policyNo: string | null;
  rechargeAmount: string | null;
  mandateAmount: string | null;
  mandateEvent: "active" | "cancelled" | null;
  mandateMerchant: string | null;
  pnr: string | null;
  flight: string | null;
  departure: string | null;
  departureCode: string | null;
  arrival: string | null;
  arrivalCode: string | null;
  fare: string | null;
  trainBusNo: string | null;
  boardingGate: string | null;
  orderNo: string | null;
  trackingId: string | null;
  deliveryStatus: string | null;
  item: string | null;
  otp: string | null;
  otpExpiry: string | null;
  cashback: string | null;
  discount: string | null;
  offerCode: string | null;
  offerCategory: string | null;
  dataLeft: string | null;
  packBalance: string | null;
  navValue: string | null;
  folio: string | null;
  marginAmount: string | null;
  isOnlineBrand: boolean | null;
  upiHandle: string | null;
}

export function productDetailSections(detail: ProductDetailFields): DetailSection[] {
  const row = (label: string, value: string | null | undefined) =>
    value !== null && value !== undefined && value !== "" ? { label, value } : null;
  // null (unknown — the ledger JSON wasn't available to re-derive this)
  // must render distinctly from a real "no," never silently collapsed to
  // one bucket — see TransactionDetail.isFromCard's own comment.
  const bool = (label: string, value: boolean | null) =>
    value === null ? row(label, "Unknown") : value ? { label, value: "Yes" } : null;

  const sections: DetailSection[] = [
    {
      title: "Classification",
      rows: [
        row("Merchant category", detail.merchantCategory),
        row("Subcategory", detail.subcategory),
        row("Transaction type", detail.trxType),
        bool("From card", detail.isFromCard),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Bank details",
      rows: [
        row("Credit limit", detail.creditLimit),
        row("Beneficiary", detail.bene),
        row("Beneficiary account", detail.beneAcc),
        row("Location", detail.location),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Bills & mandates",
      rows: [
        row("Bill amount", detail.billAmount),
        row("EMI amount", detail.emiAmount),
        row("Due date", detail.dueDate),
        row("Policy no.", detail.policyNo),
        row("Recharge amount", detail.rechargeAmount),
        row("Mandate amount", detail.mandateAmount),
        row("Mandate status", detail.mandateEvent),
        row("Mandate merchant", detail.mandateMerchant),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Travel",
      rows: [
        row("PNR", detail.pnr),
        row("Flight", detail.flight),
        row("Departure", detail.departure),
        row("Departure code", detail.departureCode),
        row("Arrival", detail.arrival),
        row("Arrival code", detail.arrivalCode),
        row("Fare", detail.fare),
        row("Train/bus no.", detail.trainBusNo),
        row("Boarding gate", detail.boardingGate),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Delivery",
      rows: [
        row("Order no.", detail.orderNo),
        row("Tracking ID", detail.trackingId),
        row("Status", detail.deliveryStatus),
        row("Item", detail.item),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "OTP",
      rows: [row("OTP", detail.otp), row("Expires", detail.otpExpiry)].filter(
        (x): x is { label: string; value: string } => x !== null,
      ),
    },
    {
      title: "Offers",
      rows: [
        row("Cashback", detail.cashback),
        row("Discount", detail.discount),
        row("Offer code", detail.offerCode),
        row("Offer category", detail.offerCategory),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Telecom",
      rows: [row("Data left", detail.dataLeft), row("Pack balance", detail.packBalance)].filter(
        (x): x is { label: string; value: string } => x !== null,
      ),
    },
    {
      title: "Stocks & investments",
      rows: [
        row("NAV", detail.navValue),
        row("Folio", detail.folio),
        row("Margin amount", detail.marginAmount),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Brand & UPI",
      rows: [
        bool("Online brand", detail.isOnlineBrand),
        row("UPI handle", detail.upiHandle),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
  ];

  return sections.filter((section) => section.rows.length > 0);
}

// Every non-empty MalanaResult field, grouped the same way types.ts groups
// them, so "what did the parser actually extract from this message" has one
// real answer surfaced in the UI instead of the handful of fields the
// summary row shows. Booleans and the tag map are included too — this is
// meant to be a complete, literal view of the parse result, not a curated
// subset.
// One row per evidence fact, prefixed by kind, so "why did this category
// match" is answerable from the value alone (grammar-tag:trx vs
// marker:PNR vs policy:inactive-status all mean different things).
function evidenceLabel(evidence: import("@zeeya/parser/malana").MalanaCategoryEvidence): string {
  return `${evidence.kind}:${evidence.value}`;
}

// The full parse tree, flattened depth-first with indentation preserved in
// the label — this is the literal, lowest-level output of the tokenizer
// (type/raw/text/matched/locked/captured values), one row per token
// including nested children, so nothing the engine produced is hidden
// behind a summary.
function flattenTokens(tokens: Token[], path: number[] = []): { label: string; value: string }[] {
  return tokens.flatMap((token, index) => {
    const tokenPath = [...path, index];
    const indent = "  ".repeat(path.length);
    const flags = [token.matched ? "matched" : "unmatched", token.locked ? "locked" : null].filter(
      Boolean,
    );
    const values = Object.entries(token.values)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const valueParts = [`"${token.text}"`, flags.join("/"), values || null].filter(Boolean);
    const row = {
      // Path suffix (e.g. "[0.2.1]") keeps every row's label unique even
      // when the same token type repeats at the same depth under different
      // parents — DetailSection rows are keyed by label.
      label: `${indent}${token.type} [${tokenPath.join(".")}]`,
      value: valueParts.join("  ·  "),
    };
    return [row, ...flattenTokens(token.children, tokenPath)];
  });
}

export function transactionDetailSections(message: ParsedSms): DetailSection[] {
  const r = message.result;
  const row = (label: string, value: string | null | undefined) =>
    value !== null && value !== undefined && value !== "" ? { label, value } : null;
  const bool = (label: string, value: boolean) => (value ? { label, value: "Yes" } : null);

  const sections: DetailSection[] = [
    {
      title: "Classification",
      rows: [
        row("Category", r.category),
        row("Matched categories", r.matchedCategories?.join(", ") ?? null),
        row("Bank", r.bankName),
        row("Merchant category", r.merchantCategory),
        row("Subcategory", r.subcategory),
        row("Transaction type (rich)", r.trxTypeRich),
        row("Transaction type (raw)", r.trxType),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Category evidence",
      rows: (r.categoryMatches ?? []).map((match) => ({
        label: `${match.category} (${match.role})`,
        value: match.evidence.map(evidenceLabel).join(", ") || "no evidence recorded",
      })),
    },
    {
      title: "Bank details",
      rows: [
        row("Amount", r.trx),
        row("Balance", r.bal),
        row("Account", r.acc),
        row("Currency", r.currency),
        bool("From card", r.isFromCard),
        row("Credit limit", r.creditLimit),
        row("Reference", r.ref),
        row("Beneficiary", r.bene),
        row("Beneficiary account", r.beneAcc),
        row("Vendor", r.vendor),
        row("Location", r.location),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Bills & mandates",
      rows: [
        row("Bill amount", r.billAmount),
        row("EMI amount", r.emiAmount),
        row("Due date", r.dueDate),
        row("Policy no.", r.policyNo),
        row("Recharge amount", r.rechargeAmount),
        row("Mandate amount", r.mandateAmount),
        row("Mandate ID (UMN)", r.mandateId),
        row("Mandate status", r.mandateEvent),
        row("Mandate merchant", r.mandateMerchant),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Travel",
      rows: [
        row("PNR", r.pnr),
        row("Flight", r.flight),
        row("Departure", r.departure),
        row("Departure code", r.departureCode),
        row("Arrival", r.arrival),
        row("Arrival code", r.arrivalCode),
        row("Fare", r.fare),
        row("Train/bus no.", r.trainBusNo),
        row("Boarding gate", r.boardingGate),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Delivery",
      rows: [
        row("Order no.", r.orderNo),
        row("Tracking ID", r.trackingId),
        row("Status", r.deliveryStatus),
        row("Item", r.item),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "OTP",
      rows: [row("OTP", r.otp), row("Expires", r.otpExpiry)].filter(
        (x): x is { label: string; value: string } => x !== null,
      ),
    },
    {
      title: "Offers",
      rows: [
        row("Cashback", r.cashback),
        row("Discount", r.discount),
        row("Offer code", r.offerCode),
        row("Offer category", r.offerCategory),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Telecom",
      rows: [row("Data left", r.dataLeft), row("Pack balance", r.packBalance)].filter(
        (x): x is { label: string; value: string } => x !== null,
      ),
    },
    {
      title: "Stocks & investments",
      rows: [
        row("NAV", r.navValue),
        row("Folio", r.folio),
        row("Margin amount", r.marginAmount),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Brand & UPI",
      rows: [
        row("Brand", r.brandName),
        bool("Online brand", r.isOnlineBrand),
        row("UPI handle", r.upiHandle),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Spam detection",
      rows: [
        bool("Flagged as spam", r.isSpam),
        row("Spam score", Number.isFinite(r.spamScore) ? r.spamScore.toFixed(2) : null),
      ].filter((x): x is { label: string; value: string } => x !== null),
    },
    {
      title: "Raw grammar tags",
      rows: Object.entries(r.tags).map(([label, value]) => ({ label, value })),
    },
    {
      title: "Parse tree",
      rows: flattenTokens(r.tokens),
    },
    {
      title: "Message",
      rows: [
        { label: "Sender", value: message.sender },
        { label: "Received", value: formatDateTimeFull(message.date) },
        { label: "Body", value: message.body },
      ],
    },
  ];

  return sections.filter((section) => section.rows.length > 0);
}

