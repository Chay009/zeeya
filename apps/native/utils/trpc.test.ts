import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCookie: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@zeeya/env/native", () => ({ env: { EXPO_PUBLIC_SERVER_URL: "https://api.test" } }));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));
vi.mock("@/lib/query-client", () => ({ queryClient: new QueryClient() }));

import { queryClient, trpc } from "./trpc";

afterEach(() => {
  queryClient.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("native tRPC Better Auth transport", () => {
  it("sends Better Auth's saved cookie without an extra session request", async () => {
    auth.getCookie.mockReturnValue("session=saved");
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      expect(new Headers(options?.headers).get("cookie")).toBe("session=saved");
      expect(options?.credentials).toBe("omit");
      return Response.json([{ result: { data: "OK" } }]);
    });
    vi.stubGlobal("fetch", fetch);
    expect(await queryClient.fetchQuery({ ...trpc.healthCheck.queryOptions(), retry: false })).toBe(
      "OK",
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("allows public queries without a cookie or session preflight", async () => {
    auth.getCookie.mockReturnValue("");
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      expect(new Headers(options?.headers).has("cookie")).toBe(false);
      return Response.json([{ result: { data: "OK" } }]);
    });
    vi.stubGlobal("fetch", fetch);
    expect(await queryClient.fetchQuery({ ...trpc.healthCheck.queryOptions(), retry: false })).toBe(
      "OK",
    );
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
