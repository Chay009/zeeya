// The single definition of "what counts as new since this screen last
// showed something" — pulled out of useDashboardSync so it's directly
// unit-testable. useDashboardSync itself imports react-native (AppState),
// which fails to even parse under Vitest (same reason lib/sms.ts's own
// module can't be — see its comment), so this state machine, the part
// actually worth proving (does it correctly stay silent on the very
// first load, does it correctly fire on the next one, does it
// accumulate/de-duplicate across several updates), has to live where a
// test can reach it.
// Relative, not the "@/" alias the rest of this hook's directory uses:
// this module needs to be a real (non-type-only) import reachable from a
// Vitest test, and no vite/vitest alias config resolves "@/" at test
// runtime here (every other "@/" import anywhere else in a *.test.ts file
// in this codebase is a type-only import, which gets erased before
// module resolution ever runs — confirmed there are no counterexamples).
import type { Dashboard } from "../../../lib/dashboard";
import type { ParsedSms } from "../../../lib/sms";
import { findNewFinancialTransactions } from "../../capabilities/background/periodic-sync";

export interface NewSinceLastViewState {
  // True until the first update that passes completesFirstLoad — see
  // applyDashboardUpdate's own comment for why this must suppress the
  // diff, not just start `dashboard` at the real initial value.
  suppressDiff: boolean;
  dashboard: Dashboard;
  newSinceLastView: ParsedSms[];
}

export function initialNewSinceLastViewState(dashboard: Dashboard): NewSinceLastViewState {
  return { suppressDiff: true, dashboard, newSinceLastView: [] };
}

// Called for every dashboard update this screen receives, from whichever
// source produced it (a full load's own result, that same load's
// intermediate progress ticks, or the app-root provider's own background
// sync) — see useDashboardSync's own comment on why those all need to
// share one definition.
//
// `completesFirstLoad` marks the update that finishes this screen's very
// first-ever successful dashboard load. Before that point, `dashboard`
// in the state is still the empty placeholder Dashboard the hook starts
// with — diffing against it would make every real message on the device
// look spuriously "new," so the diff is suppressed for every update up
// to and including that first one. suppressDiff only ever transitions
// true -> false, once; passing completesFirstLoad again later is a no-op.
export function applyDashboardUpdate(
  state: NewSinceLastViewState,
  next: Dashboard,
  options: { completesFirstLoad?: boolean } = {},
): NewSinceLastViewState {
  const added = state.suppressDiff ? [] : findNewFinancialTransactions(state.dashboard, next);
  const existingIds = new Set(state.newSinceLastView.map((message) => message.id));
  const deduped = added.filter((message) => !existingIds.has(message.id));

  return {
    suppressDiff: state.suppressDiff && !options.completesFirstLoad,
    dashboard: next,
    newSinceLastView:
      deduped.length > 0 ? [...state.newSinceLastView, ...deduped] : state.newSinceLastView,
  };
}

export function dismissNewSinceLastView(state: NewSinceLastViewState): NewSinceLastViewState {
  if (state.newSinceLastView.length === 0) return state;
  return { ...state, newSinceLastView: [] };
}
