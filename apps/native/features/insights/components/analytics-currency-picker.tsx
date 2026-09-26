import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { useThemeColors } from "@/components/ui/theme";

export function AnalyticsCurrencyPicker({
  currencies,
  selected,
  onSelect,
}: {
  currencies: string[];
  selected: string;
  onSelect(currency: string): void;
}) {
  const colors = useThemeColors();
  if (currencies.length < 2) return null;

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 11, color: colors.muted }}>Showing real values in</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingTop: 8, paddingRight: 4 }}
      >
        {currencies.map((currency) => {
          const active = currency === selected;
          return (
            <Pressable
              key={currency}
              accessibilityRole="button"
              accessibilityLabel={`Show analytics in ${currency}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(currency)}
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: "center",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.ink : colors.border,
                backgroundColor: active ? colors.ink : colors.card,
                paddingHorizontal: 13,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "800", color: active ? colors.onInk : colors.inkSoft }}
              >
                {currency}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
