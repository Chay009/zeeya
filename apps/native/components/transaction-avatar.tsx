import { View } from "react-native";

import { AppText as Text } from "./app-text";
import { AppIcon, type AppIconName } from "./icon";

import { colorForCategory } from "@/constants/dashboard-theme";

const CATEGORY_ICONS: Record<string, AppIconName> = {
  food: "food",
  fuel: "fuel",
  entertainment: "film",
  travel: "airplane",
  "e-commerce": "cart",
  shopping: "bag",
  medical: "health",
  payments: "swap",
  monetary: "swap",
  hospitality: "hotel",
  automobile: "car",
  fashion: "shirt",
  cosmetics: "sparkles",
};

interface Props {
  label: string;
  category: string | null;
  size?: number;
}

export function TransactionAvatar({ label, category, size = 44 }: Props) {
  const color = colorForCategory(category);
  const icon = category ? CATEGORY_ICONS[category] : undefined;
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}33`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? (
        <AppIcon name={icon} size={size * 0.5} color={color} />
      ) : (
        <Text style={{ color, fontSize: size * 0.4, fontWeight: "700" }}>{initial}</Text>
      )}
    </View>
  );
}
