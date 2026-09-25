import { describe, expect, it } from "vitest";

import { shouldNotifyBackgroundSms, shouldSubscribeToRealtimeSms } from "./realtime-sms-policy";

describe("realtime SMS policy", () => {
  it("requires Android, an active app, and both capture permissions", () => {
    expect(shouldSubscribeToRealtimeSms("android", true, true)).toBe(true);
    expect(shouldSubscribeToRealtimeSms("android", false, true)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("android", true, false)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("ios", true, true)).toBe(false);
  });

  it("posts native background notices only when both automation preferences are enabled", () => {
    expect(
      shouldNotifyBackgroundSms({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldNotifyBackgroundSms({
        backgroundSyncEnabled: false,
        transactionNotificationsEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyBackgroundSms({
        backgroundSyncEnabled: true,
        transactionNotificationsEnabled: false,
      }),
    ).toBe(false);
  });
});
