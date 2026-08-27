import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";
import {
  DEVICE_LOCK_AUTHENTICATION_OPTIONS,
  hasEnrolledDeviceAuthentication,
} from "./device-lock-policy";

const SCREEN_CAPTURE_KEY = "zeeya-financial-data";

export async function authenticateForAppAccess(): Promise<boolean> {
  const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
  if (!hasEnrolledDeviceAuthentication(enrolledLevel)) return false;

  const result = await LocalAuthentication.authenticateAsync(DEVICE_LOCK_AUTHENTICATION_OPTIONS);
  return result.success;
}

export async function canEnableBiometricLock(): Promise<boolean> {
  const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
  return hasEnrolledDeviceAuthentication(enrolledLevel);
}

export async function setScreenCaptureProtection(enabled: boolean): Promise<void> {
  if (enabled) {
    await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    if (Platform.OS === "ios") await ScreenCapture.enableAppSwitcherProtectionAsync(0.8);
  } else {
    await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    if (Platform.OS === "ios") await ScreenCapture.disableAppSwitcherProtectionAsync();
  }
}
