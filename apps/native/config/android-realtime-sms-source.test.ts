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

function source(fileName: string): string {
  return readFileSync(path.join(moduleRoot, fileName), "utf8");
}

describe("Android realtime SMS native source contract", () => {
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

    expect(store).toContain('generationKey = "generation"');
    expect(store).toContain("if (currentGeneration != acknowledgedGeneration) return");
    expect(store).not.toContain("currentCount - acknowledgedCount");
    expect(store).not.toContain("remove(generationKey)");
  });
});
