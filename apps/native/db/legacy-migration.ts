export type SQLiteValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

export interface SyncSqlite {
  execSync(source: string): void;
  getAllSync<T>(source: string, ...params: SQLiteValue[]): T[];
  runSync(source: string, ...params: SQLiteValue[]): void;
}

interface TableColumn {
  name: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableExists(database: SyncSqlite, table: string): boolean {
  return (
    database.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      table,
    ).length > 0
  );
}

export function copyLegacyTables(
  legacy: SyncSqlite,
  secure: SyncSqlite,
  tables: readonly string[],
): { copiedRows: number; sourceRows: number } {
  let copiedRows = 0;
  let sourceRows = 0;
  secure.execSync("BEGIN IMMEDIATE;");
  try {
    for (const table of tables) {
      if (!tableExists(legacy, table) || !tableExists(secure, table)) continue;

      const legacyColumns = legacy.getAllSync<TableColumn>(
        `PRAGMA table_info(${quoteIdentifier(table)})`,
      );
      const secureColumnNames = new Set(
        secure
          .getAllSync<TableColumn>(`PRAGMA table_info(${quoteIdentifier(table)})`)
          .map((column) => column.name),
      );
      const columns = legacyColumns
        .map((column) => column.name)
        .filter((column) => secureColumnNames.has(column));
      if (columns.length === 0) continue;

      const rows = legacy.getAllSync<Record<string, unknown>>(
        `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`,
      );
      sourceRows += rows.length;
      const placeholders = columns.map(() => "?").join(", ");
      const insert = `INSERT INTO ${quoteIdentifier(table)} (${columns
        .map(quoteIdentifier)
        .join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      for (const row of rows) {
        const values = columns.map((column) => row[column]);
        if (
          values.some(
            (value) =>
              value !== null &&
              typeof value !== "string" &&
              typeof value !== "number" &&
              typeof value !== "boolean" &&
              !(value instanceof Uint8Array) &&
              !(value instanceof ArrayBuffer),
          )
        ) {
          throw new Error(`Unsupported SQLite value while copying ${table}`);
        }
        secure.runSync(insert, ...(values as SQLiteValue[]));
        copiedRows +=
          secure.getAllSync<{ changed: number }>("SELECT changes() AS changed")[0]?.changed ?? 0;
      }
    }
    secure.execSync("COMMIT;");
    return { copiedRows, sourceRows };
  } catch (error) {
    secure.execSync("ROLLBACK;");
    throw error;
  }
}
