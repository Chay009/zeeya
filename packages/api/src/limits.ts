// Shared by the server (maxBatchSize) and the app (httpBatchLink maxItems), so
// the client never sends a batch the server rejects. Kept free of server
// imports so the app can import it.
//
// Rate limits count HTTP requests, so an uncapped batch would let one request
// do unbounded work.
export const TRPC_MAX_BATCH_SIZE = 10;
