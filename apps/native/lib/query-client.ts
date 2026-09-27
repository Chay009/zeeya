import { QueryClient } from "@tanstack/react-query";

import { connectLiveQueries } from "./live-queries";

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

// Lives as long as the client — the app's whole lifetime — so it is wired
// once here rather than in a component effect.
connectLiveQueries(queryClient);
