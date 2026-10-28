import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logoDomainFromUrl,
  logoUrlForDomain,
  markLogoDomainFailed,
  resetLogoDomainFailures,
} from "./logo-dev";

const ORIGINAL_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;

afterEach(() => {
  if (ORIGINAL_SERVER_URL === undefined) delete process.env.EXPO_PUBLIC_SERVER_URL;
  else process.env.EXPO_PUBLIC_SERVER_URL = ORIGINAL_SERVER_URL;
  resetLogoDomainFailures();
});

describe("logoUrlForDomain", () => {
  it("returns null when no server URL is configured — the default, degraded state", () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    expect(logoUrlForDomain("swiggy.com")).toBeNull();
  });

  it("builds our API's logo URL for the domain, with no vendor token in it", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test/";
    const url = logoUrlForDomain("Swiggy.com");

    expect(url).toBe("https://api.test/logos/swiggy.com.png");
    expect(url).not.toContain("token");
  });

  it("returns null for an empty or whitespace-only domain", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    expect(logoUrlForDomain("")).toBeNull();
    expect(logoUrlForDomain("   ")).toBeNull();
  });

  it("stops returning a URL for a domain once it has been marked failed — negative caching", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    expect(logoUrlForDomain("sbi.co.in")).not.toBeNull();

    markLogoDomainFailed("sbi.co.in");

    expect(logoUrlForDomain("sbi.co.in")).toBeNull();
  });

  it("negative caching for one domain does not affect another domain", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    markLogoDomainFailed("sbi.co.in");

    expect(logoUrlForDomain("hdfcbank.com")).not.toBeNull();
  });
});

describe("logoDomainFromUrl", () => {
  it("recovers the domain from a URL logoUrlForDomain built", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    expect(logoDomainFromUrl(logoUrlForDomain("sbi.co.in")!)).toBe("sbi.co.in");
  });

  it("returns null for any other image URL, including another server's /logos path", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    expect(logoDomainFromUrl("https://cdn.simpleicons.org/swiggy")).toBeNull();
    expect(logoDomainFromUrl("https://other.test/logos/swiggy.com.png")).toBeNull();
    expect(logoDomainFromUrl("not a url")).toBeNull();
  });

  it("recognizes its own URLs when the server URL has a base path", () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test/v1";
    expect(logoDomainFromUrl(logoUrlForDomain("swiggy.com")!)).toBe("swiggy.com");
  });
});

describe("failed logos", () => {
  it("are retried after a while rather than for the whole session", () => {
    vi.useFakeTimers();
    process.env.EXPO_PUBLIC_SERVER_URL = "https://api.test";
    markLogoDomainFailed("swiggy.com");
    expect(logoUrlForDomain("swiggy.com")).toBeNull();

    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(logoUrlForDomain("swiggy.com")).not.toBeNull();
    vi.useRealTimers();
  });
});
