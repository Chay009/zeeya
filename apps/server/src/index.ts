import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@zeeya/api/context";
import { appRouter } from "@zeeya/api/routers/index";
import { createAuth } from "@zeeya/auth";
import { createDb } from "@zeeya/db";
import { transaction } from "@zeeya/db/schema/transactions";
import { env } from "@zeeya/env/server";
import { generateTransactionId, parseSms } from "@zeeya/parser";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

export type SmsQueueMessage = {
  userId: string;
  body: string;
  sender: string;
  timestamp: number;
};

const SmsInputSchema = z.object({
  body: z.string().min(1),
  sender: z.string().min(1),
  timestamp: z.number().int(),
});

const IngestBodySchema = z.object({
  messages: z.array(SmsInputSchema).min(1).max(100),
});

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth().handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.post("/ingest/sms", async (c) => {
  const session = await createAuth().api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = IngestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", issues: parsed.error.issues }, 400);
  }

  const queue = (c.env as { SMS_QUEUE: Queue<SmsQueueMessage> }).SMS_QUEUE;
  const messages = parsed.data.messages.map((m) => ({
    body: { userId: session.user.id, ...m } satisfies SmsQueueMessage,
  }));

  await queue.sendBatch(messages);

  return c.json({ queued: messages.length }, 202);
});

app.get("/", (c) => {
  return c.text("OK");
});

export default {
  fetch: app.fetch.bind(app),

  async queue(
    batch: MessageBatch<SmsQueueMessage>,
    _env: Env,
  ): Promise<void> {
    const db = createDb();

    const rows = batch.messages.flatMap((msg) => {
      const { userId, body, sender, timestamp } = msg.body;
      const result = parseSms({ body, sender, timestamp });
      if (!result) return [];

      const id = generateTransactionId(result);
      return [
        {
          id,
          userId,
          amount: result.amount,
          type: result.type,
          merchant: result.merchant,
          reference: result.reference,
          accountLast4: result.accountLast4,
          balance: result.balance,
          creditLimit: result.creditLimit,
          smsBody: result.smsBody,
          sender: result.sender,
          timestamp: String(result.timestamp),
          bankName: result.bankName,
          transactionHash: result.transactionHash,
          isFromCard: result.isFromCard,
          currency: result.currency,
          fromAccount: result.fromAccount,
          toAccount: result.toAccount,
        },
      ];
    });

    if (rows.length > 0) {
      await db
        .insert(transaction)
        .values(rows)
        .onConflictDoNothing({ target: transaction.id });
    }

    batch.ackAll();
  },
};
