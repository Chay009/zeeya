# Migrations

This schema has not shipped to any real user yet (issue #17), so migrations
are squashed into a single clean baseline whenever the schema changes,
rather than layering `ALTER TABLE` steps on top of a history nobody depends
on. `0000_massive_shadowcat.sql` is the current baseline.

If you have a local development build with an on-device SQLite database
created from an _older_ migration sequence, that database predates the
squash and its schema will not match this baseline (e.g. it may still have
a `fingerprint` column, or lack `identity_conflicts`). Delete the app's
local data (uninstall the dev build, or clear its storage) before running
against the squashed migrations — there is no migration path from a
pre-squash local database, and none is provided.
