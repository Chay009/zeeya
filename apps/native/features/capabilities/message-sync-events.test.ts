import { describe, expect, it } from "vitest";

import { deriveDashboard } from "../../lib/dashboard";
import { publishMessageSync, subscribeToMessageSync } from "./message-sync-events";

const dashboard = deriveDashboard([]);

describe("message sync events", () => {
  it("notifies current dashboard listeners and stops after unsubscribe", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToMessageSync((next) => received.push(next));

    publishMessageSync(dashboard);
    unsubscribe();
    publishMessageSync(dashboard);

    expect(received).toEqual([dashboard]);
  });

  it("isolates listener removal during a notification snapshot", () => {
    const received: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    const unsubscribeFirst = subscribeToMessageSync(() => {
      received.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = subscribeToMessageSync(() => received.push("second"));

    publishMessageSync(dashboard);
    unsubscribeFirst();
    unsubscribeSecond();

    expect(received).toEqual(["first", "second"]);
  });
});
