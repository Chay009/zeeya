import { Text, View } from "react-native";
import type { CategorySlice } from "../insights-data";

export function ZeeyaDonutChart({ data }: { data: CategorySlice[]; isLoading?: boolean }) {
  return (
    <View
      style={{
        height: 220,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#e5eee8",
        borderRadius: 110,
      }}
    >
      <Text>
        {data.length ? "Charts are available in the native app." : "No expense data yet."}
      </Text>
    </View>
  );
}
