# Migrations

This schema has not shipped to any real user yet (issue #17), so migrations
are currently one clean baseline rather than a compatibility chain. The
single `0000_*.sql` file in this folder creates the complete local
database — its generated name changes each time the schema is regenerated
(drizzle-kit names it from a random word pair), so it's referred to here by
pattern rather than by a specific filename that would go stale on the next
regeneration.

Most development-only schema changes still require clearing the app's local
data before using a regenerated baseline. Small additive changes that must not
break an active development install are repaired idempotently at native
connection startup in `db/native-schema-compat.ts`; this is deliberately a
narrow bridge, not a second general migration system. Once the schema ships,
all changes must use normal append-only migrations.
