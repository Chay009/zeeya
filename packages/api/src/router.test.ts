// Our tRPC setup behind tRPC's fetch adapter, as the server mounts it: the
// protectedProcedure gate, the Zod error formatter, and the batch cap.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { AnyRouter } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Context } from "./context";
import { protectedProcedure, router, TRPC_MAX_BATCH_SIZE } from "./index";
import { appRouter } from "./routers/index";

// A protected procedure with input, built from the same exports real ones use.
const testRouter = router({
  save: protectedProcedure
    .input(z.object({ currency: z.string().regex(/^[A-Z]{3}$/) }))
    .mutation(() => "ok"),
});

const signedIn = {
  session: { user: { id: "u1" }, session: { id: "s1" } },
} as unknown as Context;
const signedOut: Context = { session: null };

function handle(req: Request, ctx: Context, r: AnyRouter = testRouter) {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req,
    router: r,
    maxBatchSize: TRPC_MAX_BATCH_SIZE,
    createContext: () => ctx,
  });
}

const post = (path: string, input: unknown) =>
  new Request(`http://api.test/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

describe("tRPC setup over the fetch adapter", () => {
  it("rejects protected calls without a session", async () => {
    const res = await handle(post("save", { currency: "INR" }), signedOut);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe("UNAUTHORIZED");
  });

  it("returns invalid input as a Zod tree pointing at the bad field", async () => {
    const res = await handle(post("save", { currency: "inr" }), signedIn);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { data: { code: string; zodError: { properties?: Record<string, unknown> } } };
    };
    expect(body.error.data.code).toBe("BAD_REQUEST");
    expect(body.error.data.zodError.properties).toHaveProperty("currency");
  });

  it("caps the number of calls in one batched request", async () => {
    const batch = (n: number) => {
      const paths = Array.from({ length: n }, () => "healthCheck").join(",");
      return new Request(`http://api.test/trpc/${paths}?batch=1`, { method: "GET" });
    };
    expect((await handle(batch(TRPC_MAX_BATCH_SIZE), signedOut, appRouter)).status).toBe(200);
    expect((await handle(batch(TRPC_MAX_BATCH_SIZE + 1), signedOut, appRouter)).status).toBe(400);
  });
});

describe("authProviders", () => {
  it("reports a provider as off when its IDs are not configured", async () => {
    // The test env sets no GOOGLE_* or APPLE_* values (vitest.config.ts).
    const res = await handle(
      new Request("http://api.test/trpc/authProviders", { method: "GET" }),
      signedOut,
      appRouter,
    );
    const body = (await res.json()) as { result: { data: unknown } };
    expect(body.result.data).toEqual({ google: false, apple: false, googleBrowser: false });
  });
});
