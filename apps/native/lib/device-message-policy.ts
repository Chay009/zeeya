export type DevicePlatform = "android" | "ios" | "web" | "other";

export interface DeviceMessagePolicy {
  capture: "direct-inbox" | "apple-shortcuts" | "unavailable";
  supported: boolean;
  requiresSmsReadPermission: boolean;
  requiresSmsReceivePermission: boolean;
  showsBackgroundSync: boolean;
  showsShortcutsSetup: boolean;
  supportsHistoricalBackfill: boolean;
}

const POLICIES: Record<"android" | "ios", DeviceMessagePolicy> = {
  android: {
    capture: "direct-inbox",
    supported: true,
    requiresSmsReadPermission: true,
    requiresSmsReceivePermission: true,
    showsBackgroundSync: true,
    showsShortcutsSetup: false,
    supportsHistoricalBackfill: true,
  },
  ios: {
    capture: "apple-shortcuts",
    supported: true,
    requiresSmsReadPermission: false,
    requiresSmsReceivePermission: false,
    showsBackgroundSync: true,
    showsShortcutsSetup: true,
    supportsHistoricalBackfill: false,
  },
};

const UNAVAILABLE: DeviceMessagePolicy = {
  capture: "unavailable",
  supported: false,
  requiresSmsReadPermission: false,
  requiresSmsReceivePermission: false,
  showsBackgroundSync: false,
  showsShortcutsSetup: false,
  supportsHistoricalBackfill: false,
};

export function deviceMessagePolicy(platform: DevicePlatform): DeviceMessagePolicy {
  return platform === "android" || platform === "ios" ? POLICIES[platform] : UNAVAILABLE;
}
