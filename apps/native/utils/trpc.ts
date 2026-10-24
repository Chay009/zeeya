import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { TRPC_MAX_BATCH_SIZE } from "@zeeya/api/limits";
import type { AppRouter } from "@zeeya/api/routers/index";
import { env } from "@zeeya/env/native";
import { Platform } from "react-native";

import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";

export { queryClient };

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${env.EXPO_PUBLIC_SERVER_URL}/trpc`,
      // Must match the server's maxBatchSize, or larger batches get a 400.
      maxItems: TRPC_MAX_BATCH_SIZE,
      fetch: function (url, options) {
        return fetch(url, {
          ...options,
          // Better Auth Expo forwards the session cookie manually on native.
          credentials: Platform.OS === "web" ? "include" : "omit",
        });
      },
      headers() {
        if (Platform.OS === "web") {
          return {};
        }
        const headers = new Map<string, string>();
        const cookies = authClient.getCookie();
        if (cookies) {
          headers.set("Cookie", cookies);
        }
        return Object.fromEntries(headers);
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
