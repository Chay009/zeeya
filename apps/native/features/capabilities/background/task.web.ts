export const BACKGROUND_SYNC_TASK = "zeeya-periodic-sms-sync";

export async function setBackgroundSyncRegistration(enabled: boolean): Promise<void> {
  if (enabled) throw new Error("Background SMS sync is Android-only.");
}
