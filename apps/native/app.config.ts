import plist, { type PlistObject } from "@expo/plist";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { readFileSync } from "node:fs";
import path from "node:path";

import nativeCapabilities from "./config/native-capabilities.json";

const READ_SMS = "android.permission.READ_SMS";
const RECEIVE_SMS = "android.permission.RECEIVE_SMS";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function plistString(source: PlistObject, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function assertAppIntentInfoPlistContract(): void {
  const infoPlistPath = path.join(__dirname, "targets", "app-intent", "Info.plist");
  const infoPlist = plist.parse(readFileSync(infoPlistPath, "utf8"));
  const extensionAttributes = infoPlist.EXAppExtensionAttributes;
  const extensionPoint =
    extensionAttributes &&
    typeof extensionAttributes === "object" &&
    !Array.isArray(extensionAttributes)
      ? plistString(extensionAttributes, "EXExtensionPointIdentifier")
      : null;
  const actual = {
    appGroup: plistString(infoPlist, "ZeeyaMessageQueueAppGroup"),
    root: plistString(infoPlist, "ZeeyaMessageQueueRoot"),
    version: plistString(infoPlist, "ZeeyaMessageQueueVersion"),
    extensionPoint,
  };
  const expected = {
    appGroup: nativeCapabilities.iosAppGroup,
    root: nativeCapabilities.messageQueueRoot,
    version: nativeCapabilities.messageQueueVersion,
    extensionPoint: nativeCapabilities.appIntent.extensionPointIdentifier,
  };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `App Intent Info.plist has drifted from config/native-capabilities.json: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  if (config.plugins?.length) {
    throw new Error(
      "Declare Expo plugins in app.config.ts so Zeeya's native plugin order has one owner.",
    );
  }

  assertAppIntentInfoPlistContract();

  const appleTeamId = process.env.EXPO_APPLE_TEAM_ID?.trim();

  return {
    ...config,
    name: config.name ?? "zeeya",
    slug: config.slug ?? "zeeya",
    android: {
      ...config.android,
      package: nativeCapabilities.androidPackage,
      permissions: unique([...(config.android?.permissions ?? []), READ_SMS, RECEIVE_SMS]),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: nativeCapabilities.iosBundleIdentifier,
      ...(appleTeamId ? { appleTeamId } : {}),
      infoPlist: {
        ...config.ios?.infoPlist,
        NSFaceIDUsageDescription: "Use Face ID to protect your financial information in Zeeya.",
        ZeeyaMessageQueueAppGroup: nativeCapabilities.iosAppGroup,
        ZeeyaMessageQueueRoot: nativeCapabilities.messageQueueRoot,
        ZeeyaMessageQueueVersion: nativeCapabilities.messageQueueVersion,
      },
      entitlements: {
        ...config.ios?.entitlements,
        "com.apple.security.application-groups": [nativeCapabilities.iosAppGroup],
      },
    },
    plugins: [
      "expo-font",
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#f5fbf7",
          dark: { backgroundColor: "#10251e" },
        },
      ],
      "expo-background-task",
      "expo-local-authentication",
      "expo-notifications",
      "expo-secure-store",
      ["expo-sqlite", { useSQLCipher: true }],
      [
        "expo-build-properties",
        { ios: { deploymentTarget: nativeCapabilities.iosDeploymentTarget } },
      ],
      "./plugins/withRealtimeSmsReceiver",
      "@bacons/apple-targets",
    ],
  };
};
