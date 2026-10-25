import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { SpendingRing } from "@/components/charts/spending-ring";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { useThemeColors } from "@/components/ui/theme";

// Fictional amounts for the first-run preview. Never wired to the ledger.
const SAMPLE_SHARES = [
  { key: "food", label: "Food", value: 8400 },
  { key: "groceries", label: "Groceries", value: 6200 },
  { key: "travel", label: "Travel", value: 3820 },
] as const;

const SAMPLE_TOTAL = SAMPLE_SHARES.reduce((sum, share) => sum + share.value, 0);

const SAMPLE_ROWS = [
  { name: "Cafe", category: "Food", letter: "C", amount: 240 },
  { name: "Grocery store", category: "Groceries", letter: "G", amount: 1280 },
  { name: "City ride", category: "Travel", letter: "R", amount: 186 },
] as const;

/**
 * A small, fake "this month" card so the first screen shows the product.
 * Built from the same pieces Home and Analytics use. Amounts are samples.
 */
export function OnboardingPreview() {
  const colors = useThemeColors();
  const shareColors = [colors.chart1, colors.chart2, colors.chart3];
  const tiles = [colors.accentSoft, colors.fillStrong, colors.warningSoft];
  const inks = [colors.accentDeep, colors.ink, colors.warning];

  return (
    <View
      accessible
      accessibilityLabel="Example of a month in Zeeya. These amounts are samples, not your money."
    >
      <Card title="This month" subtitle="An example, not your money">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-caption text-muted">Spent</Text>
            <Money value={SAMPLE_TOTAL} currency="INR" size="title" />
          </View>
          <SpendingRing
            segments={SAMPLE_SHARES.map((share, index) => ({
              key: share.key,
              value: share.value,
              color: shareColors[index] ?? colors.chart1,
            }))}
            size={96}
            stroke={11}
          >
            <Text className="text-meta text-muted">Sample</Text>
          </SpendingRing>
        </View>
        <View className="mt-4 gap-2">
          {SAMPLE_SHARES.map((share, index) => (
            <View key={share.key} className="flex-row items-center gap-2">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: shareColors[index] ?? colors.chart1 }}
              />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-caption text-ink">
                {share.label}
              </Text>
              <Money value={share.value} currency="INR" size="caption" />
            </View>
          ))}
        </View>
        <View className="-mx-4 mt-4">
          <View className="mb-1 h-px bg-divider" />
          {SAMPLE_ROWS.map((row, index) => (
            <View key={row.name}>
              {index > 0 ? <View className="h-px bg-divider" style={{ marginLeft: 68 }} /> : null}
              <TransactionRow
                name={row.name}
                subtitle={row.category}
                logo={{
                  letter: row.letter,
                  tile: tiles[index] ?? colors.fill,
                  ink: inks[index] ?? colors.ink,
                }}
                amount={row.amount}
                currency="INR"
                direction="expense"
              />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
