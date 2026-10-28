// Public edge only. Authentication, authorization, CORS, and rate limiting
// remain in the private backend. Never accept a destination URL from a client.
type GatewayEnv = { BACKEND: Pick<Fetcher, "fetch"> };

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const isLogo = path.startsWith("/logos/");
    const allowedPath = path.startsWith("/trpc/") || path.startsWith("/api/auth/") || isLogo;
    if (!allowedPath) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (isLogo && request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { allow: "GET" } },
      );
    }
    if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { allow: "GET, POST, OPTIONS" } },
      );
    }
    try {
      // Keep the public URL and original request intact: Better Auth's origin
      // checks, cookies, client IP, and tRPC batch/query/body semantics depend
      // on them. Return the original response (including all Set-Cookie values).
      return await env.BACKEND.fetch(request);
    } catch {
      return Response.json({ error: "Service unavailable" }, { status: 502 });
    }
  },
};
