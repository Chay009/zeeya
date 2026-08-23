import { View, type StyleProp, type ViewStyle } from "react-native";

import { dashboardTheme as t } from "@/constants/dashboard-theme";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: t.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
