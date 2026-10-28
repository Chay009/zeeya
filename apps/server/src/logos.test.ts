import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  cached: null as { user: { id: string } } | null,
  full: null as { user: { id: string } } | null,
}));

vi.mock("better-auth/cookies", () => ({
  getCookieCache: vi.fn(async () => session.cached),
}));
vi.mock("@zeeya/auth", () => ({
  createAuth: () => ({ api: { getSession: vi.fn(async () => session.full) } }),
}));

import { logoEdgeCache, logoLimit, parseLogoDomain, requireSession, serveLogo } from "./logos";

type Stored = { bytes: Uint8Array; customMetadata?: Record<string, string> };

function fakeBucket() {
  const objects = new Map<string, Stored>();
  return {
    objects,
    get: vi.fn(async (key: string) => {
      const object = objects.get(key);
      return object
        ? { body: new Response(object.bytes).body, customMetadata: object.customMetadata }
        : null;
    }),
    put: vi.fn(
      async (
        key: string,
        value: ArrayBuffer | Uint8Array,
        options?: { customMetadata?: Record<string, string> },
      ) => {
        objects.set(key, { bytes: new Uint8Array(value), customMetadata: options?.customMetadata });
      },
    ),
  };
}

function setup({ allowed = true } = {}) {
  const bucket = fakeBucket();
  const limit = vi.fn(async (_options: { key: string }) => ({ success: allowed }));
  const env = {
    LOGOS: bucket,
    LOGO_DEV_SECRET_KEY: "sk_test",
    LOGO_LIMITER: { limit },
    BETTER_AUTH_SECRET: "secret",
  };
  const app = new Hono();
  app.get(
    "/logos/:file",
    requireSession as never,
    logoLimit as never,
    logoEdgeCache as never,
    serveLogo as never,
  );
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    passThroughOnException: vi.fn(),
    props: {},
  };
  const request = async (path: string) => {
    const response = await app.fetch(
      new Request(`https://api.example.com${path}`),
      env as never,
      ctx as never,
    );
    await Promise.all(pending);
    return response;
  };
  return { bucket, limit, request };
}

// A real PNG header followed by a few bytes.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SIGNED_URL = "https://img.logo.dev/signed/swiggy?sig=abc";

/** Stubs Logo.dev: the API lookup, then the signed download. */
function stubLogoDev({
  lookup = () => Response.json({ data: { url: SIGNED_URL } }),
  file = () => new Response(PNG, { headers: { "content-type": "image/png" } }),
}: { lookup?: () => Response; file?: () => Response } = {}) {
  const upstream = vi.fn(async (input: RequestInfo | URL) =>
    String(input).startsWith("https://api.logo.dev/") ? lookup() : file(),
  );
  vi.stubGlobal("fetch", upstream);
  return upstream;
}

const edgeCache = new Map<string, Response>();

