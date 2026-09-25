import { describe, expect, it, vi } from "vitest";

const readConsistentSnapshot = vi.fn(async () => ({
  items: [],
  total: 0,
  throughSequence: 0,
}));

vi.mock("./client", () => ({ db: {} }));
vi.mock("./projection-snapshot", () => ({ readConsistentSnapshot }));

const { queryCaughtUpTransactions } = await import("./caught-up-transactions");

describe("caught-up transaction freshness", () => {
  it("runs the public read inside the projection-consistent snapshot boundary", async () => {
    await expect(queryCaughtUpTransactions({ limit: 8 })).resolves.toEqual({
      items: [],
      total: 0,
      throughSequence: 0,
    });
    expect(readConsistentSnapshot).toHaveBeenCalledTimes(1);
  });
});
