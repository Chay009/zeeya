import * as SecureStore from "expo-secure-store";

const COMPLETED_KEY = "zeeya.onboarding.completed.v1";

/** Kept separate from financial data: finishing setup never clears the ledger. */
export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(COMPLETED_KEY)) === "complete";
}

export async function completeOnboarding(): Promise<void> {
  await SecureStore.setItemAsync(COMPLETED_KEY, "complete");
}
