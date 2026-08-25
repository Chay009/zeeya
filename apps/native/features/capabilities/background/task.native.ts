import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { Platform } from "react-native";

import { db, migrateLegacyDatabaseIfNeeded } from "@/db/client";
import { loadDashboard } from "@/db/ingestion";
import migrations from "@/db/migrations/migrations";
import { getLocalSettings } from "@/db/settings";
import { syncDeviceMessages } from "@/lib/device-message-sync";
import { notifyNewFinancialTransactions } from "../notifications/notifications";
import { runPeriodicSync } from "./periodic-sync";

export const BACKGROUND_SYNC_TASK = "zeeya-periodic-sms-sync";
const MINIMUM_INTERVAL_MINUTES = 15;

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      // Headless task execution does not mount DatabaseProvider, so it must
      // apply pending migrations itself before reading local settings or the
      // ledger. This also covers the first background run after an OTA update.
      await migrate(db, migrations);
      migrateLegacyDatabaseIfNeeded();
      await runPeriodicSync({
        getSettings: getLocalSettings,
        loadDashboard,
        sync: syncDeviceMessages,
        notify: notifyNewFinancialTransactions,
      });
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
