import type { CloudflareOptions, ErrorEvent } from "@sentry/cloudflare";

type SentryEnv = {
  SENTRY_DSN?: string;
  ENVIRONMENT?: string;
};

// Requests carry session cookies, bearer tokens and (for tRPC GETs) the input
// in the query string. Keep only method and path on any reported event.
export function scrubRequest(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url?.split("?")[0],
    };
  }
  return event;
}

// SDK v11 collects every category by default. A finance backend sends none:
// request bodies hold transactions, headers and cookies hold sessions.
// `Required` makes a category added by a future SDK a compile error here.
const DATA_COLLECTION: Required<NonNullable<CloudflareOptions["dataCollection"]>> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  // Lines of our own source around a stack frame, not request data.
  frameContextLines: 5,
};

// No DSN (local dev, or not configured yet) means the SDK stays off.
export function sentryOptions(env: SentryEnv): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    dataCollection: DATA_COLLECTION,
    // Errors only. Performance tracing would spend the free span quota.
    tracesSampleRate: 0,
    beforeSend: scrubRequest,
  };
}
