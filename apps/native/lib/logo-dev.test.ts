import { afterEach, describe, expect, it } from "vitest";
import { logoUrlFor } from "./logo-dev";

const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
  else process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = ORIGINAL_TOKEN;
});

describe("logoUrlFor", () => {
  it("returns null when no token is configured — the default, degraded state", () => {
    delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
    expect(logoUrlFor("Swiggy")).toBeNull();
  });

  it("builds a real img.logo.dev URL with the name, token, and format params when a token is set", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    const url = logoUrlFor("Swiggy");

    expect(url).toBe("https://img.logo.dev/name/Swiggy?token=pk_test_token&format=png&retina=true");
  });

  it("URL-encodes a name containing spaces or special characters", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    const url = logoUrlFor("State Bank of India");

    expect(url).toContain(encodeURIComponent("State Bank of India"));
    expect(url).not.toContain(" ");
  });

  it("returns null for an empty or whitespace-only name even with a token set", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    expect(logoUrlFor("")).toBeNull();
    expect(logoUrlFor("   ")).toBeNull();
  });

  it("always includes the /name/ path segment — confirmed directly against the real API that the bare img.logo.dev/{name} path only resolves for names that happen to look like a domain (e.g. 'HDFC'), not free-text names like 'State Bank of India'", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    expect(logoUrlFor("State Bank of India")).toMatch(/^https:\/\/img\.logo\.dev\/name\//);
    expect(logoUrlFor("HDFC Bank")).toMatch(/^https:\/\/img\.logo\.dev\/name\//);
  });
});
