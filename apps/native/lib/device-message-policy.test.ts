import { describe, expect, it } from "vitest";

import { deviceMessagePolicy } from "./device-message-policy";

describe("deviceMessagePolicy", () => {
  it("uses direct inbox permission and background controls on Android", () => {
    expect(deviceMessagePolicy("android")).toEqual({
      capture: "direct-inbox",
      supported: true,
      requiresSmsPermission: true,
      showsBackgroundSync: true,
      showsShortcutsSetup: false,
      supportsHistoricalBackfill: true,
    });
  });

  it("uses Apple Shortcuts without SMS permission on iOS", () => {
    expect(deviceMessagePolicy("ios")).toEqual({
      capture: "apple-shortcuts",
      supported: true,
      requiresSmsPermission: false,
      showsBackgroundSync: true,
      showsShortcutsSetup: true,
      supportsHistoricalBackfill: false,
    });
  });

  it("does not claim message capture on web", () => {
    expect(deviceMessagePolicy("web").supported).toBe(false);
  });
});
