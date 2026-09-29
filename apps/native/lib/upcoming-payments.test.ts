import { describe, expect, it } from "vitest";

import {
  inferUpcomingSubscriptionPayments,
  medianSubscriptionCadenceDays,
  nextSubscriptionExpectedAt,
} from "./upcoming-payments";

describe("inferUpcomingSubscriptionPayments", () => {
  it("projects monthly subscription dates with end-of-month clamping and stable ordering", () => {
    const items = inferUpcomingSubscriptionPayments(
      [
        {
          id: "annual-video|INR",
          merchant: "Video",
          amountMinorUnits: 900,
          currency: "INR",
          count: 4,
          lastDate: new Date(2026, 0, 31, 9).getTime(),
          confidence: "likely",
        },
        {
          id: "music|INR",
          merchant: "Music",
          amountMinorUnits: 300,
          currency: "INR",
          count: 2,
          lastDate: new Date(2026, 1, 15, 9).getTime(),
          confidence: "possible",
        },
      ],
      new Date(2026, 1, 10, 12).getTime(),
      5,
    );

    expect(items).toEqual([
      {
        id: "music|INR",
        source: "subscription",
        merchant: "Music",
        amountMinorUnits: 300,
        currency: "INR",
        expectedAt: new Date(2026, 1, 15, 9).getTime(),
        confidence: "possible",
        estimated: true,
      },
      {
        id: "annual-video|INR",
        source: "subscription",
        merchant: "Video",
        amountMinorUnits: 900,
        currency: "INR",
        expectedAt: new Date(2026, 1, 28, 9).getTime(),
        confidence: "likely",
        estimated: true,
      },
    ]);
  });

  it("rolls forward from the original billing day without drifting after a short month", () => {
    const [payment] = inferUpcomingSubscriptionPayments(
      [
        {
          id: "video|INR",
          merchant: "Video",
          amountMinorUnits: 900,
          currency: "INR",
          count: 4,
          lastDate: new Date(2026, 0, 31, 9).getTime(),
          confidence: "likely",
        },
      ],
      new Date(2026, 2, 1).getTime(),
      1,
    );

    expect(payment?.expectedAt).toBe(new Date(2026, 2, 31, 9).getTime());
  });

  it("uses an observed non-monthly cadence for upcoming dates", () => {
    const dates = [new Date(2026, 5, 1, 9).getTime(), new Date(2026, 6, 16, 9).getTime()];
    const cadenceDays = medianSubscriptionCadenceDays(dates);
    const [payment] = inferUpcomingSubscriptionPayments(
      [
        {
          id: "delivery|INR",
          merchant: "Delivery",
          amountMinorUnits: 1_000,
          currency: "INR",
          count: 2,
          lastDate: dates[1]!,
          confidence: "possible",
        },
      ],
      new Date(2026, 7, 1, 12).getTime(),
      1,
      new Map([["delivery|INR", cadenceDays]]),
    );

    expect(cadenceDays).toBe(45);
    expect(payment?.expectedAt).toBe(new Date(2026, 7, 30, 9).getTime());
    expect(payment?.expectedAt).toBe(
      nextSubscriptionExpectedAt(dates[1]!, new Date(2026, 7, 1, 12).getTime(), 45),
    );
  });

  // The cadence evidence is every recent expense at the merchant, so a
  // subscription merchant you also buy from often can measure "3 days".
  // That must not turn a monthly subscription into "due every 3 days".
  it("ignores a measured cadence outside the subscription band and projects monthly", () => {
    const lastDate = new Date(2026, 6, 10, 9).getTime();
    const at = new Date(2026, 6, 20, 12).getTime();

    expect(nextSubscriptionExpectedAt(lastDate, at, 3)).toBe(new Date(2026, 7, 10, 9).getTime());
    expect(nextSubscriptionExpectedAt(lastDate, at, 90)).toBe(new Date(2026, 7, 10, 9).getTime());
    // Inside the band, a non-monthly cadence is still honoured.
    expect(nextSubscriptionExpectedAt(lastDate, at, 21)).toBe(new Date(2026, 6, 31, 9).getTime());
  });
});
