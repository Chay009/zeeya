export async function authenticateForAppAccess(): Promise<boolean> {
  return true;
}

export async function canEnableBiometricLock(): Promise<boolean> {
  return false;
}

export async function setScreenCaptureProtection(_enabled: boolean): Promise<void> {}
