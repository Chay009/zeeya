import { Pie, PolarChart } from "victory-native";
import { View } from "react-native";

import type { CategorySlice } from "../insights-data";

const SLICE_ANIMATION = { type: "timing", duration: 450 } as const;

function chartSlices(data: CategorySlice[]): CategorySlice[] {
  return data.filter((slice) => slice.value > 0);
}

export function ZeeyaDonutChart({
  data,
  isLoading = false,
  size = 200,
}: {
  data: CategorySlice[];
  isLoading?: boolean;
  size?: number;
}) {
  const slices = chartSlices(data);

  if (isLoading && slices.length === 0) {
    return null;
  }

  if (slices.length === 0) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      <PolarChart
        data={slices}
        labelKey="label"
        valueKey="value"
        colorKey="color"
      >
        <Pie.Chart innerRadius="62%" size={size}>
          {({ slice }) => (
            <Pie.Slice key={slice.label} animate={SLICE_ANIMATION} />
          )}
        </Pie.Chart>
      </PolarChart>
    </View>
  );
}
