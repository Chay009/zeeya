import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { AppRegistry, Platform } from "react-native";

import { countTransactionsArrivedAfter, latestArrivalSequence } from "@/db/caught-up-transactions";
import { db } from "@/db/client";
import migrations from "@/db/migrations/migrations";
import { getLocalSettings } from "@/db/settings";
import { checkBudgetAlerts } from "@/features/budgets/check-budget-alerts";
import { syncDeviceMessages } from "@/lib/device-message-sync";
import { hasSmsCapturePermissions } from "@/lib/sms";
import AndroidMessageQueueModule from "@/modules/zeeya-message-queue/src/ZeeyaMessageQueueModule.android";
import type { PendingSmsSignal } from "@/modules/zeeya-message-queue/src/types";
import { notifyNewFinancialTransactions } from "../notifications/notifications";
import { runPeriodicSync } from "./periodic-sync";

export const BACKGROUND_SYNC_TASK = "zeeya-periodic-sms-sync";
// Must match ZeeyaSmsHeadlessService.TASK_NAME.
const SMS_ARRIVED_TASK = "ZeeyaSmsArrived";
const MINIMUM_INTERVAL_MINUTES = 15;

// The inbox row can become readable shortly after SMS_RECEIVED; the
// foreground monitor waits the same (realtime-sms-monitor.ts).
const INBOX_SETTLE_MS = 1_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// One drain at a time. A trigger arriving mid-drain joins it and asks for one
// more pass, so several SMS in a row share one run instead of queueing
// separate ones, and two triggers can never count the same transaction.
let activeDrain: Promise<void> | null = null;
let drainAgain = false;

// Shared by the periodic task and the SMS-arrival headless task: imports new
// messages, then notifies only when Malana found transactions among them.
function syncMessagesInBackground(): Promise<void> {
  if (activeDrain) {
    drainAgain = true;
    return activeDrain;
  }
  activeDrain = (async () => {
    do {
      drainAgain = false;
      await runBackgroundSync();
    } while (drainAgain);
  })().finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

async function runBackgroundSync(): Promise<void> {
  // Headless task execution does not mount DatabaseProvider, so it must
  // apply pending migrations itself before reading local settings or the
  // ledger. This also covers the first background run after an OTA update.
  await migrate(db, migrations);
  const syncState: { pendingSignal: PendingSmsSignal | null } = { pendingSignal: null };
  const result = await runPeriodicSync({
    getSettings: getLocalSettings,
    canSync: () =>
      Platform.OS === "android" ? hasSmsCapturePermissions() : Promise.resolve(true),
    arrivalCursor: latestArrivalSequence,
    sync: async () => {
      syncState.pendingSignal =
        Platform.OS === "android" && AndroidMessageQueueModule
          ? await AndroidMessageQueueModule.peekPendingSmsSignal()
          : null;
      if (!syncState.pendingSignal) {
        await syncDeviceMessages();
        return;
      }
      // A read that starts after the signal was noted, so acknowledging it
      // never skips a message; retried once if the row wasn't readable yet.
      await wait(INBOX_SETTLE_MS);
      const { inserted } = await syncDeviceMessages({ fresh: true });
      if (inserted === 0) {
        await wait(INBOX_SETTLE_MS * 2);
        await syncDeviceMessages({ fresh: true });
      }
    },
    countTransactionsArrivedAfter,
    notify: notifyNewFinancialTransactions,
    afterSync: checkBudgetAlerts,
  });
  if (result.status === "completed" && syncState.pendingSignal && AndroidMessageQueueModule) {
    await AndroidMessageQueueModule.acknowledgePendingSmsSignal(
      syncState.pendingSignal.generation,
    );
  }
}

if (Platform.OS === "android") {
  // Started by ZeeyaSmsReceiver when an SMS arrives with the app backgrounded.
  // Registered from index.ts, before expo-router, so it exists when Android
  // starts the JS runtime without any screen.
  AppRegistry.registerHeadlessTask(SMS_ARRIVED_TASK, () => async () => {
    try {
      await syncMessagesInBackground();
    } catch (error) {
      console.error("Zeeya SMS arrival sync failed", error);
    }
  });
}

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      await syncMessagesInBackground();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.error("Zeeya background message sync failed", error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function setBackgroundSyncRegistration(enabled: boolean): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    if (enabled) throw new Error("Background message sync is unavailable on this platform.");
    return;
  }
  if (!enabled) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    return;
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error("Periodic background work is restricted on this device.");
  }

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
}
