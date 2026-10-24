import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
// Use Expo's own Babel peer rather than introducing a second transformer.
const { transformSync } = createRequire(require.resolve("babel-preset-expo"))("@babel/core");
afterEach(() => vi.unstubAllEnvs());

it("embeds public native configuration into the production bundle without a runtime env object", () => {
  vi.stubEnv("EXPO_PUBLIC_SERVER_URL", "https://api.example.test");
  vi.stubEnv("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", "google-web-client-under-test");
  vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "google-ios-client-under-test");
  const filename = path.resolve(__dirname, "../../../packages/env/src/native.ts");
  const result = transformSync(readFileSync(filename, "utf8"), {
    filename,
    configFile: false,
    babelrc: false,
    presets: [[require.resolve("babel-preset-expo"), { reactCompiler: false }]],
    caller: {
      name: "metro",
      bundler: "metro",
      platform: "android",
      isDev: false,
      isServer: false,
      isNodeModule: false,
    },
  });
  expect(result.code).toContain("https://api.example.test");
  expect(result.code).toContain("google-web-client-under-test");
  expect(result.code).toContain("google-ios-client-under-test");
  expect(result.code).not.toMatch(/process\.env/);
});
