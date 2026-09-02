import type { Dashboard } from "@/lib/dashboard";
import type { ParsedSms } from "@/lib/sms";

interface PeriodicSyncSettings {
  backgroundSyncEnabled: boolean;
  transactionNotificationsEnabled: boolean;
}

interface PeriodicSyncDependencies {
  getSettings(): Promise<PeriodicSyncSettings>;
  canSync(): Promise<boolean>;
  loadDashboard(): Promise<Dashboard>;
  sync(): Promise<Dashboard>;
  notify(transactions: ParsedSms[]): Promise<void>;
}

export interface PeriodicSyncResult {
  status: "disabled" | "permissions-missing" | "completed";
  newFinancialTransactions: number;
}

export function findNewFinancialTransactions(before: Dashboard, after: Dashboard): ParsedSms[] {
  const existingIds = new Set(before.recent.map((message) => message.id));
  return after.recent.filter((message) => !existingIds.has(message.id));
}

export interface SyncAndNotifyDependencies {
  loadDashboard(): Promise<Dashboard>;
  sync(): Promise<Dashboard>;
  transactionNotificationsEnabled: boolean;
  notify(transactions: ParsedSms[]): Promise<void>;
}

export interface SyncAndNotifyResult {
  dashboard: Dashboard;
  newFinancialTransactions: ParsedSms[];
}

// The load-before/sync/load-after/diff/notify sequence, factored out so
// both the 15-minute background task (via runPeriodicSync below) and the
// real-time SMS-broadcast path (features/capabilities/provider.native.tsx)
// share one implementation instead of two independently-maintained copies
// that could drift — e.g. one path forgetting the notifications-enabled
// check, or diffing dashboards differently.
export async function syncAndNotify(
  dependencies: SyncAndNotifyDependencies,
): Promise<SyncAndNotifyResult> {
  const before = await dependencies.loadDashboard();
  const after = await dependencies.sync();
  const added = findNewFinancialTransactions(before, after);

  if (dependencies.transactionNotificationsEnabled && added.length > 0) {
    await dependencies.notify(added);
  }

  return { dashboard: after, newFinancialTransactions: added };
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
    loadDashboard: dependencies.loadDashboard,
    sync: dependencies.sync,
    transactionNotificationsEnabled: settings.transactionNotificationsEnabled,
    notify: dependencies.notify,
  });

  return { status: "completed", newFinancialTransactions: newFinancialTransactions.length };
}
