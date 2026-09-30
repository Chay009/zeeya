interface PeriodicSyncSettings {
  backgroundSyncEnabled: boolean;
  transactionNotificationsEnabled: boolean;
}

export interface SyncAndNotifyDependencies {
  /** Head of the append-only arrival log before syncing (db/caught-up-transactions.ts). */
  arrivalCursor(): Promise<number>;
  sync(): Promise<void>;
  /** Projected transactions whose SMS arrived after the cursor. */
  countTransactionsArrivedAfter(cursor: number): Promise<number>;
  transactionNotificationsEnabled: boolean;
  notify(count: number): Promise<void>;
}

interface PeriodicSyncDependencies
  extends Omit<SyncAndNotifyDependencies, "transactionNotificationsEnabled"> {
  getSettings(): Promise<PeriodicSyncSettings>;
  canSync(): Promise<boolean>;
  /** Runs after a completed sync, e.g. budget alerts. Must not throw. */
  afterSync?(): Promise<void>;
}

export interface PeriodicSyncResult {
  status: "disabled" | "permissions-missing" | "completed";
  newFinancialTransactions: number;
}

// cursor → sync → count-arrived-after → notify. "New" means a transaction
// whose SMS this install ingested during the sync — read from the
// append-only arrival log, so it costs two indexed reads instead of deriving
// the whole dashboard before and after and diffing them. A re-synced SMS
// that was already ingested has no new arrival, so duplicates can't notify.
export async function syncAndNotify(
  dependencies: SyncAndNotifyDependencies,
): Promise<{ newFinancialTransactions: number }> {
  const cursor = await dependencies.arrivalCursor();
  await dependencies.sync();
  const added = await dependencies.countTransactionsArrivedAfter(cursor);

  if (dependencies.transactionNotificationsEnabled && added > 0) {
    await dependencies.notify(added);
  }
  return { newFinancialTransactions: added };
}

// Platform-independent orchestration used by the Expo background-task
// adapter. Keeping policy here means tests can prove what does (and does
// not) trigger a notification without loading TaskManager, Notifications,
// React Native, or a device runtime.
export async function runPeriodicSync(
  dependencies: PeriodicSyncDependencies,
): Promise<PeriodicSyncResult> {
  const settings = await dependencies.getSettings();
  if (!settings.backgroundSyncEnabled) {
    return { status: "disabled", newFinancialTransactions: 0 };
  }

  if (!(await dependencies.canSync())) {
    return { status: "permissions-missing", newFinancialTransactions: 0 };
  }

  const { newFinancialTransactions } = await syncAndNotify({
    arrivalCursor: dependencies.arrivalCursor,
    sync: dependencies.sync,
    countTransactionsArrivedAfter: dependencies.countTransactionsArrivedAfter,
    transactionNotificationsEnabled: settings.transactionNotificationsEnabled,
    notify: dependencies.notify,
  });
  await dependencies.afterSync?.();

  return { status: "completed", newFinancialTransactions };
}
