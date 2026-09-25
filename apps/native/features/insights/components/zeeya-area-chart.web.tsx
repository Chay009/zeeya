import { Text, View } from "react-native";
import { hp } from "@/features/home-preview/theme";
import type { SpendingPoint } from "../insights-data";

export interface ZeeyaAreaChartProps {
  data: SpendingPoint[];
  isLoading?: boolean;
  curveType?: string;
  height?: number;
  lineColor?: string;
  areaColor?: string;
  showAxes?: boolean;
  currency?: string;
}

export function ZeeyaAreaChart({ isLoading, height = 220 }: ZeeyaAreaChartProps) {
  return (
    <View
      style={{
        height,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hp.surfaceMintAlt,
        borderRadius: 18,
      }}
    >
      <Text>
        {isLoading ? "Loading spending chart…" : "Charts are available in the native app."}
      </Text>
    </View>
  );
}
