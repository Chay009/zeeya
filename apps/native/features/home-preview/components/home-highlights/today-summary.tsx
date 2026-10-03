import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { CaughtUpTick } from "@/components/art/caught-up-tick";
import { AppIcon } from "@/components/icon";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { MoneyText } from "@/components/native-ui/money-text";
import { LimeActionPill } from "@/components/native-ui/selected-pill";
import { EmptyState } from "@/components/ui/states";
import { useCardElevation } from "@/components/ui/elevation";
import { useThemeColors } from "@/components/ui/theme";
import type { HomeHighlights, TransactionSummary } from "@/lib/dashboard-data";

import { merchantVisual } from "../../data";
import { BrandLogo } from "../brand-logo";
import { amount, signedNet } from "./shared";

// Today at a glance: one card — the day's net large, money in and out beside
// it, the latest three payments, "See all N", and today's largest payment
// called out on a lime wash (inline when it's among the three, as its own
// row when it isn't). A quiet day shows the caught-up tick.

const VISIBLE = 3;
const LOGO_SIZE = 40;

function transactionLabel(transaction: TransactionSummary): string {
  return transaction.brandName?.trim() || transaction.vendor?.trim() || transaction.category;
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function signedAmount(transaction: TransactionSummary, currency: string): string {
  const sign = transaction.direction === "income" ? "+" : "−";
  return `${sign}${amount(transaction.amountMinorUnits, currency)}`;
}

function hasTie(largest: TransactionSummary, recent: readonly TransactionSummary[]): boolean {
  return recent.some(
    (item) => item.id !== largest.id && item.amountMinorUnits === largest.amountMinorUnits,
  );
}

function TodayRow({
  transaction,
  currency,
  featured = false,
  tied = false,
  onPress,
}: {
  transaction: TransactionSummary;
  currency: string;
  featured?: boolean;
  tied?: boolean;
  onPress?: () => void;
}) {
  const name = transactionLabel(transaction);
  const visual = merchantVisual(
    transaction.brandName?.trim() || transaction.vendor?.trim() || "",
    transaction.category,
  );
  const income = transaction.direction === "income";
  const caption = featured ? (tied ? "Tied for largest" : "Largest today") : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${caption}: ${name}` : `View ${name}`}
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center gap-3 ${featured ? "rounded-2xl bg-accent-soft px-3 py-2.5" : ""}`}
      style={featured ? { borderCurve: "continuous" } : undefined}
    >
      <BrandLogo
        letter={name.charAt(0).toUpperCase() || "?"}
        tile={visual.tile}
        ink={visual.ink}
        img={visual.img}
        size={LOGO_SIZE}
        radius={14}
        iconRatio={0.7}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-semibold text-ink">
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          {caption ? (
            <Text className="text-meta font-semibold text-accent-deep">{caption}</Text>
          ) : null}
          <Text className="text-meta text-muted">
            {caption ? "· " : ""}
            {timeLabel(transaction.date)}
          </Text>
        </View>
      </View>
      <MoneyText
        weight="semibold"
        // Spending is ink; only income is coloured (global.css token rule).
        className={`shrink-0 text-body ${income ? "text-positive" : "text-ink"}`}
      >
        {signedAmount(transaction, currency)}
      </MoneyText>
    </Pressable>
  );
}

export function TodaySummary({
  data,
  onSeeActivity,
  onSelectTransaction,
}: {
  data: HomeHighlights;
  onSeeActivity?: () => void;
  onSelectTransaction?: (transactionId: string) => void;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation("raised");
  const today = data.today;
  const empty = today.transactionCount === 0 && today.recent.length === 0;
  const netClass =
    today.netMinorUnits > 0
      ? "text-positive"
      : today.netMinorUnits < 0
        ? "text-negative"
        : "text-ink";
  const recent = today.recent.slice(0, VISIBLE);
  const largest = today.largestTransaction;
  const largestInRecent = largest !== null && recent.some((item) => item.id === largest.id);
  const open = (id: string) => () => (onSelectTransaction ?? (() => onSeeActivity?.()))(id);

  return (
    <View
      className="mt-6 rounded-card bg-card px-4 pb-4 pt-5"
      style={[{ borderCurve: "continuous" }, elevation]}
    >
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-subtitle font-semibold text-ink">Today at a glance</Text>
        {onSeeActivity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See today's activity"
            onPress={onSeeActivity}
            hitSlop={10}
          >
            <AppIcon name="chevron-right" size={16} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {empty ? (
        <EmptyState
          compact
          visual={<CaughtUpTick size={88} />}
          title="Quiet day so far"
          body="Income, spending and today's biggest payment show up here as they happen."
        />
      ) : (
        <>
          <View className="mt-2 flex-row items-end justify-between px-1">
            <View className="flex-row items-baseline gap-1.5">
              <MoneyText
                weight="semibold"
                className={netClass}
                style={{ fontSize: 30, lineHeight: 36, letterSpacing: -0.8 }}
              >
                {signedNet(today.netMinorUnits, data.currency)}
              </MoneyText>
              <Text className="text-caption text-muted">net</Text>
            </View>
            <View className="items-end gap-0.5 pb-1">
              <Text className="text-caption font-medium text-positive">
                {amount(today.incomeMinorUnits, data.currency)} in
              </Text>
              <Text className="text-caption font-medium text-muted">
                {amount(today.spendingMinorUnits, data.currency)} out
              </Text>
            </View>
          </View>

          <View className="mt-4 gap-3">
            {recent.map((transaction, index) => {
              const featured =
                largest !== null && transaction.amountMinorUnits === largest.amountMinorUnits;
              return (
                <EnterTransition key={transaction.id} index={index + 1}>
                  <TodayRow
                    transaction={transaction}
                    currency={data.currency}
                    featured={featured}
                    tied={featured && largest !== null && hasTie(largest, recent)}
                    onPress={open(transaction.id)}
                  />
                </EnterTransition>
              );
            })}

            {today.transactionCount > VISIBLE && onSeeActivity ? (
              <LimeActionPill
                accessibilityLabel={`See all ${today.transactionCount} transactions`}
                onPress={onSeeActivity}
                className="mt-1 self-stretch justify-center py-3"
              >
                <Text className="text-caption font-semibold text-on-accent">
                  See all {today.transactionCount} ›
                </Text>
              </LimeActionPill>
            ) : null}

            {largest && !largestInRecent ? (
              <EnterTransition index={VISIBLE + 1}>
                <TodayRow
                  transaction={largest}
                  currency={data.currency}
                  featured
                  tied={hasTie(largest, recent)}
                  onPress={open(largest.id)}
                />
              </EnterTransition>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
