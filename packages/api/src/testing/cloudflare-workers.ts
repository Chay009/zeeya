// Stand-in for the `cloudflare:workers` module under Vitest (Node has no such
// module). Bindings come from process.env; background tasks just run.
export const env = new Proxy({} as Record<string, string | undefined>, {
  get: (_target, prop) => (typeof prop === "string" ? process.env[prop] : undefined),
});

export function waitUntil(promise: Promise<unknown>): void {
  void promise.catch(() => {});
}
