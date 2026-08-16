import { boolean, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.js";

export const transaction = pgTable(
  "transaction",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: doublePrecision("amount").notNull(),
    type: text("type").notNull(),
    merchant: text("merchant"),
    reference: text("reference"),
    accountLast4: text("account_last4"),
    balance: doublePrecision("balance"),
    creditLimit: doublePrecision("credit_limit"),
    smsBody: text("sms_body").notNull(),
    sender: text("sender").notNull(),
    timestamp: text("timestamp").notNull(),
    bankName: text("bank_name").notNull(),
    transactionHash: text("transaction_hash"),
    isFromCard: boolean("is_from_card").default(false).notNull(),
    currency: text("currency").default("INR").notNull(),
    fromAccount: text("from_account"),
    toAccount: text("to_account"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("transaction_userId_idx").on(table.userId),
    index("transaction_userId_timestamp_idx").on(table.userId, table.timestamp),
  ],
);
