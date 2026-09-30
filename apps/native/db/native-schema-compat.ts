interface NativeSchemaDatabase {
  execSync(source: string): void;
  getFirstSync(source: string): { value: number } | null;
}

const NEEDS_ACTIVITY_ACCOUNT_ID_COLUMN_SQL = `
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'activity'
    ) AND NOT EXISTS (
      SELECT 1 FROM pragma_table_info('activity')
      WHERE name = 'account_id'
    )
    THEN 1 ELSE 0
  END AS value
`;

const NEEDS_ACTIVITY_ACCOUNT_ID_INDEX_SQL = `
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'activity'
    ) AND NOT EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'index' AND name = 'activity_account_id_date_id_idx'
    )
    THEN 1 ELSE 0
  END AS value
`;

const NEEDS_DAILY_BUDGET_COLUMN_SQL = `
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'local_settings'
    ) AND NOT EXISTS (
      SELECT 1 FROM pragma_table_info('local_settings')
      WHERE name = 'daily_budget_minor_units'
    )
    THEN 1 ELSE 0
  END AS value
`;

// local_settings is part of the baseline, so its presence means the baseline
// already ran on this install (a fresh one gets category_budgets from the
// migration itself — creating it here first would make that migration fail).
const NEEDS_CATEGORY_BUDGETS_TABLE_SQL = `
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'local_settings'
    ) AND NOT EXISTS (
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'category_budgets'
    )
    THEN 1 ELSE 0
  END AS value
`;

/**
 * Repairs additive schema changes made while the pre-release migration
 * history is still maintained as one squashed baseline. Existing development
 * installs have already recorded that baseline as applied, so replacing its
 * SQL cannot add newly introduced columns to those databases.
 *
 * Keep this limited to idempotent, data-preserving repairs. Fresh databases
 * have no local_settings table yet and are created by the normal migration.
 */
export function repairLegacyNativeSchema(sqlite: NativeSchemaDatabase): void {
  sqlite.execSync("BEGIN IMMEDIATE;");
  try {
    if (sqlite.getFirstSync(NEEDS_ACTIVITY_ACCOUNT_ID_COLUMN_SQL)?.value === 1) {
      sqlite.execSync(`
        ALTER TABLE activity
        ADD COLUMN account_id text REFERENCES accounts(id) ON DELETE SET NULL;
      `);
    }
    if (sqlite.getFirstSync(NEEDS_ACTIVITY_ACCOUNT_ID_INDEX_SQL)?.value === 1) {
      sqlite.execSync(`
        CREATE INDEX activity_account_id_date_id_idx
        ON activity(account_id, date, id);
      `);
    }
    if (sqlite.getFirstSync(NEEDS_DAILY_BUDGET_COLUMN_SQL)?.value === 1) {
      sqlite.execSync(`
        ALTER TABLE local_settings
        ADD COLUMN daily_budget_minor_units integer
        CHECK (
          daily_budget_minor_units IS NULL OR
          (typeof(daily_budget_minor_units) = 'integer' AND daily_budget_minor_units > 0)
        );
      `);
    }
    if (sqlite.getFirstSync(NEEDS_CATEGORY_BUDGETS_TABLE_SQL)?.value === 1) {
      sqlite.execSync(`
        CREATE TABLE category_budgets (
          category text NOT NULL,
          currency text NOT NULL,
          monthly_limit_minor_units integer NOT NULL,
          updated_at integer NOT NULL,
          PRIMARY KEY (category, currency),
          CONSTRAINT category_budgets_limit_check CHECK (
            typeof(monthly_limit_minor_units) = 'integer' AND monthly_limit_minor_units > 0
          )
        );
      `);
    }
    sqlite.execSync("COMMIT;");
  } catch (error) {
    try {
      sqlite.execSync("ROLLBACK;");
    } catch {
      // Preserve the original compatibility failure.
    }
    throw error;
  }
}