beforeEach(() => {
  session.cached = { user: { id: "user-1" } };
  session.full = null;
  edgeCache.clear();
  const store = {
    match: async (key: Request | string) =>
      edgeCache.get(typeof key === "string" ? key : key.url)?.clone(),
    put: async (key: Request | string, response: Response) => {
      edgeCache.set(typeof key === "string" ? key : key.url, response);
    },
  };
  vi.stubGlobal("caches", { open: async () => store, default: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseLogoDomain", () => {
  it("accepts a lowercase hostname with a .png suffix", () => {
    expect(parseLogoDomain("swiggy.com.png")).toBe("swiggy.com");
    expect(parseLogoDomain("SBI.co.in.png")).toBe("sbi.co.in");
  });

  it("rejects anything that isn't a plain domain", () => {
    for (const file of [
      "swiggy.com",
      "localhost.png",
      "https:%2F%2Fevil.com.png",
      "evil.com%2Fx.png",
      "a..com.png",
      "-bad.com.png",
      "127.0.0.1.png",
      ".png",
    ]) {
      expect(parseLogoDomain(file)).toBeNull();
    }
  });
});

describe("GET /logos/:file — access", () => {
  it("refuses signed-out requests before touching R2 or Logo.dev", async () => {
    session.cached = null;
    const upstream = stubLogoDev();
    const { bucket, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(401);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("accepts a session Better Auth resolves when the cache cookie is absent", async () => {
    session.cached = null;
    session.full = { user: { id: "user-2" } };
    stubLogoDev();
    const { limit, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: "u:user-2" });
  });

  it("rate-limits per user", async () => {
    const { limit, request } = setup({ allowed: false });
    expect((await request("/logos/swiggy.com.png")).status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "u:user-1" });
  });

  it("rejects invalid domains without touching R2 or Logo.dev", async () => {
    const upstream = stubLogoDev();
    const { bucket, request } = setup();

    expect((await request("/logos/localhost.png")).status).toBe(400);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("GET /logos/:file — storage", () => {
  it("downloads through the Logo.dev API once, stores it, then serves from cache and R2", async () => {
    const upstream = stubLogoDev();
    const { bucket, request } = setup();

    const first = await request("/logos/swiggy.com.png");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(PNG);

    const [lookupUrl, lookupInit] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(lookupUrl).toBe("https://api.logo.dev/v2/brands/logo?domain=swiggy.com");
    expect(new Headers(lookupInit.headers).get("authorization")).toBe("Bearer sk_test");
    const download = new URL(String((upstream.mock.calls[1] as unknown[])[0]));
    expect(download.searchParams.get("sig")).toBe("abc");
    expect(download.searchParams.get("format")).toBe("png");
    expect(bucket.objects.has("logos/swiggy.com.png")).toBe(true);

    // Edge hit.
    expect((await request("/logos/swiggy.com.png")).status).toBe(200);
    // R2 hit.
    edgeCache.clear();
    expect((await request("/logos/swiggy.com.png")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("remembers a missing logo instead of asking Logo.dev every time", async () => {
    const upstream = stubLogoDev({ lookup: () => new Response(null, { status: 404 }) });
    const { bucket, request } = setup();

    expect((await request("/logos/unknown-shop.in.png")).status).toBe(404);
    expect(bucket.objects.get("logos/unknown-shop.in.png")?.customMetadata?.missedAt).toBeTruthy();

    edgeCache.clear();
    expect((await request("/logos/unknown-shop.in.png")).status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("asks again once a stored miss has expired", async () => {
    const upstream = stubLogoDev();
    const { bucket, request } = setup();
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    bucket.objects.set("logos/zepto.com.png", {
      bytes: new Uint8Array(),
      customMetadata: { missedAt: String(eightDaysAgo) },
    });

    expect((await request("/logos/zepto.com.png")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("does not store a brand that is still being indexed", async () => {
    stubLogoDev({ lookup: () => new Response(null, { status: 202 }) });
    const { bucket, request } = setup();

    expect((await request("/logos/new-brand.in.png")).status).toBe(503);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(edgeCache.size).toBe(0);
  });

  it.each([
    ["an API error", { lookup: () => new Response(null, { status: 429 }) }],
    ["a non-PNG file", { file: () => new Response("<html>", { headers: { "content-type": "text/html" } }) }],
    [
      "a file without the PNG signature",
      { file: () => new Response("not a png", { headers: { "content-type": "image/png" } }) },
    ],
    [
      "an oversized file",
      {
        file: () =>
          new Response(PNG, {
            headers: { "content-type": "image/png", "content-length": String(1024 * 1024) },
          }),
      },
    ],
  ])("stores nothing for %s", async (_label, responses) => {
    stubLogoDev(responses);
    const { bucket, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(502);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(edgeCache.size).toBe(0);
  });

  it("treats a malformed API reply as an outage, not a stored miss", async () => {
    stubLogoDev({ lookup: () => Response.json({ data: {} }) });
    const { bucket, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(502);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("stops reading an oversized download even without a Content-Length", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    stubLogoDev({
      file: () => new Response(endless, { headers: { "content-type": "image/png" } }),
    });
    const { bucket, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(502);
    expect(bucket.put).not.toHaveBeenCalled();
    // 512 KB cap / 64 KB chunks: stops just past the cap, never reads it all.
    expect(pulled).toBeLessThan(12);
  });

  it("stores nothing when Logo.dev can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );
    const { bucket, request } = setup();

    expect((await request("/logos/swiggy.com.png")).status).toBe(502);
    expect(bucket.put).not.toHaveBeenCalled();
  });
});
