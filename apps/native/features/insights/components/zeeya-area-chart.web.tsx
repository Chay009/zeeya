import { Text, View } from "react-native";
import { useThemeColors } from "@/components/ui/theme";
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
  const colors = useThemeColors();
  return (
    <View
      style={{
        height,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.fill,
        borderRadius: 18,
      }}
    >
      <Text>
        {isLoading ? "Loading spending chart…" : "Charts are available in the native app."}
      </Text>
    </View>
  );
}
