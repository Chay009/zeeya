// Proves the exact thing useDashboardSync's own comments claim but that
// no test could previously check directly: that the "new since you were
// away" dialog state is genuinely suppressed on this screen's first-ever
// load (an empty placeholder Dashboard vs. a real one would otherwise
// make every existing message look "new" the moment the app is first
// opened), and genuinely fires on foreground resume / any load after
// that. useDashboardSync itself can't be unit tested (it imports
// react-native's AppState, which fails to even parse under Vitest — same
// reason lib/sms.ts's own module can't be either), which is exactly why
// this state machine was pulled out into its own plain module.
import { createMalanaEngine } from "@zeeya/parser/malana";
import { describe, expect, it } from "vitest";

import type { Dashboard } from "@/lib/dashboard";
import type { ParsedSms } from "@/lib/sms";

import {
  applyDashboardUpdate,
  dismissNewSinceLastView,
  initialNewSinceLastViewState,
} from "./new-since-last-view";

function transaction(id: string, date: number): ParsedSms {
  const body = "INR 10 debited from account XX1234";
  return {
    id,
    sender: "VM-HDFCBK",
    body,
    date,
    result: createMalanaEngine().parse(body, "VM-HDFCBK"),
  };
}

function dashboard(recent: ParsedSms[]): Dashboard {
  return {
    accounts: [],
    detectedAccounts: [],
    banks: [],
    monthIncomeByCurrency: {},
    monthExpenseByCurrency: {},
    subscriptions: [],
    mandates: [],
    mandatesByMerchant: [],
    activity: recent,
    recent,
  };
}

describe("new-since-last-view state machine", () => {
  it("does NOT surface anything on the very first load, even though the placeholder-to-real jump looks like a huge diff", () => {
    // This is the exact scenario the app's cold start produces: the
    // screen starts with deriveDashboard([]) (nothing), then the first
    // real sync can return years of existing transactions. None of that
    // is "new since you were away" — it's just the app loading for the
    // first time.
    const state = initialNewSinceLastViewState(dashboard([]));
    const yearsOfHistory = dashboard([transaction("old1", 1), transaction("old2", 2)]);

    const afterFirstLoad = applyDashboardUpdate(state, yearsOfHistory, {
      completesFirstLoad: true,
    });

    expect(afterFirstLoad.newSinceLastView).toEqual([]);
    expect(afterFirstLoad.suppressDiff).toBe(false);
  });

  it("DOES surface new activity on the load after the first one — this is the foreground-resume case", () => {
    const state = initialNewSinceLastViewState(dashboard([]));
    const afterFirstLoad = applyDashboardUpdate(state, dashboard([transaction("old", 1)]), {
      completesFirstLoad: true,
    });

    // Simulates: user backgrounds the app, a new SMS arrives and gets
    // synced, user reopens the app — AppState fires "active", the hook's
    // AppState listener triggers checkPermissionThenLoad -> load(),
    // which calls applyDashboard(nextDashboard) with the new message
    // already in `recent`.
    const arrived = transaction("new-while-away", 2);
    const afterResume = applyDashboardUpdate(
      afterFirstLoad,
      dashboard([arrived, transaction("old", 1)]),
    );

    expect(afterResume.newSinceLastView).toEqual([arrived]);
  });

  it("stays suppressed across every progress tick of the first sync itself, not just its final result", () => {
    // The first-ever sync pages through multiple onProgress calls before
    // load() finally marks completesFirstLoad — none of those
    // intermediate ticks should surface anything either.
    let state = initialNewSinceLastViewState(dashboard([]));
    state = applyDashboardUpdate(state, dashboard([transaction("p1", 1)])); // tick 1
    state = applyDashboardUpdate(state, dashboard([transaction("p1", 1), transaction("p2", 2)])); // tick 2
    state = applyDashboardUpdate(
      state,
      dashboard([transaction("p1", 1), transaction("p2", 2), transaction("p3", 3)]),
      { completesFirstLoad: true }, // final result
    );

    expect(state.newSinceLastView).toEqual([]);
  });

  it("accumulates new activity across several subsequent loads instead of only keeping the latest one", () => {
    let state = initialNewSinceLastViewState(dashboard([]));
    state = applyDashboardUpdate(state, dashboard([transaction("old", 1)]), {
      completesFirstLoad: true,
    });

    const first = transaction("first-new", 2);
    state = applyDashboardUpdate(state, dashboard([first, transaction("old", 1)]));

    const second = transaction("second-new", 3);
    state = applyDashboardUpdate(state, dashboard([second, first, transaction("old", 1)]));

    expect(state.newSinceLastView).toEqual([first, second]);
  });

  it("never adds the same message twice even if it appears in more than one update's diff", () => {
    let state = initialNewSinceLastViewState(dashboard([]));
    state = applyDashboardUpdate(state, dashboard([transaction("old", 1)]), {
      completesFirstLoad: true,
    });

    const added = transaction("added", 2);
    state = applyDashboardUpdate(state, dashboard([added, transaction("old", 1)]));
    // A second, redundant sync re-reports the exact same dashboard
    // (e.g. a foreground resume that found nothing new) — `added` is
    // still present in `recent` but isn't a fresh diff result.
    state = applyDashboardUpdate(state, dashboard([added, transaction("old", 1)]));

    expect(state.newSinceLastView).toEqual([added]);
  });

  it("dismissing clears the list, and a later load starts accumulating fresh rather than staying empty forever", () => {
    let state = initialNewSinceLastViewState(dashboard([]));
    state = applyDashboardUpdate(state, dashboard([transaction("old", 1)]), {
      completesFirstLoad: true,
    });
    const first = transaction("first", 2);
    state = applyDashboardUpdate(state, dashboard([first, transaction("old", 1)]));
    expect(state.newSinceLastView).toEqual([first]);

    state = dismissNewSinceLastView(state);
    expect(state.newSinceLastView).toEqual([]);

    const second = transaction("second", 3);
    state = applyDashboardUpdate(state, dashboard([second, first, transaction("old", 1)]));
    expect(state.newSinceLastView).toEqual([second]);
  });

  it("a redundant completesFirstLoad after the first one is a no-op, not a re-suppression", () => {
    let state = initialNewSinceLastViewState(dashboard([]));
    state = applyDashboardUpdate(state, dashboard([transaction("old", 1)]), {
      completesFirstLoad: true,
    });
    expect(state.suppressDiff).toBe(false);

    // subscribeToMessageSync also passes completesFirstLoad: true on
    // every one of its own updates (see use-dashboard-sync.ts) — it must
    // never flip suppressDiff back on and hide real new activity.
    const added = transaction("added", 2);
    state = applyDashboardUpdate(state, dashboard([added, transaction("old", 1)]), {
      completesFirstLoad: true,
    });

    expect(state.suppressDiff).toBe(false);
    expect(state.newSinceLastView).toEqual([added]);
  });
});
