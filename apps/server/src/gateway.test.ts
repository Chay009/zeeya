import { describe, expect, it, vi } from "vitest";

import gateway from "./gateway";

describe("public gateway private-service boundary", () => {
  it("preserves auth bodies, public URL, credentials, and multiple response cookies", async () => {
    const request = new Request("https://api.example.com/api/auth/sign-in/social", {
      method: "POST",
      headers: { cookie: "session=existing", origin: "https://example.com" },
      body: JSON.stringify({ provider: "google", idToken: { token: "test" } }),
    });
    const headers = new Headers();
    headers.append("set-cookie", "session=new; Secure; HttpOnly");
    headers.append("set-cookie", "cache=signed; Secure; HttpOnly");
    const upstream = new Response("signed in", { headers });
    const fetch = vi.fn(async (forwarded: Request) => {
      expect(forwarded).toBe(request);
      expect(await forwarded.json()).toEqual({ provider: "google", idToken: { token: "test" } });
      return upstream;
    });
    const result = await gateway.fetch(request, { BACKEND: { fetch } });
    expect(result).toBe(upstream);
    expect(result.headers.getSetCookie()).toHaveLength(2);
  });

  it("forwards tRPC batches and CORS preflights unchanged", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    for (const request of [
      new Request("https://api.example.com/trpc/a,b?batch=1&input=%7B%7D"),
      new Request("https://api.example.com/api/auth/get-session", { method: "OPTIONS" }),
    ]) {
      expect((await gateway.fetch(request, { BACKEND: { fetch } })).status).toBe(204);
      expect(fetch).toHaveBeenLastCalledWith(request);
    }
  });

  it("does not expose other paths or act as a client-selected destination proxy", async () => {
    const fetch = vi.fn();
    for (const path of ["/", "/ingest/sms", "/proxy?url=https://example.com", "/api/authentic"]) {
      expect(
        (await gateway.fetch(new Request(`https://api.example.com${path}`), { BACKEND: { fetch } }))
          .status,
      ).toBe(404);
    }
    expect(
      (
        await gateway.fetch(new Request("https://api.example.com/trpc/a", { method: "DELETE" }), {
          BACKEND: { fetch },
        })
      ).status,
    ).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards logo reads and refuses any other method on them", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const read = new Request("https://api.example.com/logos/swiggy.com.png");
    expect((await gateway.fetch(read, { BACKEND: { fetch } })).status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(read);

    fetch.mockClear();
    for (const method of ["POST", "OPTIONS"]) {
      const write = new Request("https://api.example.com/logos/swiggy.com.png", { method });
      expect((await gateway.fetch(write, { BACKEND: { fetch } })).status).toBe(405);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not leak internal service errors", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("private-worker internal details");
    });
    const response = await gateway.fetch(new Request("https://api.example.com/trpc/healthCheck"), {
      BACKEND: { fetch },
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Service unavailable" });
  });
});
