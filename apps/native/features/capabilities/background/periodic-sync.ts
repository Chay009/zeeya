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

  const before = await dependencies.loadDashboard();
  const after = await dependencies.sync();
  const added = findNewFinancialTransactions(before, after);

  if (settings.transactionNotificationsEnabled && added.length > 0) {
    await dependencies.notify(added);
  }

  return { status: "completed", newFinancialTransactions: added.length };
}
