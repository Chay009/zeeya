import { Stack } from "expo-router";

import { BudgetsScreen } from "@/features/budgets/screens/budgets-screen";

export default function BudgetsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <BudgetsScreen />
    </>
  );
}
