import { createMalanaEngine } from "@zeeya/parser/malana";
import { describe, expect, it } from "vitest";

import {
  deriveMessageInsights,
  parseDepartureTime,
  parseLooseDate,
  toMessageFact,
  type MessageFact,
} from "./message-insights";
import type { ParsedSms } from "./sms";

const NOW = new Date(2026, 9, 3, 12);
const at = (day: number) => new Date(2026, 9, day, 10).getTime();

// Realistic bank / biller / travel / delivery / fund / telecom SMS, parsed by
// the real engine — so these tests hold the parser and the insights to one
// contract.
const SAMPLES: [string, string, number][] = [
  [
    "VM-HDFCBK",
    "Your HDFC Bank Credit Card XX5678 statement is generated. Total Amt Due Rs 12,345.00, Min Amt Due Rs 620.00. Payment Due Date 15-Oct-2026.",
    at(1),
  ],
  [
    "AD-BAJAJF",
    "Dear Customer, EMI of Rs 4,250 for your loan A/c 998877 is due on 10/10/2026. Please keep sufficient balance.",
    at(2),
  ],
  [
    "VM-LICIND",
    "Premium of Rs 6,100 for policy no 123456789 is due on 20-10-2026. Pay online at licindia.in",
    at(2),
  ],
  [
    "VM-HDFCBK",
    "Rs.1,299.00 spent on HDFC Bank Credit Card XX5678 at AMAZON on 2026-10-02. Avl Lmt: Rs.85,400.00",
    at(2),
  ],
  [
    "VM-PAYTMB",
    "Congratulations! Cashback of Rs 50 has been credited to your Paytm wallet for your recharge.",
    at(2),
  ],
  [
    "VM-INDIGO",
    "Your IndiGo flight 6E 2341 PNR ABC123 from Bengaluru to Delhi departs 05 Oct 06:15. Gate 12.",
    at(3),
  ],
  [
    "VM-AMAZON",
    "Your Amazon order 402-1234567 for boAt Airdopes has been shipped. Track with tracking ID TBA123456789.",
    at(3),
  ],
  [
    "VM-CAMSMF",
    "NAV of HDFC Flexi Cap Fund for folio 1234567/89 is Rs 1,845.32 as on 02-Oct-2026.",
    at(2),
  ],
  [
    "JIO",
    "You have used 90% of your daily data. Data left: 150 MB. Pack valid till 05-Oct-2026.",
    at(3),
  ],
  [
    "VM-HDFCBK",
    "Rs.420.00 debited from A/c XX1234 to swiggy@icici UPI Ref 123456 on 02-10-26.",
    at(2),
  ],
];

function facts(): MessageFact[] {
  const engine = createMalanaEngine();
  return SAMPLES.flatMap(([sender, body, date], index) => {
    const message: ParsedSms = {
      id: `m${index}`,
      sender,
      body,
      date,
      result: engine.parse(body, sender),
    };
    return toMessageFact(message) ?? [];
  });
}

