import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, it, vi } from "vitest";

// getSession as Better Auth answers when it refreshes a session: the session
// plus Set-Cookie for the re-signed cache cookie and the extended token.
const getSession = vi.fn(async (_opts: { headers: Headers; returnHeaders: true }) => {
  const headers = new Headers();
  headers.append("set-cookie", "better-auth.session_data=signed; Path=/; HttpOnly");
  headers.append("set-cookie", "better-auth.session_token=tok; Path=/; HttpOnly; Max-Age=2592000");
  return { headers, response: { user: { id: "u1" }, session: { id: "s1" } } };
});

vi.mock("@zeeya/auth", () => ({
  createAuth: () => ({ api: { getSession } }),
}));

const { createContext } = await import("./context");
const { appRouter } = await import("./routers/index");

describe("createContext", () => {
  it("passes the request headers and forwards every Set-Cookie to the response", async () => {
    const res = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://api.test/trpc/healthCheck", {
        headers: { cookie: "better-auth.session_token=tok" },
      }),
      router: appRouter,
      createContext,
    });

    expect(res.status).toBe(200);
    expect(getSession.mock.calls[0]![0].headers.get("cookie")).toBe(
      "better-auth.session_token=tok",
    );
    expect(getSession.mock.calls[0]![0].returnHeaders).toBe(true);
    expect(res.headers.getSetCookie()).toEqual([
      "better-auth.session_data=signed; Path=/; HttpOnly",
      "better-auth.session_token=tok; Path=/; HttpOnly; Max-Age=2592000",
    ]);
  });
});
