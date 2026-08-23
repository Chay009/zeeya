import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";
import { Card } from "@/features/dashboard/components/card";
import { formatMoney } from "@/features/dashboard/utils/format";

export function StatRow({
  currency,
  income,
  expense,
}: {
  currency: string;
  income: number;
  expense: number;
}) {
  const net = income - expense;
  return (
    <Card style={{ marginBottom: 16, flexDirection: "row", gap: 16 }}>
      <Stat
        label={currency === "INR" ? "Income" : `Income (${currency})`}
        value={formatMoney(income, currency)}
        color={t.positive}
        icon="trending-up"
      />
      <Stat
        label={currency === "INR" ? "Expenses" : `Expenses (${currency})`}
        value={formatMoney(expense, currency)}
        color={t.negative}
        icon="trending-down"
      />
      <Stat
        label="Net"
        value={formatMoney(net, currency)}
        color={net >= 0 ? t.positive : t.negative}
        icon="swap-horizontal"
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <Ionicons name={icon} size={13} color={color} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
      </View>
      <Text style={{ color, fontWeight: "700", fontSize: 15 }}>{value}</Text>
    </View>
  );
}