describe("deriveMessageInsights", () => {
  const insights = deriveMessageInsights(facts(), NOW, "INR");

  it("lists bills, EMIs and premiums by due date, with amounts", () => {
    expect(
      insights.billsDue.map((bill) => ({
        kind: bill.kind,
        amount: bill.amount,
        due: new Date(bill.dueAt!).getDate(),
      })),
    ).toEqual([
      { kind: "emi", amount: 4250, due: 10 },
      { kind: "bill", amount: 12345, due: 15 },
      { kind: "insurance", amount: 6100, due: 20 },
    ]);
  });

  it("reads a card's available limit and this month's card spend", () => {
    expect(insights.creditCards).toEqual([
      expect.objectContaining({
        bank: "HDFC Bank",
        last4: "5678",
        availableLimit: 85400,
        spentThisMonth: 1299,
      }),
    ]);
  });

  it("splits this month's spend by card vs UPI and online vs in-store, statements excluded", () => {
    expect(insights.paymentMix).toEqual({ card: 1299, upi: 420, other: 0, count: 2 });
    const { online, offline, unknown } = insights.onlineMix;
    expect(online + offline + unknown).toBe(1719);
  });

  it("files spend with no matched brand and no location as unknown, not in store", () => {
    const base = facts().find((fact) => fact.fields.isFromCard && fact.fields.trx)!;
    const spend = (id: string, fields: Partial<MessageFact["fields"]>): MessageFact => ({
      ...base,
      id,
      fields: {
        ...base.fields,
        isOnlineBrand: false,
        brandKnown: false,
        location: null,
        ...fields,
      },
    });
    const mix = deriveMessageInsights(
      [
        spend("a", { isOnlineBrand: true, brandKnown: true }),
        spend("b", { brandKnown: true }),
        spend("c", { location: "Indiranagar" }),
        spend("d", {}),
        // Projected before brandKnown existed: still unknown, never in store.
        spend("e", { brandKnown: undefined }),
      ],
      NOW,
      "INR",
    ).onlineMix;
    const each = parseFloat((base.fields.trx ?? "0").replace(/,/g, ""));
    expect(mix).toEqual({ online: each, offline: 2 * each, unknown: 2 * each });
  });

  it("keeps parcels with no id and no item apart", () => {
    const base = facts().find((fact) => fact.fields.trackingId)!;
    const parcel = (id: string): MessageFact => ({
      ...base,
      id,
      fields: { ...base.fields, trackingId: null, orderNo: null, item: null },
    });
    const { deliveries } = deriveMessageInsights([parcel("p1"), parcel("p2")], NOW, "INR");
    expect(deliveries).toHaveLength(2);
  });

  it("reads a trip's departure date and time", () => {
    expect(insights.trips[0]?.departsAt).toBe(new Date(2026, 9, 5, 6, 15).getTime());
  });

  it("totals cashback", () => {
    expect(insights.cashback).toEqual({ total: 50, count: 1 });
  });

  it("keeps a trip's PNR, flight and route", () => {
    expect(insights.trips).toEqual([
      expect.objectContaining({
        pnr: "ABC123",
        title: "6E 2341",
        from: "BLR",
        to: "DEL",
        gate: "12",
      }),
    ]);
  });

  it("keeps a delivery's item, tracking id and status", () => {
    expect(insights.deliveries).toEqual([
      expect.objectContaining({
        item: "boAt Airdopes",
        trackingId: "TBA123456789",
        status: "shipped",
      }),
    ]);
  });

  it("reads a fund's NAV and folio, and the data left", () => {
    expect(insights.investments).toEqual([
      expect.objectContaining({ nav: 1845.32, folio: "1234567/89" }),
    ]);
    expect(insights.dataPack?.dataLeft).toBe("150 MB");
  });

  it("drops a bill whose due date passed more than a few days ago", () => {
    const later = deriveMessageInsights(facts(), new Date(2026, 9, 25), "INR");
    expect(later.billsDue.map((bill) => bill.kind)).toEqual([]);
  });
});

describe("parseLooseDate", () => {
  const reference = new Date(2026, 9, 3);
  it.each([
    ["15-Oct-2026", 2026, 9, 15],
    ["10/10/2026", 2026, 9, 10],
    ["20-10-26", 2026, 9, 20],
    ["2026-10-05", 2026, 9, 5],
    ["Oct 15, 2026", 2026, 9, 15],
    ["05 Jan", 2027, 0, 5],
  ])("%s", (raw, year, month, day) => {
    expect(parseLooseDate(raw, reference)).toBe(new Date(year, month, day).getTime());
  });

  it("returns null for text that isn't a date", () => {
    expect(parseLooseDate("due", reference)).toBeNull();
  });

  it("never reads a time's hours as the year", () => {
    expect(parseLooseDate("05 Oct 06:15", reference)).toBe(new Date(2026, 9, 5).getTime());
    expect(parseLooseDate("Oct 5 18:40", reference)).toBe(new Date(2026, 9, 5).getTime());
  });
});

describe("parseDepartureTime", () => {
  const reference = new Date(2026, 9, 3);
  it.each([
    ["05 Oct 06:15", new Date(2026, 9, 5, 6, 15)],
    ["05-Oct-2026 6:40 PM", new Date(2026, 9, 5, 18, 40)],
    ["05 Oct", new Date(2026, 9, 5)],
  ])("%s", (raw, expected) => {
    expect(parseDepartureTime(raw, reference)).toBe(expected.getTime());
  });

  it("returns null when there's no date to count down to", () => {
    expect(parseDepartureTime("06:15", reference)).toBeNull();
    expect(parseDepartureTime("Bengaluru", reference)).toBeNull();
  });
});
