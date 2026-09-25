import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { moneyFontFamily } from "@/lib/fonts";

import type { AnalyticsDirection } from "../analytics-scope";
import type { InsightsTransactionRow } from "../insights-transaction-presentation";
import { InsightsEmptyState, InsightsNotice, InsightsPanel } from "./insights-chrome";

export function TransactionsPanel({
  direction,
  items,
  status,
  error,
  onRetry,
  onSelect,
}: {
  direction: AnalyticsDirection;
  items: InsightsTransactionRow[];
  status: "loading" | "ready" | "error";
  error: string | null;
  onRetry: () => void;
  onSelect(item: InsightsTransactionRow): void;
}) {
  return (
    <InsightsPanel className="mt-3.5">
      <Text className="text-[13px] font-semibold tracking-wide text-muted">
        Recent {direction === "income" ? "income" : "spending"}
      </Text>
      {status === "error" ? (
        <View className="mt-2">
          <InsightsNotice>
            {error ?? "Couldn't load recent transactions."}
          </InsightsNotice>
          <Pressable accessibilityRole="button" onPress={onRetry} className="mt-2 self-start">
            <Text className="text-caption font-semibold text-ink">Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {status === "loading" && items.length === 0 ? (
        <InsightsEmptyState
          icon="receipt"
          title="Loading recent activity"
          body="Fetching the latest matching transactions."
        />
      ) : items.length === 0 ? (
        <InsightsEmptyState
          icon="receipt"
          title="Nothing here yet"
          body="Matching activity will land in this list."
        />
      ) : (
        <View className="mt-1">
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`View details for ${item.name}`}
              onPress={() => onSelect(item)}
              className={`flex-row items-center gap-3 py-3 ${index === 0 ? "" : "border-t border-frost"}`}
            >
              <BrandLogo
                letter={item.letter}
                tile={item.tile}
                ink={item.ink}
                img={item.img ?? undefined}
                size={40}
                radius={14}
              />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
                  {item.name}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
                  {item.sub}
                </Text>
              </View>
              {item.amount ? (
                <Text
                  numberOfLines={1}
                  className={`text-subtitle ${direction === "income" ? "text-positive" : "text-ink"}`}
                  style={{ fontFamily: moneyFontFamily("semibold") }}
                >
                  {item.amount}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </InsightsPanel>
  );
}
