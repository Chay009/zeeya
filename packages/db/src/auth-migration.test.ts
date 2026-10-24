import { expect, it } from "vitest";
import { createTestDb } from "./testing/pglite";

it("replays the auth migration and deletes linked identities/sessions with their user", async () => {
  const { pg, addUser } = await createTestDb();
  try {
    const tables = await pg.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "account",
      "rate_limit",
      "session",
      "user",
      "verification",
    ]);
    await addUser("identity-under-test");
    await pg.query(
      `insert into account (id, account_id, provider_id, user_id, updated_at)
       values ('google-account', 'provider-user', 'google', $1, now())`,
      ["identity-under-test"],
    );
    await pg.query(
      `insert into session (id, token, user_id, expires_at, updated_at)
       values ('session', 'test-token', $1, now() + interval '1 day', now())`,
      ["identity-under-test"],
    );
    await pg.query('delete from "user" where id = $1', ["identity-under-test"]);
    expect((await pg.query("select id from account")).rows).toEqual([]);
    expect((await pg.query("select id from session")).rows).toEqual([]);
  } finally {
    await pg.close();
  }
}, 15_000);
