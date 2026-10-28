import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const moduleRoot = path.join(
  __dirname,
  "..",
  "modules",
  "zeeya-message-queue",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "zeeyamessagequeue",
);

const moduleAndroidRoot = path.join(__dirname, "..", "modules", "zeeya-message-queue", "android");
const moduleSourceRoot = path.join(__dirname, "..", "modules", "zeeya-message-queue", "src");

function source(fileName: string): string {
  return readFileSync(path.join(moduleRoot, fileName), "utf8");
}

describe("Android realtime SMS native source contract", () => {
  it("loads the local module through expo-modules-core without initializing the Expo entrypoint", () => {
    for (const fileName of [
      "ZeeyaMessageQueueModule.android.ts",
      "ZeeyaMessageQueueModule.ios.ts",
    ]) {
      const wrapper = readFileSync(path.join(moduleSourceRoot, fileName), "utf8");

      expect(wrapper).toContain('from "expo-modules-core"');
      expect(wrapper).not.toContain('from "expo"');
    }
  });

  it("declares the Android library version required by Expo autolinking", () => {
    const buildGradle = readFileSync(path.join(moduleAndroidRoot, "build.gradle"), "utf8");

    expect(buildGradle).toMatch(/defaultConfig\s*\{[\s\S]*versionName\s+["']1\.0\.0["']/);
  });

  it("records only an arrival signal and never reads the SMS payload", () => {
    const receiver = source("ZeeyaSmsReceiver.kt");

    expect(receiver).toContain("ZeeyaSmsSignalStore.record");
    expect(receiver).not.toMatch(/getMessagesFromIntent|\bpdus\b|messageBody/);
  });

  it("clears a signal only when its monotonic generation is still current", () => {
    const store = source("ZeeyaSmsSignalStore.kt");

    expect(store).toContain('GENERATION_KEY = "generation"');
    expect(store).toContain(
      "if (preferences.getLong(GENERATION_KEY, 0) != acknowledgedGeneration) return",
    );
    expect(store).not.toContain("currentCount - acknowledgedCount");
    expect(store).not.toContain("remove(GENERATION_KEY)");
  });

  it("parses in the background instead of notifying from the receiver", () => {
    const receiver = source("ZeeyaSmsReceiver.kt");
    const service = source("ZeeyaSmsHeadlessService.kt");
    const task = readFileSync(
      path.join(__dirname, "..", "features", "capabilities", "background", "task.native.ts"),
      "utf8",
    );

    expect(receiver).toContain("ZeeyaSmsHeadlessService.start");
    expect(receiver).not.toContain("NotificationCompat");
    expect(service).toContain('TASK_NAME = "ZeeyaSmsArrived"');
    expect(task).toContain('SMS_ARRIVED_TASK = "ZeeyaSmsArrived"');
  });

  it("registers background tasks before expo-router loads any screen", () => {
    const entry = readFileSync(path.join(__dirname, "..", "index.ts"), "utf8");
    const packageJson = JSON.parse(
      readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    ) as { main: string };

    expect(packageJson.main).toBe("index.ts");
    expect(entry.indexOf("background/task")).toBeGreaterThanOrEqual(0);
    expect(entry.indexOf("background/task")).toBeLessThan(entry.indexOf("expo-router/entry"));
  });
});
