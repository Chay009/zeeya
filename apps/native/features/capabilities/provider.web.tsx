import type { PropsWithChildren } from "react";

import type { LocalSettings } from "@/db/settings";

export type CapabilityPreference = keyof LocalSettings;

export function CapabilityProvider({ children }: PropsWithChildren) {
  return children;
}

export function useCapabilities() {
  return {
    settings: {
      backgroundSyncEnabled: false,
      transactionNotificationsEnabled: false,
      biometricLockEnabled: false,
      screenCaptureProtectionEnabled: false,
    },
    error: "SMS automation and device privacy controls are available in the native app.",
    setPreference: async (_key: CapabilityPreference, _enabled: boolean) => false,
  };
}
