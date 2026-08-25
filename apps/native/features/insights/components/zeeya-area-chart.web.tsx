import { Text, View } from "react-native";
import type { SpendingPoint } from "../insights-data";

export interface ZeeyaAreaChartProps {
  data: SpendingPoint[];
  isLoading?: boolean;
  curveType?: string;
}

export function ZeeyaAreaChart({ isLoading }: ZeeyaAreaChartProps) {
  return (
    <View
      style={{
        height: 220,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#e5eee8",
        borderRadius: 18,
      }}
    >
      <Text>
        {isLoading ? "Loading spending chart…" : "Charts are available in the native app."}
      </Text>
    </View>
  );
}
