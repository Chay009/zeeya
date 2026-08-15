import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colorForCategory } from "@/constants/dashboard-theme";

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  food: "fast-food-outline",
  fuel: "car-outline",
  entertainment: "film-outline",
  travel: "airplane-outline",
  "e-commerce": "cart-outline",
  shopping: "bag-outline",
  medical: "medkit-outline",
  payments: "swap-horizontal-outline",
  monetary: "swap-horizontal-outline",
  hospitality: "bed-outline",
  automobile: "car-sport-outline",
  fashion: "shirt-outline",
  cosmetics: "sparkles-outline",
};

interface Props {
  label: string;
  category: string | null;
  size?: number;
}

// No brand-logo assets are bundled (would mean shipping trademarked
// third-party marks) — every merchant gets a colored initial avatar, tinted
// and icon'd by its Malana-detected category when known, falling back to a
// neutral initial when it isn't.
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
        <Ionicons name={icon} size={size * 0.5} color={color} />
      ) : (
        <Text style={{ color, fontSize: size * 0.4, fontWeight: "700" }}>{initial}</Text>
      )}
    </View>
  );
}
