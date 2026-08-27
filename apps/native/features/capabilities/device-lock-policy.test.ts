import type { SecurityLevel } from "expo-local-authentication";
import { describe, expect, it } from "vitest";

import {
  DEVICE_LOCK_AUTHENTICATION_OPTIONS,
  hasEnrolledDeviceAuthentication,
} from "./device-lock-policy";

describe("device lock policy", () => {
  it("allows the operating-system PIN or passcode when biometrics are unavailable", () => {
    expect(DEVICE_LOCK_AUTHENTICATION_OPTIONS).toMatchObject({
      biometricsSecurityLevel: "strong",
      disableDeviceFallback: false,
    });
  });

  it("accepts an enrolled device credential even without biometrics", () => {
    const none = 0 as SecurityLevel;
    const deviceCredential = 1 as SecurityLevel;
    const strongBiometric = 3 as SecurityLevel;

    expect(hasEnrolledDeviceAuthentication(none)).toBe(false);
    expect(hasEnrolledDeviceAuthentication(deviceCredential)).toBe(true);
    expect(hasEnrolledDeviceAuthentication(strongBiometric)).toBe(true);
  });
});
