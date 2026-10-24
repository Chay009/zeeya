import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { createAuth } from "@zeeya/auth";

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  // returnHeaders: getSession can answer with Set-Cookie: a re-signed
  // cookie-cache cookie once it expires, or an extended session cookie after
  // updateAge. Dropping them would make every later call hit Neon and let the
  // client's cookie lapse while the session is still active. Better Auth's own
  // getSessionFromCtx forwards them the same way.
  const { headers, response: session } = await createAuth().api.getSession({
    headers: req.headers,
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    resHeaders.append("set-cookie", cookie);
  }
  return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
