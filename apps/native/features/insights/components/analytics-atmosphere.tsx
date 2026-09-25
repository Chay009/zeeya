import { View } from "react-native";

export function AnalyticsAtmosphere() {
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View className="absolute -top-[90px] -right-[70px] h-[280px] w-[280px] rounded-full bg-wash-violet" />
      <View className="absolute top-[210px] -left-[100px] h-[240px] w-[240px] rounded-full bg-wash-blue" />
      <View className="absolute top-[520px] -right-[40px] h-[200px] w-[200px] rounded-full bg-wash-green" />
    </View>
  );
}
