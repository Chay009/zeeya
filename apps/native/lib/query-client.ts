import { QueryClient } from "@tanstack/react-query";

/** Shared client for tRPC and on-device SQLite read models. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
