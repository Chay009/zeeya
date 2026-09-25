import { create } from "zustand";

export type ActivityDirectionFilter = "all" | "income" | "expense" | "transfer";

function startOfCurrentMonth(): number {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

interface ActivityFiltersState {
  direction: ActivityDirectionFilter;
  monthStart: number;
  // Set by anything that wants Activity to land on a specific day (e.g.
  // tapping a Cashflow calendar cell) — a real timestamp for a real day,
  // consumed once by the Activity screen to scroll to that day's section,
  // then cleared via clearScrollToDay so it doesn't re-fire on the next
  // unrelated visit to the screen.
  scrollToDay: number | null;
  setDirection: (direction: ActivityDirectionFilter) => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  goToDay: (timestamp: number) => void;
  clearScrollToDay: () => void;
}

// Screen-local UI state (which month/direction the Activity tab is
// currently showing) — kept in its own store, separate from
// dashboard-store's actual synced data, since it's ephemeral view state
// with a different lifecycle and no other screen needs it.
export const useActivityFiltersStore = create<ActivityFiltersState>((set) => ({
  direction: "all",
  monthStart: startOfCurrentMonth(),
  scrollToDay: null,
  setDirection: (direction) => set({ direction }),
  goPrevMonth: () =>
    set((state) => {
      const date = new Date(state.monthStart);
      date.setMonth(date.getMonth() - 1);
      return { monthStart: date.getTime() };
    }),
  goNextMonth: () =>
    set((state) => {
      const date = new Date(state.monthStart);
      date.setMonth(date.getMonth() + 1);
      return { monthStart: date.getTime() };
    }),
  goToDay: (timestamp) => {
    const monthStart = new Date(timestamp);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    set({ monthStart: monthStart.getTime(), scrollToDay: timestamp });
  },
  clearScrollToDay: () => set({ scrollToDay: null }),
}));
