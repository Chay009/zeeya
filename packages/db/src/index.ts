import { neon } from "@neondatabase/serverless";
import { env } from "@zeeya/env/server";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export function createDb() {
  const sql = neon(env.DATABASE_URL || "");
  return drizzle(sql, { schema });
}
