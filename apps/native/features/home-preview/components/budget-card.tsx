import { PressableFeedback } from "heroui-native";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { Art } from "@/components/art/art";
import { AppIcon } from "@/components/icon";
import { StripedProgress } from "@/components/ui/striped-progress";
import { useCardElevation } from "@/components/ui/elevation";
import { useThemeColors } from "@/components/ui/theme";
import { moneyFontFamily } from "@/lib/fonts";

// Budget on Home is one glanceable line of truth: spent vs limit, a bar,
// and what's left. Tapping opens the Budget view in Analytics.

// The jar art is square with the jar centred in it (71.5% of its width), so
// the text indent is derived from where its visible right edge lands: the
// square starts JAR_LEFT from the card edge, the jar shows from 14.25% in.
const JAR_SIZE = 92;
const JAR_LEFT = -12;
// Clear of the card's top edge, so the lid isn't pressed against it.
const JAR_TOP = 12;
const CARD_PADDING = 20;
const TEXT_INDENT = Math.round(JAR_LEFT + JAR_SIZE * (1 - 0.1425) - CARD_PADDING + 10);

export function BudgetCard({
  monthLabel,
  spent,
  limit,
  usedPercent,
  remaining,
  status,
  statusTone = "warning",
  onOpen,
}: {
  monthLabel: string;
  spent: string;
  limit: string | null;
  usedPercent: number | null;
  remaining: string | null;
  /** Replaces "On pace this month", e.g. "1 over budget". */
  status?: string | null;
  /** "negative" when something is over budget, "warning" when only nearing. */
  statusTone?: "warning" | "negative";
  onOpen?: () => void;
}) {
  const colors = useThemeColors();
  const washId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const elevation = useCardElevation();
  const hasBudget = limit !== null && usedPercent !== null;
  const used = hasBudget ? usedPercent / 100 : 0;
  const barColor = used >= 1 ? colors.negative : used > 0.85 ? colors.warning : colors.chartLine;

  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel="Open budget"
      onPress={onOpen}
      isDisabled={!onOpen}
      className="overflow-hidden rounded-card bg-card p-5"
      style={elevation}
    >
      {/* A lime wash from the left that fades out by the middle — the jar
          stands on light, not in a box. */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${washId}wash`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={colors.isDark ? 0.14 : 0.24} />
            <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${washId}wash)`} />
      </Svg>
      {/* The jar is the card's hero: big, bleeding off the card's left edge
          (the card clips it), drawn before the bar so the bar passes in
          front of its base. */}
      <View pointerEvents="none" style={{ position: "absolute", left: JAR_LEFT, top: JAR_TOP }}>
        <Art
          name="hero-jar"
          size={JAR_SIZE}
          fallback={
            <View
              className="items-center justify-center"
              style={{ width: JAR_SIZE, height: JAR_SIZE }}
            >
              <AppIcon name="pie-chart" size={28} color={colors.accentDeep} />
            </View>
          }
        />
      </View>
      <PressableFeedback.Highlight />
      <View className="flex-row items-center" style={{ marginLeft: TEXT_INDENT }}>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1">
            <Text numberOfLines={1} className="text-caption font-semibold text-muted">
              {monthLabel || "This month"}
            </Text>
            <AppIcon name="chevron-right" size={14} color={colors.faint} />
          </View>
          <View className="mt-2 flex-row items-baseline gap-1.5">
            <Text
              numberOfLines={1}
              className="text-ink"
              style={{
                fontFamily: moneyFontFamily("semibold"),
                fontSize: 20,
                lineHeight: 26,
                letterSpacing: -0.4,
              }}
            >
              {spent}
            </Text>
            {hasBudget ? (
              <Text numberOfLines={1} className="text-caption text-muted">
                of {limit}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {hasBudget ? (
        <>
          <StripedProgress
            value={used}
            color={barColor}
            label={`${usedPercent}% USED`}
            className="mt-4"
          />
          <View className="mt-2.5 flex-row justify-between">
            <Text
              className={`text-meta ${status ? `font-medium ${statusTone === "negative" ? "text-negative" : "text-warning"}` : "text-muted"}`}
            >
              {status ?? "On pace this month"}
            </Text>
            <Text
              className={`text-meta font-medium ${used >= 1 ? "text-negative" : "text-ink-soft"}`}
            >
              {used >= 1 ? "Over budget" : remaining ? `${remaining} left` : "On track"}
            </Text>
          </View>
        </>
      ) : (
        // Indented like the amount above it — the jar stands to its left.
        <Text className="mt-2 text-caption text-muted" style={{ marginLeft: TEXT_INDENT }}>
          Spent so far · set category budgets to track pace
        </Text>
      )}
    </PressableFeedback>
  );
}
