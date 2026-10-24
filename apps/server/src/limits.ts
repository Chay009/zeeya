// Limits for what Better Auth does not cover. Auth endpoints are rate-limited
// by Better Auth itself (packages/auth); tRPC is limited here with Cloudflare's
// rate-limit binding, keyed per user as Cloudflare recommends (mobile carriers
// put many users behind one IP).
import { getCookieCache } from "better-auth/cookies";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";

// Auth bodies are small: the largest is a sign-in carrying a Google/Apple ID
// token (a ~1-1.5 KB JWT). bodyLimit counts bytes as the body streams, so a
// request without (or lying about) Content-Length is cut off too.
export const authBodyLimit = bodyLimit({
  maxSize: 8192,
  onError: (c) => c.json({ error: "Payload too large" }, 413),
});

type LimitEnv = { Bindings: { API_LIMITER: RateLimit; BETTER_AUTH_SECRET: string } };

export const apiLimit = createMiddleware<LimitEnv>(async (c, next) => {
  // Better Auth's signed session-cache cookie, verified with our secret (no
  // database). A missing, expired or forged cookie gets the IP key, so a
  // made-up cookie can't buy a fresh bucket per request.
  const cached = await getCookieCache(c.req.raw, { secret: c.env.BETTER_AUTH_SECRET });
  const key = cached ? `u:${cached.user.id}` : `ip:${c.req.header("cf-connecting-ip") ?? "local"}`;
  if (!(await c.env.API_LIMITER.limit({ key })).success) {
    return c.json({ error: "Too many requests" }, 429, { "retry-after": "60" });
  }
  await next();
});
