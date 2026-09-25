import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { hp } from "@/features/home-preview/theme";
import { moneyFontFamily } from "@/lib/fonts";

import type { AnalyticsDirection } from "../analytics-scope";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";

/** Transaction row from the Analytics mock: logo, name, time, amount pill. */
export function AnalyticsTransactionRow({
  item,
  index,
  direction,
  onPress,
}: {
  item: InsightsTransactionRow;
  index: number;
  direction: AnalyticsDirection;
  onPress: () => void;
}) {
  const income = direction === "income";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${item.name}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
        paddingVertical: 12,
        borderTopWidth: index === 0 ? 0 : 1,
        borderTopColor: hp.borderSoft,
      }}
    >
      <BrandLogo
        letter={item.letter}
        tile={item.tile}
        ink={item.ink}
        img={item.img ?? undefined}
        size={40}
        radius={14}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
          {item.name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
          {item.sub}
        </Text>
      </View>
      {item.amount ? (
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: income ? hp.accentSoft : hp.expenseBg,
          }}
        >
          <Text
            numberOfLines={1}
            className={`text-caption font-bold ${income ? "text-positive" : "text-coral"}`}
            style={{ fontFamily: moneyFontFamily("semibold") }}
          >
            {item.amount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
