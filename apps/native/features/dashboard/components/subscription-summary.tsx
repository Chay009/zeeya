import { Text, View } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { Card } from "@/features/dashboard/components/card";
import { formatMoney } from "@/features/dashboard/utils/format";
import type { Dashboard } from "@/lib/dashboard";
import { subscriptionMonthlyTotals } from "@/lib/subscriptions";

// One "₹1,234" per currency present, joined — subscriptions can be in
// different currencies, and summing them as raw numbers would be as wrong
// as the monthly income/expense totals this mirrors.
function subscriptionTotalsLabel(totalsByCurrency: Record<string, number>): string {
  const parts = Object.entries(totalsByCurrency).map(([currency, amount]) =>
    formatMoney(amount, currency),
  );
  // No "likely" subscriptions yet (only lower-confidence "possible" ones) —
  // don't claim a monthly total with nothing behind it.
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function SubscriptionSummary({
  subscriptions,
}: {
  subscriptions: Dashboard["subscriptions"];
}) {
  if (subscriptions.length === 0) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text style={{ color: t.textPrimary, fontWeight: "700", fontSize: 16 }}>
          Recurring payments
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          {subscriptionTotalsLabel(subscriptionMonthlyTotals(subscriptions))} / month
        </Text>
      </View>
      {subscriptions.map((sub) => (
        <View
          key={`${sub.merchant}-${sub.currency}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: t.textPrimary, fontSize: 13 }}>
            {sub.merchant}{" "}
            <Text style={{ color: t.textMuted }}>
              · seen {sub.count}x ·{" "}
              {sub.confidence === "likely" ? "Likely" : "Possible"}
            </Text>
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {formatMoney(sub.amount, sub.currency)}
          </Text>
        </View>
      ))}
    </Card>
  );
}
