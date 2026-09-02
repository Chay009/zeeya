import { afterEach, describe, expect, it } from "vitest";
import { logoUrlForDomain, markLogoDomainFailed, resetLogoDomainFailures } from "./logo-dev";

const ORIGINAL_TOKEN = process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
  else process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = ORIGINAL_TOKEN;
  resetLogoDomainFailures();
});

describe("logoUrlForDomain", () => {
  it("returns null when no token is configured — the default, degraded state", () => {
    delete process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN;
    expect(logoUrlForDomain("swiggy.com")).toBeNull();
  });

  it("builds a real img.logo.dev URL with the domain, token, and format params when a token is set", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    const url = logoUrlForDomain("swiggy.com");

    expect(url).toBe("https://img.logo.dev/swiggy.com?token=pk_test_token&format=png&retina=true");
  });

  it("returns null for an empty or whitespace-only domain even with a token set", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    expect(logoUrlForDomain("")).toBeNull();
    expect(logoUrlForDomain("   ")).toBeNull();
  });

  it("does not include a /name/ search segment — only the exact domain endpoint is used", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    expect(logoUrlForDomain("sbi.co.in")).toMatch(/^https:\/\/img\.logo\.dev\/sbi\.co\.in\?/);
  });

  it("stops returning a URL for a domain once it has been marked failed — negative caching", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    expect(logoUrlForDomain("sbi.co.in")).not.toBeNull();

    markLogoDomainFailed("sbi.co.in");

    expect(logoUrlForDomain("sbi.co.in")).toBeNull();
  });

  it("negative caching for one domain does not affect another domain", () => {
    process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN = "pk_test_token";
    markLogoDomainFailed("sbi.co.in");

    expect(logoUrlForDomain("hdfcbank.com")).not.toBeNull();
  });
});
