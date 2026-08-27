import { describe, expect, it } from "vitest";

import { shouldSubscribeToRealtimeSms } from "./realtime-sms-policy";

describe("realtime SMS policy", () => {
  it("requires Android, explicit opt-in, and both capture permissions", () => {
    expect(shouldSubscribeToRealtimeSms("android", true, true)).toBe(true);
    expect(shouldSubscribeToRealtimeSms("android", false, true)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("android", true, false)).toBe(false);
    expect(shouldSubscribeToRealtimeSms("ios", true, true)).toBe(false);
  });
});
