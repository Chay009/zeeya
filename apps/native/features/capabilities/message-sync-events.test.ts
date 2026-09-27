import { describe, expect, it } from "vitest";

import { publishMessageSync, subscribeToMessageSync } from "./message-sync-events";

describe("message sync events", () => {
  it("notifies current listeners and stops after unsubscribe", () => {
    let received = 0;
    const unsubscribe = subscribeToMessageSync(() => {
      received++;
    });

    publishMessageSync();
    unsubscribe();
    publishMessageSync();

    expect(received).toBe(1);
  });

  it("isolates listener removal during a notification snapshot", () => {
    const received: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    const unsubscribeFirst = subscribeToMessageSync(() => {
      received.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = subscribeToMessageSync(() => received.push("second"));

    publishMessageSync();
    unsubscribeFirst();
    unsubscribeSecond();

    expect(received).toEqual(["first", "second"]);
  });
});
