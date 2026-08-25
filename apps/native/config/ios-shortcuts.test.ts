import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const appConfig = JSON.parse(readFileSync(path.join(__dirname, "..", "app.json"), "utf8")) as {
  expo: {
    ios: {
      bundleIdentifier: string;
      infoPlist: Record<string, string>;
      entitlements: Record<string, string[]>;
    };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};
const targetConfigFactory = require("../targets/app-intent/expo-target.config.js") as (
  config: typeof appConfig.expo,
) => {
  type: string;
  bundleIdentifier: string;
  deploymentTarget: string;
  frameworks: string[];
  entitlements: Record<string, string[]>;
};
const targetInfoPlist = readFileSync(
  path.join(__dirname, "..", "targets", "app-intent", "Info.plist"),
  "utf8",
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

describe("iOS Shortcuts build contract", () => {
  it("shares one App Group between the Expo app, native queue module, and App Intent target", () => {
    const group = "group.com.anonymous.zeeya";
    const target = targetConfigFactory(appConfig.expo);

    expect(appConfig.expo.ios.bundleIdentifier).toBe("com.anonymous.zeeya");
    expect(appConfig.expo.ios.infoPlist.ZeeyaMessageQueueAppGroup).toBe(group);
    expect(appConfig.expo.ios.infoPlist.ZeeyaMessageQueueRoot).toBe("message-queue");
    expect(appConfig.expo.ios.infoPlist.ZeeyaMessageQueueVersion).toBe("v1");
    expect(appConfig.expo.ios.entitlements["com.apple.security.application-groups"]).toEqual([
      group,
    ]);
    expect(target).toMatchObject({
      type: "app-intent",
      bundleIdentifier: ".shortcuts",
      deploymentTarget: "17.0",
      frameworks: ["CryptoKit"],
      entitlements: { "com.apple.security.application-groups": [group] },
    });
    expect(targetInfoPlist).toContain(`<string>${group}</string>`);
    expect(targetInfoPlist).toContain("<key>ZeeyaMessageQueueRoot</key>");
    expect(targetInfoPlist).toContain("<string>message-queue</string>");
    expect(targetInfoPlist).toContain("<key>ZeeyaMessageQueueVersion</key>");
    expect(targetInfoPlist).toContain("<string>v1</string>");
    expect(targetSource).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"');
    expect(moduleSource).toContain('forInfoDictionaryKey: "ZeeyaMessageQueueAppGroup"');
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
    expect(appConfig.expo.ios.infoPlist.NSFaceIDUsageDescription).toMatch(/Face ID/);
  });

  it("aligns the Expo app deployment target with its iOS 17 App Intent extension", () => {
    expect(appConfig.expo.plugins).toContainEqual([
      "expo-build-properties",
      { ios: { deploymentTarget: "17.0" } },
    ]);
  });
});
