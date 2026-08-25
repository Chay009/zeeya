import { CartesianChart, Area, Line, type CurveType } from "victory-native";
import { View } from "react-native";

import type { SpendingPoint } from "../insights-data";

export interface ZeeyaAreaChartProps {
  data: SpendingPoint[];
  isLoading?: boolean;
  curveType?: CurveType;
}

export function ZeeyaAreaChart({
  data,
  isLoading = false,
  curveType = "bumpX",
}: ZeeyaAreaChartProps) {
  if (isLoading) {
    return <View style={{ height: 220, borderRadius: 18, backgroundColor: "#e5eee8" }} />;
  }

  return (
    <View style={{ height: 220 }}>
      <CartesianChart data={data} xKey="day" yKeys={["value"]} domainPadding={{ top: 20 }}>
        {({ points, chartBounds }) => (
          <>
            <Area
              points={points.value}
              y0={chartBounds.bottom}
              color="rgba(72, 185, 141, 0.22)"
              curveType={curveType}
              animate={{ type: "timing", duration: 450 }}
            />
            <Line
              points={points.value}
              color="#176b4d"
              strokeWidth={3}
              curveType={curveType}
              animate={{ type: "timing", duration: 450 }}
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
}
