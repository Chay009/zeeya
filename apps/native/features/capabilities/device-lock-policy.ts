// Zeeya delegates fallback authentication to the operating system instead
// of storing an app-specific PIN. On Android this permits the enrolled device
// PIN/pattern/password; on iOS it permits the device passcode.
export const DEVICE_LOCK_AUTHENTICATION_OPTIONS = {
  promptMessage: "Unlock Zeeya",
  promptSubtitle: "Authenticate to view your financial data",
  cancelLabel: "Cancel",
  biometricsSecurityLevel: "strong",
  disableDeviceFallback: false,
} as const;

/**
 * `SecurityLevel.SECRET` represents an enrolled device PIN, pattern, password,
 * or passcode. The app lock therefore does not require biometric hardware or
 * biometric enrollment; the operating system can provide the fallback.
 */
export function hasEnrolledDeviceAuthentication(level: SecurityLevel): boolean {
  return level > 0;
}
import type { SecurityLevel } from "expo-local-authentication";
