import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const nativeRoot = path.resolve(__dirname, "..");

function source(relativePath: string): string {
  return readFileSync(path.join(nativeRoot, relativePath), "utf8");
}

function walkSource(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkSource(absolutePath) : [absolutePath];
  });
}

describe("Metro bundle import boundaries", () => {
  it("imports Hugeicons per icon, never the catalog barrel", () => {
    const files = walkSource(nativeRoot).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
    const barrel = files.filter((file) =>
      /from ["']@hugeicons\/core-free-icons["']/.test(readFileSync(file, "utf8")),
    );
    const perIcon = files.flatMap((file) =>
      readFileSync(file, "utf8").match(/@hugeicons\/core-free-icons\/dist\/esm\//g) ?? [],
    );

    expect(barrel).toEqual([]);
    expect(perIcon.length).toBeGreaterThan(0);
  });

  it("loads only the font faces registered by the app", () => {
    const fonts = source("lib/fonts.ts");

    // Per-face imports only (never a family's barrel, which bundles every
    // weight): Inter 400/500/600/700/800 + Plus Jakarta Sans 500/600/700/800.
    expect(fonts).not.toMatch(/from ["']@expo-google-fonts\/(inter|plus-jakarta-sans)["']/);
    expect(fonts.match(/@expo-google-fonts\/(inter|plus-jakarta-sans)\//g)).toHaveLength(9);
  });

  it("keeps tests and Node-only imports outside Expo Router's app tree", () => {
    const files = walkSource(path.join(nativeRoot, "app"));
    const testFiles = files.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file));
    const nodeImports = files.flatMap((file) => {
      if (!/\.[cm]?[jt]sx?$/.test(file)) return [];
      return /from ["']node:/.test(readFileSync(file, "utf8")) ? [file] : [];
    });

    expect(testFiles).toEqual([]);
    expect(nodeImports).toEqual([]);
  });
});
