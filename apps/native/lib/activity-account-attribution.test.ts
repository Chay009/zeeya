import { describe, expect, it } from "vitest";

import {
  legacyActivityMatchesAccount,
  resolveActivityAccountId,
  toActivityAccountAttributionCandidate,
} from "./activity-account-attribution";

const hdfc1111 = toActivityAccountAttributionCandidate(
  { bankName: "HDFC Bank", last4: "1111", currency: "INR" },
  "hdfc bank|1111",
);
const hdfc2222 = toActivityAccountAttributionCandidate(
  { bankName: "HDFC Bank", last4: "2222", currency: "INR" },
  "hdfc bank|2222",
);
const sbi3333 = toActivityAccountAttributionCandidate(
  { bankName: "SBI", last4: "3333", currency: "INR" },
  "sbi|3333",
);

describe("resolveActivityAccountId", () => {
  it("resolves an exact bank + last4 match", () => {
    expect(
      resolveActivityAccountId("HDFC Bank", "XX2222", "INR", [hdfc1111, hdfc2222]),
    ).toBe("hdfc bank|2222");
  });

  it("keeps two accounts at one bank distinguishable by last4", () => {
    expect(
      resolveActivityAccountId("HDFC Bank", "XX1111", "INR", [hdfc1111, hdfc2222]),
    ).toBe("hdfc bank|1111");
    expect(
      resolveActivityAccountId("HDFC Bank", "XX2222", "INR", [hdfc1111, hdfc2222]),
    ).toBe("hdfc bank|2222");
  });

  it("resolves missing last4 when exactly one bank+currency account exists", () => {
    expect(resolveActivityAccountId("SBI", null, "INR", [sbi3333])).toBe("sbi|3333");
  });

  it("leaves missing last4 unassigned when multiple bank+currency accounts exist", () => {
    expect(resolveActivityAccountId("HDFC Bank", null, "INR", [hdfc1111, hdfc2222])).toBeNull();
  });

  it("does not match across currencies", () => {
    const usdOnly = toActivityAccountAttributionCandidate(
      { bankName: "HDFC Bank", last4: "1111", currency: "USD" },
      "hdfc bank|1111-usd",
    );
    expect(resolveActivityAccountId("HDFC Bank", "XX1111", "INR", [usdOnly])).toBeNull();
  });
});

describe("legacyActivityMatchesAccount", () => {
  const accounts = [
    { key: hdfc1111.id, bankName: "HDFC Bank", last4: "1111", currency: "INR" },
    { key: hdfc2222.id, bankName: "HDFC Bank", last4: "2222", currency: "INR" },
  ];

  it("matches the legacy selected-account filter via the shared resolver", () => {
    expect(
      legacyActivityMatchesAccount(
        { bankName: "HDFC Bank", accountLast4: "XX2222", currency: "INR" },
        accounts[1]!,
        accounts,
      ),
    ).toBe(true);
    expect(
      legacyActivityMatchesAccount(
        { bankName: "HDFC Bank", accountLast4: "XX2222", currency: "INR" },
        accounts[0]!,
        accounts,
      ),
    ).toBe(false);
  });
});
