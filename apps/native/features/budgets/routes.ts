import type { Href } from "expo-router";

export const BUDGETS_ROUTE = "/budgets" as Href;

/** The editor for one category's limit (categories can contain "&" or "/"). */
export function budgetEditRoute(category: string): Href {
  return { pathname: "/budgets/[category]", params: { category } } as Href;
}
