import { describe, expect, it } from "vitest";

import { shouldSyncSmsOnArrival, shouldSubscribeToRealtimeSms } from "./realtime-sms-policy";

describe("realtime SMS policy", () => {
  it("requires Android, an active app, and both capture permissions", () => {
    expect(shouldSubscribeToRealtimeSms("android", true, true)).toBe(true);
    expect(shouldSubscribeToRealtimeSms("android", false, true)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("android", true, false)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("ios", true, true)).toBe(false);
  });

  it("syncs SMS on arrival only when both automation preferences are enabled", () => {
    expect(
      shouldSyncSmsOnArrival({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldSyncSmsOnArrival({
        backgroundSyncEnabled: false,
        transactionNotificationsEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldSyncSmsOnArrival({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: false,
      }),
    ).toBe(false);
  });
});
