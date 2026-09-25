import { Text, View } from "react-native";
import type { CategorySlice } from "../insights-data";

export function ZeeyaDonutChart({
  data,
  size = 200,
}: {
  data: CategorySlice[];
  isLoading?: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#e5eee8",
        borderRadius: size / 2,
      }}
    >
      <Text>
        {data.length ? "Charts are available in the native app." : "No expense data yet."}
      </Text>
    </View>
  );
}
