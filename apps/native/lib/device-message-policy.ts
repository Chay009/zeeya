export type DevicePlatform = "android" | "ios" | "web" | "other";

export interface DeviceMessagePolicy {
  capture: "direct-inbox" | "apple-shortcuts" | "unavailable";
  supported: boolean;
  requiresSmsPermission: boolean;
  showsBackgroundSync: boolean;
  showsShortcutsSetup: boolean;
  supportsHistoricalBackfill: boolean;
}

const POLICIES: Record<"android" | "ios", DeviceMessagePolicy> = {
  android: {
    capture: "direct-inbox",
    supported: true,
    requiresSmsPermission: true,
    showsBackgroundSync: true,
    showsShortcutsSetup: false,
    supportsHistoricalBackfill: true,
  },
  ios: {
    capture: "apple-shortcuts",
    supported: true,
    requiresSmsPermission: false,
    showsBackgroundSync: true,
    showsShortcutsSetup: true,
    supportsHistoricalBackfill: false,
  },
};

const UNAVAILABLE: DeviceMessagePolicy = {
  capture: "unavailable",
  supported: false,
  requiresSmsPermission: false,
  showsBackgroundSync: false,
  showsShortcutsSetup: false,
  supportsHistoricalBackfill: false,
};

export function deviceMessagePolicy(platform: DevicePlatform): DeviceMessagePolicy {
  return platform === "android" || platform === "ios" ? POLICIES[platform] : UNAVAILABLE;
}
