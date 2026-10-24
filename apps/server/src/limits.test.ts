import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiLimit, authBodyLimit } from "./limits";

// Real getCookieCache by default (signature checks included); one test fakes a
// verified session to check the per-user key.
vi.mock("better-auth/cookies", async (importOriginal) => {
  const original = await importOriginal<typeof import("better-auth/cookies")>();
  return { ...original, getCookieCache: vi.fn(original.getCookieCache) };
});
const { getCookieCache } = await import("better-auth/cookies");

const IP = "203.0.113.7";

// Same wiring as index.ts, with stubs standing in for Better Auth and tRPC.
function setup(allow = true) {
  const API_LIMITER = { limit: vi.fn(async (_opts: { key: string }) => ({ success: allow })) };
  const handler = vi.fn(() => new Response("ok"));
  const app = new Hono();
  app.post("/api/auth/*", authBodyLimit, handler);
  app.use("/trpc/*", apiLimit);
  app.get("/trpc/*", handler);
  const call = (path: string, init: RequestInit = {}) =>
    app.request(
      `https://api.example.com${path}`,
      { ...init, headers: { "cf-connecting-ip": IP, ...init.headers } },
      { API_LIMITER, BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret" },
    );
  return { call, handler, API_LIMITER };
}

beforeEach(() => {
  vi.mocked(getCookieCache).mockClear();
});

describe("authBodyLimit", () => {
  const signIn = "/api/auth/sign-in/social";

  it("accepts a social sign-in carrying a full-size ID token", async () => {
    const t = setup();
    const body = JSON.stringify({ provider: "google", idToken: { token: "x".repeat(2048) } });
    expect((await t.call(signIn, { method: "POST", body })).status).toBe(200);
  });

  it("rejects an oversized body, with or without Content-Length", async () => {
    const t = setup();
    const big = JSON.stringify({ provider: "google", pad: "x".repeat(20_000) });
    const declared = await t.call(signIn, { method: "POST", body: big });
    const chunk = new TextEncoder().encode(big);
    const streamed = await t.call(signIn, {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
    expect(t.handler).not.toHaveBeenCalled();
  });
});

describe("apiLimit", () => {
  it("keys a verified session by user id", async () => {
    vi.mocked(getCookieCache).mockResolvedValueOnce({
      user: { id: "user-1" },
      session: { id: "s1" },
      updatedAt: Date.now(),
    } as Awaited<ReturnType<typeof getCookieCache>>);
    const t = setup();
    await t.call("/trpc/healthCheck");
    expect(t.API_LIMITER.limit).toHaveBeenCalledWith({ key: "u:user-1" });
  });

  it("treats forged session cookies as anonymous (IP key)", async () => {
    const t = setup();
    for (const forged of ["a", "b"]) {
      await t.call("/trpc/healthCheck", {
        headers: {
          cookie: `better-auth.session_token=${forged}; better-auth.session_data=${forged}`,
        },
      });
    }
    expect(t.API_LIMITER.limit.mock.calls.map(([o]) => o.key)).toEqual([`ip:${IP}`, `ip:${IP}`]);
  });

  it("falls back to the IP when signed out, and blocks when limited", async () => {
    const t = setup(false);
    const res = await t.call("/trpc/healthCheck");
    expect(t.API_LIMITER.limit).toHaveBeenCalledWith({ key: `ip:${IP}` });
    expect(res.status).toBe(429);
    expect(t.handler).not.toHaveBeenCalled();
  });
});
