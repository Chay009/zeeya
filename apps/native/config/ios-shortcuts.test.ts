import plist from "@expo/plist";
import { getConfig } from "expo/config";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import nativeCapabilities from "./native-capabilities.json";

const require = createRequire(import.meta.url);
const projectRoot = path.join(__dirname, "..");
const appConfig = getConfig(projectRoot, { skipSDKVersionRequirement: true }).exp;
const targetConfigFactory = require("../targets/app-intent/expo-target.config.js") as (
  config: typeof appConfig,
) => {
  type: string;
  bundleIdentifier: string;
  deploymentTarget: string;
  frameworks: string[];
  entitlements: Record<string, string[]>;
};
const targetInfoPlist = plist.parse(
  readFileSync(path.join(projectRoot, "targets", "app-intent", "Info.plist"), "utf8"),
);
const targetSource = readFileSync(
  path.join(__dirname, "..", "targets", "app-intent", "extension.swift"),
  "utf8",
);
const moduleSource = readFileSync(
  path.join(
    __dirname,
    "..",
    "modules",
    "zeeya-message-queue",
    "ios",
    "ZeeyaMessageQueueModule.swift",
  ),
  "utf8",
);
const modulePodspec = readFileSync(
  path.join(projectRoot, "modules", "zeeya-message-queue", "ios", "ZeeyaMessageQueue.podspec"),
  "utf8",
);

describe("iOS Shortcuts build contract", () => {
  it("shares one App Group between the Expo app, native queue module, and App Intent target", () => {
    const group = nativeCapabilities.iosAppGroup;
    const target = targetConfigFactory(appConfig);

    expect(appConfig.ios?.bundleIdentifier).toBe(nativeCapabilities.iosBundleIdentifier);
    expect(appConfig.ios?.infoPlist?.ZeeyaMessageQueueAppGroup).toBe(group);
    expect(appConfig.ios?.infoPlist?.ZeeyaMessageQueueRoot).toBe(
      nativeCapabilities.messageQueueRoot,
    );
    expect(appConfig.ios?.infoPlist?.ZeeyaMessageQueueVersion).toBe(
      nativeCapabilities.messageQueueVersion,
    );
    expect(appConfig.ios?.entitlements?.["com.apple.security.application-groups"]).toEqual([group]);
    expect(target).toMatchObject({
      type: "app-intent",
      name: nativeCapabilities.appIntent.name,
      bundleIdentifier: nativeCapabilities.appIntent.bundleIdentifierSuffix,
      deploymentTarget: nativeCapabilities.iosDeploymentTarget,
      frameworks: ["CryptoKit"],
      entitlements: { "com.apple.security.application-groups": [group] },
    });
    expect(targetInfoPlist).toMatchObject({
      ZeeyaMessageQueueAppGroup: group,
      ZeeyaMessageQueueRoot: nativeCapabilities.messageQueueRoot,
      ZeeyaMessageQueueVersion: nativeCapabilities.messageQueueVersion,
      EXAppExtensionAttributes: {
        EXExtensionPointIdentifier: nativeCapabilities.appIntent.extensionPointIdentifier,
      },
    });
    expect(targetSource).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"');
    expect(moduleSource).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"');
  });

  it("fails configuration when the App Intent cannot access Zeeya's App Group", () => {
    expect(() =>
      targetConfigFactory({
        ...appConfig,
        ios: { ...appConfig.ios, entitlements: {} },
      }),
    ).toThrow(/requires the group\.com\.anonymous\.zeeya App Group entitlement/);
  });

  it("keeps the App Intent producer and Expo module consumer on queue contract v1", () => {
    for (const source of [targetSource, moduleSource]) {
      expect(source).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueRoot"');
      expect(source).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueVersion"');
    }
  });

  it("does not retain malformed raw financial messages", () => {
    expect(moduleSource).toContain('AsyncFunction("quarantine")');
    expect(moduleSource).not.toContain("rejected-\\(queueVersion)");
  });

  it("makes delayed Shortcut retries stable before a message reaches the ledger", () => {
    expect(targetSource).toContain("duplicateWindowMilliseconds");
    expect(targetSource).toContain('"receipts-\\(queueVersion)"');
    expect(targetSource).toContain("SHA256.hash");
    expect(targetSource).toContain('message + "\\u{0}" + String(receivedAtMilliseconds)');
    expect(targetSource).toContain("pruneExpiredReceipts");
    expect(targetSource).toContain("Already saved securely for Zeeya");
  });

  it("declares the Face ID permission copy used by the shared biometric setting", () => {
    expect(appConfig.ios?.infoPlist?.NSFaceIDUsageDescription).toMatch(/Face ID/);
  });

  it("aligns the Expo app deployment target with its iOS 17 App Intent extension", () => {
    expect(appConfig.plugins).toContainEqual([
      "expo-build-properties",
      { ios: { deploymentTarget: nativeCapabilities.iosDeploymentTarget } },
    ]);
    expect(modulePodspec).toContain("native_capabilities.fetch('iosDeploymentTarget')");
    expect(modulePodspec).not.toContain(":ios => '17.0'");
    expect(modulePodspec).not.toContain(":tvos");
  });
});
