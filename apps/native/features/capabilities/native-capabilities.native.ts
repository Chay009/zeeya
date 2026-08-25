import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";

const SCREEN_CAPTURE_KEY = "zeeya-financial-data";

export async function authenticateForAppAccess(): Promise<boolean> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return false;
  if (!(await LocalAuthentication.isEnrolledAsync())) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Zeeya",
    promptSubtitle: "Authenticate to view your financial data",
    cancelLabel: "Cancel",
    biometricsSecurityLevel: "strong",
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function canEnableBiometricLock(): Promise<boolean> {
  return (
    (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  );
}

export async function setScreenCaptureProtection(enabled: boolean): Promise<void> {
  if (enabled) {
    await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
  } else {
    await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
  }
}
