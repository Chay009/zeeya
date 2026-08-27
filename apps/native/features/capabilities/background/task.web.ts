export const BACKGROUND_SYNC_TASK = "zeeya-periodic-sms-sync";

export async function setBackgroundSyncRegistration(enabled: boolean): Promise<void> {
  if (enabled) throw new Error("Background message sync is unavailable on this platform.");
}
