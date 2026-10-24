import { trpcServer } from "@hono/trpc-server";
import * as Sentry from "@sentry/cloudflare";
import { TRPC_MAX_BATCH_SIZE } from "@zeeya/api";
import { createContext } from "@zeeya/api/context";
import { appRouter } from "@zeeya/api/routers/index";
import { createAuth } from "@zeeya/auth";
import { env } from "@zeeya/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { apiLimit, authBodyLimit } from "./limits";
import { sentryOptions } from "./sentry";

// The whole public API: tRPC, plus Better Auth's handler (not tRPC). Any other
// path is a 404. SMS never reaches the server: parsing runs on the device, and
// device data sync is planned through Turso, not this API.
export const app = new Hono<{ Bindings: Env }>();

app.use(secureHeaders());
// Answers CORS preflights itself, so they never reach the limiters below.
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.on(["GET", "POST"], "/api/auth/*", authBodyLimit, (c) => createAuth().handler(c.req.raw));

app.use(
  "/trpc/*",
  apiLimit,
  trpcServer({
    router: appRouter,
    maxBatchSize: TRPC_MAX_BATCH_SIZE,
    createContext: (opts) => createContext(opts),
    // tRPC turns thrown errors into responses, so Sentry never sees them
    // unless reported here. Client errors (bad input, unauthorized) are not
    // bugs and are not reported.
    onError: ({ error, path, type }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        Sentry.captureException(error.cause ?? error, {
          tags: { trpc_path: path ?? "unknown", trpc_type: type },
        });
      }
    },
  }),
);

app.notFound((c) => c.json({ error: "Not found" }, 404));

// Hono converts uncaught route errors into a 500 response; report them first.
// HTTPException is a deliberate response (e.g. a 4xx from middleware), not a
// bug, so it is returned as-is and not reported.
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  Sentry.captureException(error);
  return c.json({ error: "Internal server error" }, 500);
});

export default Sentry.withSentry(sentryOptions, {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>);
