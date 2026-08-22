// Native-only DB initialization, factored out so the test suite can call the
// exact function production uses instead of re-implementing it — a test that
// manually re-runs "PRAGMA foreign_keys = ON" itself doesn't prove
// client.native.ts actually runs it; it only proves the pragma works in
// general.
//
// Typed against a minimal structural interface rather than expo-sqlite's
// full SQLiteDatabase — this is the only method actually used, and it lets
// the test suite pass a real (non-Expo, non-mocked) better-sqlite3 adapter
// without an unsafe cast to satisfy dozens of unrelated interface members.
interface ExecSyncCapable {
  execSync(source: string): void;
}

export function initializeNativeDatabase(sqlite: ExecSyncCapable): void {
  // SQLite ignores declared foreign keys (and their ON DELETE CASCADE)
  // unless each connection explicitly turns enforcement on — it defaults to
  // off for backwards compatibility with pre-3.6.19 SQLite, not something
  // the schema file can request on its own.
  sqlite.execSync("PRAGMA foreign_keys = ON;");
}
