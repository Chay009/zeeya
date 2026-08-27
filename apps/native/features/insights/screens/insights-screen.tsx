import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboardSync } from "@/features/dashboard/hooks/use-dashboard-sync";
import { ZeeyaAreaChart } from "../components/zeeya-area-chart";
import { ZeeyaDonutChart } from "../components/zeeya-donut-chart";
import { buildCategorySlices, buildSpendingSeries, primaryExpenseCurrency } from "../insights-data";

export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { status, dashboard } = useDashboardSync();
  const currency = useMemo(
    () => primaryExpenseCurrency(dashboard.recent) ?? "INR",
    [dashboard.recent],
  );
  const series = useMemo(
    () => buildSpendingSeries(dashboard.recent, currency),
    [currency, dashboard.recent],
  );
  const categories = useMemo(
    () => buildCategorySlices(dashboard.recent, currency),
    [currency, dashboard.recent],
  );
  const isLoading = status === "checking" || status === "loading";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f5fbf7" }}
      contentContainerStyle={{
        padding: 22,
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: 48,
      }}
    >
      <Text style={{ color: "#173d30", fontSize: 28, fontWeight: "800" }}>Insights</Text>
      <Text style={{ color: "#65776e", fontSize: 14, marginTop: 6 }}>
        Spending is shown separately for {currency}; currencies are never added together.
      </Text>

      <View style={{ backgroundColor: "white", borderRadius: 22, padding: 18, marginTop: 24 }}>
        <Text style={{ color: "#173d30", fontSize: 17, fontWeight: "800" }}>Last 14 days</Text>
        <ZeeyaAreaChart data={series} isLoading={isLoading} curveType="bumpX" />
      </View>

      <View style={{ backgroundColor: "white", borderRadius: 22, padding: 18, marginTop: 16 }}>
        <Text style={{ color: "#173d30", fontSize: 17, fontWeight: "800" }}>By category</Text>
        <ZeeyaDonutChart data={categories} isLoading={isLoading} />
        {categories.map((category) => (
          <View
            key={category.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: category.color }}
              />
              <Text style={{ color: "#65776e" }}>{category.label}</Text>
            </View>
            <Text style={{ color: "#173d30", fontWeight: "700" }}>
              {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
                category.value,
              )}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
