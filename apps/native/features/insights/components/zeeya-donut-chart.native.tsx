import { Pie, PolarChart } from "victory-native";
import { View } from "react-native";

import type { CategorySlice } from "../insights-data";

export function ZeeyaDonutChart({
  data,
  isLoading = false,
}: {
  data: CategorySlice[];
  isLoading?: boolean;
}) {
  if (isLoading)
    return <View style={{ height: 220, borderRadius: 110, backgroundColor: "#e5eee8" }} />;
  if (data.length === 0) return <View style={{ height: 220 }} />;

  return (
    <View style={{ height: 220 }}>
      <PolarChart data={data} labelKey="label" valueKey="value" colorKey="color">
        <Pie.Chart innerRadius="62%" size={200}>
          {() => <Pie.Slice animate={{ type: "timing", duration: 450 }} />}
        </Pie.Chart>
      </PolarChart>
    </View>
  );
}
