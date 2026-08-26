import { describe, expect, it } from "vitest";

import { DEVICE_LOCK_AUTHENTICATION_OPTIONS } from "./device-lock-policy";

describe("device lock policy", () => {
  it("allows the operating-system PIN or passcode when biometrics are unavailable", () => {
    expect(DEVICE_LOCK_AUTHENTICATION_OPTIONS).toMatchObject({
      biometricsSecurityLevel: "strong",
      disableDeviceFallback: false,
    });
  });
});
