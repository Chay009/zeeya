import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, PressableFeedback, Spinner } from "heroui-native";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { IconTile } from "@/components/ui/controls";
import { NavBar } from "@/components/ui/header";
import { currencySymbol, moneyLabel } from "@/components/ui/money";
import { tick } from "@/components/ui/motion";
import { SkeletonRows } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { categoryIcon } from "@/features/insights/category-visual";
import { usePrimaryCurrency } from "@/features/insights/hooks/use-dashboard-currencies";
import { fromMinorUnits } from "@/lib/currency";
import { moneyFontFamily } from "@/lib/fonts";

import { parseLimitInput, suggestedLimitMinorUnits } from "../budget-presentation";
import { saveBudget, useBudgets } from "../hooks/use-budgets";

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long" });

/** An amount as the user would type it: whole rupees, no symbol. */
function inputText(minorUnits: number, currency: string): string {
  return String(fromMinorUnits(minorUnits, currency));
}

export function BudgetEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { category = "" } = useLocalSearchParams<{ category: string }>();
  const currency = usePrimaryCurrency();
  const { overview, status } = useBudgets(currency);

  const existing = overview?.budgets.find((budget) => budget.category === category) ?? null;
  const spend = overview?.categories.find((row) => row.category === category) ?? null;
  const suggested = spend ? suggestedLimitMinorUnits(spend, currency) : null;

  // null until the user types: the field shows the current limit, else the
  // suggestion — derived, so it fills in as soon as the overview loads.
  const [typed, setTyped] = useState<string | null>(null);
  const initial = existing
    ? inputText(existing.limitMinorUnits, currency)
    : suggested !== null
      ? inputText(suggested, currency)
      : "";
  const text = typed ?? initial;
  const limit = parseLimitInput(text, currency);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const commit = async (monthlyLimitMinorUnits: number | null) => {
    setSaving(true);
    setFailure(null);
    try {
      await saveBudget({ category, currency, monthlyLimitMinorUnits });
      tick();
      router.back();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const chips = [
    suggested !== null ? { label: "Usual", minorUnits: suggested } : null,
    spend && spend.averageMonthlyMinorUnits > 0
      ? { label: "10% less", minorUnits: Math.round((suggested ?? 0) * 0.9) }
      : null,
  ].filter((chip): chip is { label: string; minorUnits: number } => chip !== null && chip.minorUnits > 0);

  const monthName = overview ? MONTH.format(overview.monthStart) : "this month";

  return (
    <View className="flex-1 bg-background">
      <NavBar title={existing ? "Edit budget" : "New budget"} onBack={() => router.back()} topInset={insets.top} />
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mt-2 items-center rounded-card bg-card px-5 pb-6 pt-6">
          <IconTile
            icon={categoryIcon(category)}
            color={colors.accentDeep}
            background={withAlpha(colors.accentDeep, 0.14)}
            size={48}
          />
          <Text numberOfLines={1} className="mt-3 text-subtitle font-bold text-ink">
            {category}
          </Text>
          <Text className="mt-1 text-caption text-muted">Monthly limit</Text>

          <View className="mt-4 flex-row items-center justify-center">
            <Text
              className="text-muted"
              style={{ fontFamily: moneyFontFamily("semibold"), fontSize: 28, marginRight: 4 }}
            >
              {currencySymbol(currency)}
            </Text>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setTyped(next);
                setFailure(null);
              }}
              placeholder="0"
              placeholderTextColor={colors.faint}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              accessibilityLabel={`Monthly limit for ${category}`}
              style={{
                minWidth: 80,
                color: colors.ink,
                fontFamily: moneyFontFamily("bold"),
                fontSize: 44,
                letterSpacing: -1,
                padding: 0,
              }}
            />
          </View>

          {status === "loading" ? (
            <View className="mt-4 w-full">
              <SkeletonRows count={1} />
            </View>
          ) : spend ? (
            <Text className="mt-3 text-center text-caption text-muted">
              {spend.averageMonthlyMinorUnits > 0
                ? `You usually spend about ${moneyLabel(fromMinorUnits(spend.averageMonthlyMinorUnits, currency), currency)} a month here · `
                : ""}
              {moneyLabel(fromMinorUnits(spend.thisMonthMinorUnits, currency), currency)} so far in {monthName}
            </Text>
          ) : null}

          {chips.length > 0 ? (
            <View className="mt-4 flex-row gap-2">
              {chips.map((chip) => (
                <PressableFeedback
                  key={chip.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${chip.label}: ${moneyLabel(fromMinorUnits(chip.minorUnits, currency), currency)}`}
                  onPress={() => {
                    tick();
                    setTyped(inputText(chip.minorUnits, currency));
                  }}
                  className="rounded-pill bg-fill px-3.5 py-2"
                >
                  <Text className="text-caption font-semibold text-ink">
                    {chip.label} · {moneyLabel(fromMinorUnits(chip.minorUnits, currency), currency)}
                  </Text>
                </PressableFeedback>
              ))}
            </View>
          ) : null}
        </View>

        {failure ? <Text className="mt-3 px-1 text-caption text-negative">{failure}</Text> : null}
        {text.trim() !== "" && limit === null ? (
          <Text className="mt-3 px-1 text-caption text-negative">Enter an amount above zero.</Text>
        ) : null}

        <Button
          className="mt-5"
          isDisabled={limit === null || saving}
          onPress={() => void commit(limit)}
        >
          {saving ? <Spinner size="sm" color="default" /> : <Button.Label>Save budget</Button.Label>}
        </Button>
        {existing ? (
          <Button variant="ghost" className="mt-2" isDisabled={saving} onPress={() => void commit(null)}>
            <Button.Label className="text-negative">Remove budget</Button.Label>
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}
