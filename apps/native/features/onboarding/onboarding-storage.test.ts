import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("expo-secure-store", () => storage);
import { completeOnboarding, hasCompletedOnboarding } from "./onboarding-storage";

describe("onboarding completion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows setup on a fresh installation", async () => {
    storage.getItemAsync.mockResolvedValue(null);
    expect(await hasCompletedOnboarding()).toBe(false);
  });

  it("does not repeat setup after successful completion", async () => {
    storage.setItemAsync.mockResolvedValue(undefined);
    await completeOnboarding();
    const [key, value] = storage.setItemAsync.mock.calls[0];
    expect(value).toBe("complete");
    storage.getItemAsync.mockImplementation(async (requestedKey) =>
      requestedKey === key ? value : null,
    );
    expect(await hasCompletedOnboarding()).toBe(true);
  });

  it("does not treat a storage failure as completed setup", async () => {
    storage.setItemAsync.mockRejectedValue(new Error("Storage unavailable"));
    await expect(completeOnboarding()).rejects.toThrow("Storage unavailable");
  });
});
