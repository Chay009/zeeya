import { describe, expect, it } from "vitest";

import { dataMegabytes, deriveActionItems } from "./action-center";
import { EMPTY_MESSAGE_INSIGHTS, type MessageInsights } from "./message-insights";

const NOW = new Date(2026, 9, 3, 12);
const day = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).getTime();

function insights(overrides: Partial<MessageInsights>): MessageInsights {
  return { ...EMPTY_MESSAGE_INSIGHTS, ...overrides };
}

const bill = (key: string, dueDay: number) => ({
  key,
  name: key,
  kind: "bill" as const,
  amount: 1000,
  currency: "INR",
  dueAt: day(dueDay),
  dueLabel: null,
  reference: null,
  seenAt: day(1),
});

describe("deriveActionItems", () => {
  it("is empty when nothing is current", () => {
    expect(deriveActionItems(EMPTY_MESSAGE_INSIGHTS, NOW)).toEqual([]);
  });

  it("ranks an overdue bill above one due tomorrow, and skips one due next week", () => {
    const items = deriveActionItems(
      insights({ billsDue: [bill("later", 12), bill("tomorrow", 4), bill("late", 2)] }),
      NOW,
    );
    expect(items.map((item) => [item.key, item.tone])).toEqual([
      ["bill:late", "critical"],
      ["bill:tomorrow", "warning"],
    ]);
  });

  it("shows a flight within two days with its time, never a dateless one", () => {
    const trip = {
      key: "abc123",
      title: "6E 2341",
      pnr: "ABC123",
      from: "BLR",
      to: "DEL",
      departure: "05 Oct 06:15",
      gate: "12",
      fare: null,
      seenAt: day(2),
    };
    const items = deriveActionItems(
      insights({
        trips: [
          { ...trip, departsAt: day(5, 6, 15) },
          { ...trip, key: "nodate", departsAt: null },
          { ...trip, key: "far", departsAt: day(20, 9) },
        ],
      }),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "BLR → DEL", kind: "trip" });
    expect(items[0]!.detail).toContain("06:15");
  });

  it("only flags a card when less credit is left than this month's card spend", () => {
    const card = {
      key: "hdfc|5678",
      bank: "HDFC Bank",
      last4: "5678",
      currency: "INR",
      asOf: day(3),
    };
    const items = deriveActionItems(
      insights({
        creditCards: [
          { ...card, availableLimit: 2000, spentThisMonth: 9000 },
          { ...card, key: "fine", availableLimit: 85000, spentThisMonth: 9000 },
        ],
      }),
      NOW,
    );
    expect(items.map((item) => item.key)).toEqual(["card:hdfc|5678"]);
  });

  it("flags low, fresh mobile data and an out-for-delivery parcel", () => {
    const items = deriveActionItems(
      insights({
        dataPack: { dataLeft: "150 MB", packBalance: null, operator: "Jio", asOf: day(3, 9) },
        deliveries: [
          {
            key: "tba1",
            item: "boAt Airdopes",
            merchant: "Amazon",
            status: "out for delivery",
            trackingId: "TBA1",
            seenAt: day(3, 8),
          },
        ],
      }),
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["delivery", "data"]);
  });

  it("caps the list", () => {
    const items = deriveActionItems(
      insights({ billsDue: [1, 2, 3, 4, 5, 6].map((d) => bill(`b${d}`, d)) }),
      NOW,
    );
    expect(items).toHaveLength(4);
  });
});

describe("dataMegabytes", () => {
  it.each([
    ["150 MB", 150],
    ["1.5GB", 1536],
    ["data", null],
  ])("%s", (raw, expected) => {
    expect(dataMegabytes(raw)).toBe(expected);
  });
});
