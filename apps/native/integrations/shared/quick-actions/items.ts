import type { Action } from "expo-quick-actions";
import type { Href } from "expo-router";

// These destinations already exist. Keep shortcuts independent of a particular
// tab-bar implementation so the OS menu remains useful when navigation changes.
export const HOME_QUICK_ACTIONS = [
  {
    id: "home",
    title: "Home",
    icon: "home",
    params: { href: "/(tabs)" },
  },
  {
    id: "transactions",
    title: "Transactions",
    icon: "symbol:list.bullet.rectangle",
    params: { href: "/(tabs)/activity" },
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: "symbol:chart.bar",
    params: { href: "/(tabs)/insights" },
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    icon: "symbol:repeat",
    params: { href: "/subscriptions" },
  },
] as const satisfies readonly (Action & { params: { href: Href } })[];
