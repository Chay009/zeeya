import { Stack } from "expo-router";

import { BudgetEditScreen } from "@/features/budgets/screens/budget-edit-screen";

export default function BudgetEditRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <BudgetEditScreen />
    </>
  );
}
