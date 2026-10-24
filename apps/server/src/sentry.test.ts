import type { ErrorEvent } from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";

import { scrubRequest, sentryOptions } from "./sentry";

describe("sentryOptions", () => {
  it("stays off without a DSN", () => {
    expect(sentryOptions({})).toBeUndefined();
    expect(sentryOptions({ SENTRY_DSN: "" })).toBeUndefined();
  });

  it("reports errors only and collects no request data", () => {
    const options = sentryOptions({
      SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
      ENVIRONMENT: "production",
    })!;
    expect(options.tracesSampleRate).toBe(0);
    expect(options.environment).toBe("production");
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
  });
});

describe("scrubRequest", () => {
  it("keeps only method and path", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: "GET",
        url: "https://api.example.com/trpc/sync.pull?input=%7B%22since%22%3A0%7D",
        headers: { cookie: "better-auth.session_token=secret", authorization: "Bearer x" },
        cookies: { "better-auth.session_token": "secret" },
        data: '{"amountMinorUnits":49900}',
        query_string: "input=...",
      },
    };

    expect(scrubRequest(event).request).toEqual({
      method: "GET",
      url: "https://api.example.com/trpc/sync.pull",
    });
  });
});
