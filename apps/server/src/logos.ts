// Brand logos for signed-in users, served from our own R2 bucket. The first
// request for a domain downloads it once through the Logo.dev API (secret
// key, server-side) — the route Logo.dev allows for self-hosting; copying
// from its img.logo.dev CDN is not — and stores it. Later requests are
// edge-cache or R2 hits. The client only ever names a domain, never a URL,
// so this can't be used to fetch arbitrary hosts.
//
// TODO(paid plan): coalesce concurrent first requests for the same domain
// (queue / Durable Object) so a burst downloads it once, not once per request.
import { createAuth } from "@zeeya/auth";
import { getCookieCache } from "better-auth/cookies";
import type { Context } from "hono";
import { cache } from "hono/cache";
import { createMiddleware } from "hono/factory";

type LogoBindings = {
  LOGOS: R2Bucket;
  LOGO_DEV_SECRET_KEY: string;
  LOGO_LIMITER: RateLimit;
  BETTER_AUTH_SECRET: string;
};
type LogoEnv = { Bindings: LogoBindings; Variables: { userId: string } };

// Lowercase hostname with at least one dot, e.g. "swiggy.com", "sbi.co.in".
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const DAY_SECONDS = 24 * 60 * 60;
// A stored logo practically never changes; the app keys by domain.
const LOGO_MAX_AGE = 30 * DAY_SECONDS;
// Logo.dev has no logo for the domain: ask again after this long.
const MISS_TTL_MS = 7 * DAY_SECONDS * 1000;
// 2× the largest tile the app draws.
const LOGO_SIZE = "256";
const MAX_LOGO_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 5_000;

export function parseLogoDomain(file: string): string | null {
  const match = /^(.+)\.png$/.exec(file.toLowerCase());
  const domain = match?.[1];
  return domain && DOMAIN.test(domain) ? domain : null;
}

const objectKey = (domain: string) => `logos/${domain}.png`;

// Signed-in users only. The signed session-cache cookie is checked first (no
// database); without it, Better Auth resolves the session itself.
export const requireSession = createMiddleware<LogoEnv>(async (c, next) => {
  const cached = await getCookieCache(c.req.raw, { secret: c.env.BETTER_AUTH_SECRET });
  const userId =
    cached?.user.id ??
    (await createAuth().api.getSession({ headers: c.req.raw.headers }))?.user.id;
  if (!userId) return c.json({ error: "Sign in to load logos" }, 401);
  c.set("userId", userId);
  await next();
});

export const logoLimit = createMiddleware<LogoEnv>(async (c, next) => {
  if (!(await c.env.LOGO_LIMITER.limit({ key: `u:${c.get("userId")}` })).success) {
    return c.json({ error: "Too many requests" }, 429, { "retry-after": "60" });
  }
  await next();
});

type Outcome = { kind: "missing" } | { kind: "pending" } | { kind: "unavailable" };
// A fresh download is bytes; an R2 hit is the stored stream.
type Downloaded = Outcome | { kind: "logo"; body: ArrayBuffer };
type Resolved = Outcome | { kind: "logo"; body: ReadableStream | ArrayBuffer };

function isPng(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, PNG_SIGNATURE.length));
  return PNG_SIGNATURE.every((byte, index) => head[index] === byte);
}

// Logo.dev API: GET /v2/brands/logo returns a temporary signed download URL.
async function downloadLogo(env: LogoBindings, domain: string): Promise<Downloaded> {
  const lookup = await fetch(
    `https://api.logo.dev/v2/brands/logo?domain=${encodeURIComponent(domain)}`,
    {
      headers: { authorization: `Bearer ${env.LOGO_DEV_SECRET_KEY}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  );
  // 404: no brand, or no logo for it. 202: still being indexed (not billed).
  if (lookup.status === 404) return { kind: "missing" };
  if (lookup.status === 202) return { kind: "pending" };
  if (!lookup.ok) return { kind: "unavailable" };

  // A 200 always carries data.url; anything else is an unexpected response,
  // not a confirmed "no logo", so it must not become a stored miss.
  const body: unknown = await lookup.json().catch(() => null);
  const url = (body as { data?: { url?: unknown } } | null)?.data?.url;
  if (typeof url !== "string") return { kind: "unavailable" };
  const download = new URL(url);
  download.searchParams.set("format", "png");
  download.searchParams.set("size", LOGO_SIZE);

  const file = await fetch(download, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (
    !file.ok ||
    !file.body ||
    !file.headers.get("content-type")?.startsWith("image/png") ||
    Number(file.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES
  ) {
    return { kind: "unavailable" };
  }
  const bytes = await readCapped(file.body, MAX_LOGO_BYTES);
  if (!bytes || !isPng(bytes)) return { kind: "unavailable" };
  return { kind: "logo", body: bytes };
}

// Reads at most `limit` bytes, cancelling the download beyond that, so a
// missing or wrong Content-Length can't make the Worker buffer a huge body.
async function readCapped(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function resolveLogo(env: LogoBindings, domain: string): Promise<Resolved> {
  const stored = await env.LOGOS.get(objectKey(domain));
  if (stored) {
    const missedAt = Number(stored.customMetadata?.missedAt);
    if (!missedAt) return { kind: "logo", body: stored.body };
    if (Date.now() - missedAt < MISS_TTL_MS) return { kind: "missing" };
  }

  let resolved: Downloaded;
  try {
    resolved = await downloadLogo(env, domain);
  } catch {
    // Timeout or network failure: not stored, so the next request retries.
    return { kind: "unavailable" };
  }
  if (resolved.kind === "logo") {
    await env.LOGOS.put(objectKey(domain), resolved.body, {
      httpMetadata: { contentType: "image/png" },
    });
  } else if (resolved.kind === "missing") {
    await env.LOGOS.put(objectKey(domain), new Uint8Array(), {
      customMetadata: { missedAt: String(Date.now()) },
    });
  }
  return resolved;
}

// Edge cache (Hono's cache middleware) in front of R2, after the session and
// rate-limit checks. Keyed by the normalized domain so "Swiggy.com.png" and
// "swiggy.com.png?x=1" share one entry. Only a logo (200) or a confirmed miss
// (404) is cached; "still indexing" (503) and failures (502) are not.
export const logoEdgeCache = cache({
  cacheName: "zeeya-logos",
  cacheableStatusCodes: [200, 404],
  keyGenerator: (c) => `https://logos.cache/${parseLogoDomain(c.req.param("file") ?? "")}`,
});

export async function serveLogo(c: Context<LogoEnv>): Promise<Response> {
  const domain = parseLogoDomain(c.req.param("file") ?? "");
  if (!domain) return c.json({ error: "Invalid domain" }, 400);

  const resolved = await resolveLogo(c.env, domain);
  switch (resolved.kind) {
    case "logo":
      return c.body(resolved.body, 200, {
        "content-type": "image/png",
        "cache-control": `public, max-age=${LOGO_MAX_AGE}, immutable`,
      });
    case "missing":
      return c.body(null, 404, { "cache-control": `public, max-age=${DAY_SECONDS}` });
    case "pending":
      return c.body(null, 503, { "cache-control": "no-store", "retry-after": "30" });
    case "unavailable":
      return c.body(null, 502, { "cache-control": "no-store" });
  }
}
