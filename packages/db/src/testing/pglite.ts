// In-process Postgres with the real migrations applied, for tests.
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../schema";

const migrationsFolder = join(import.meta.dirname, "..", "migrations");

export async function createTestDb() {
  const pg = new PGlite();
  // Neon sessions run in UTC; the auth tables use timestamp without time zone,
  // so a local-time session would shift every now()-based fixture.
  await pg.exec("set time zone 'UTC'");
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder });

  async function addUser(id: string) {
    await pg.query(`insert into "user" (id, name, email) values ($1, $1, $1 || '@example.com')`, [
      id,
    ]);
  }

  return { pg, db, addUser };
}
