import { useSyncExternalStore } from "react";
import { AppState, type NativeEventSubscription } from "react-native";

// "Today" as a store: the local start-of-day timestamp, which changes only
// when the calendar day rolls over. Two consumers:
//  - screens (useToday) — day-dependent UI like "Day 12" or month labels
//    re-renders at midnight without an effect.
//  - lib/live-queries.ts (subscribeDayChanged) — a new day re-reads every
//    local query, because "this month"/"upcoming" answers are relative to
//    now. Query functions read the clock themselves when they run, so cache
//    keys never carry a timestamp.
//
// Timers don't fire while the app is suspended, so returning to the
// foreground re-checks the day too.

export function startOfDay(at: number = Date.now()): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

let today = startOfDay();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appState: NativeEventSubscription | null = null;

function check(): void {
  const next = startOfDay();
  if (next === today) return;
  today = next;
  for (const listener of [...listeners]) listener();
}

function scheduleMidnight(): void {
  const nextDay = new Date(today);
  nextDay.setDate(nextDay.getDate() + 1);
  // A second past midnight so the new day has certainly begun.
  timer = setTimeout(
    () => {
      check();
      scheduleMidnight();
    },
    Math.max(1000, nextDay.getTime() - Date.now() + 1000),
  );
}

export function subscribeDayChanged(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    scheduleMidnight();
    appState = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    appState?.remove();
    appState = null;
  };
}

export function currentDay(): number {
  return today;
}

/** Local start of today; re-renders when the calendar day changes. */
export function useToday(): number {
  return useSyncExternalStore(subscribeDayChanged, currentDay, currentDay);
}
