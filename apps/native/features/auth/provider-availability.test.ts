import { describe, expect, it } from "vitest";
import { resolveProviderAvailability } from "./provider-availability";

const android = {
  platform: "android",
  googleConfigured: true,
  googleNativeReady: true,
  appleNativeReady: false,
  server: { google: true, apple: false },
};

describe("provider availability", () => {
  it("offers Google when the app and server are configured", () => {
    expect(resolveProviderAvailability(android)).toEqual({ providers: ["google"], reason: null });
  });

  it("explains a missing native module rather than blaming the connection", () => {
    const result = resolveProviderAvailability({ ...android, googleNativeReady: false });
    expect(result.providers).toEqual([]);
    expect(result.reason).toContain("app build");
  });

  it("distinguishes missing app configuration from disabled server configuration", () => {
    expect(resolveProviderAvailability({ ...android, googleConfigured: false }).reason).toContain(
      "client ID",
    );
    expect(
      resolveProviderAvailability({ ...android, server: { google: false, apple: false } }).reason,
    ).toContain("server");
  });

  it("does not offer Google alone on iOS", () => {
    expect(resolveProviderAvailability({ ...android, platform: "ios" }).providers).toEqual([]);
  });

  it("offers both providers on a fully configured iOS build", () => {
    expect(
      resolveProviderAvailability({
        ...android,
        platform: "ios",
        appleNativeReady: true,
        server: { google: true, apple: true },
      }).providers,
    ).toEqual(["google", "apple"]);
  });
});
