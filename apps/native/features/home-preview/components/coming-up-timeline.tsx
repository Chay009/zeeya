import { PressableFeedback } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useCardElevation } from "@/components/ui/elevation";
import { moneyLabel } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import { LogoStack } from "@/features/insights/components/kpi-visuals";
import { fromMinorUnits } from "@/lib/currency";
import type { HomeHighlights } from "@/lib/dashboard-data";
import { moneyFontFamily } from "@/lib/fonts";
import type { BillDue } from "@/lib/message-insights";

import type { PreviewSub } from "../data";
import { BillsWeekStrip } from "./bills-week-strip";

// "Coming up": what's about to be paid, in two equal columns — BILLS (EMIs,
// premiums and bills the bank or biller confirmed by message) and
// SUBSCRIPTIONS (recurring charges found in past payments) — under the
// week's strip of due days. Overdue bills raise a banner on top.

const DAY_MS = 24 * 60 * 60 * 1000;
const COLUMN_ROWS = 2;

export interface TimelineEntry {
  key: string;
  name: string;
  /** Local ms of the due day; null when the message's date couldn't be read. */
  at: number | null;
  dueLabel: string | null;
  kind: "bill" | "emi" | "insurance" | "subscription";
  /** Major units; null when unknown. */
  amount: number | null;
  estimated: boolean;
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function daysFromToday(at: number): number {
  const day = new Date(at);
  return Math.round(
    (new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - startOfToday()) /
      DAY_MS,
  );
}

function countdown(entry: TimelineEntry): string {
  if (entry.at === null) return entry.dueLabel ? `Due ${entry.dueLabel}` : "Date unclear";
  const days = daysFromToday(entry.at);
  if (days < -1) return `Overdue ${-days}d`;
  if (days === -1) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function buildTimeline(
  highlights: HomeHighlights,
  bills: readonly BillDue[],
): TimelineEntry[] {
  const confirmed: TimelineEntry[] = bills
    .filter((bill) => bill.currency === highlights.currency)
    .map((bill) => ({
      key: `bill:${bill.key}`,
      name: bill.name,
      at: bill.dueAt,
      dueLabel: bill.dueLabel,
      kind: bill.kind,
      amount: bill.amount,
      estimated: false,
    }));
  const estimated: TimelineEntry[] = highlights.upcomingPayments.map((payment) => ({
    key: `sub:${payment.id}`,
    name: payment.merchant,
    at: payment.expectedAt,
    dueLabel: null,
    kind: "subscription",
    amount: fromMinorUnits(payment.amountMinorUnits, payment.currency),
    estimated: true,
  }));
  // Dateless bills go last: still owed, but nothing to order them by.
  return [...confirmed, ...estimated].sort(
    (a, b) => (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER),
  );
}

const bigStyle = {
  fontFamily: moneyFontFamily("semibold"),
  fontSize: 22,
  lineHeight: 28,
  letterSpacing: -0.4,
} as const;

/** One column: a titled card with a big figure and its next items. */
function Column({
  icon,
  title,
  figure,
  caption,
  children,
  onPress,
  accessibilityLabel,
}: {
  icon: AppIconName;
  title: string;
  figure: string;
  caption: string;
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="min-w-0 flex-1 rounded-card bg-card p-4"
      style={[{ borderCurve: "continuous" }, elevation]}
    >
      <View className="flex-row items-center gap-2">
        <View
          className="h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: colors.fill }}
        >
          <AppIcon name={icon} size={15} color={colors.ink} />
        </View>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-caption font-semibold text-ink">
          {title}
        </Text>
        <AppIcon name="chevron-right" size={14} color={colors.faint} />
      </View>
      <Text numberOfLines={1} className="mt-3 text-ink" style={bigStyle}>
        {figure}
      </Text>
      <Text numberOfLines={1} className="text-meta text-muted">
        {caption}
      </Text>
      <View className="mt-3 gap-2.5">{children}</View>
    </PressableFeedback>
  );
}

function ColumnRow({ entry, currency }: { entry: TimelineEntry; currency: string }) {
  const colors = useThemeColors();
  const overdue = entry.at !== null && daysFromToday(entry.at) < 0;
  return (
    <View>
      <Text numberOfLines={1} className="text-caption font-medium text-ink">
        {entry.name}
      </Text>
      <Text
        numberOfLines={1}
        className="text-meta"
        style={{ color: overdue ? colors.negative : colors.muted }}
      >
        {countdown(entry)}
        {entry.amount !== null ? ` · ${moneyLabel(entry.amount, currency)}` : ""}
      </Text>
    </View>
  );
}

export function ComingUpTimeline({
  highlights,
  bills,
  subscriptionPreviewItems,
  onOpenUpcoming,
  onOpenSubscriptions,
}: {
  highlights: HomeHighlights;
  bills: readonly BillDue[];
  subscriptionPreviewItems: readonly PreviewSub[];
  onOpenUpcoming: () => void;
  onOpenSubscriptions: () => void;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  const currency = highlights.currency;
  const entries = buildTimeline(highlights, bills);
  const billEntries = entries.filter((entry) => !entry.estimated);
  const subEntries = entries.filter((entry) => entry.estimated);
  const overdue = billEntries.filter((entry) => entry.at !== null && daysFromToday(entry.at) < 0);
  const billTotal = billEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const subscriptions = highlights.subscriptions;
  const logoNames = subscriptionPreviewItems
    .filter((item) => item.currency === currency)
    .map((item) => item.name);

  return (
    <Section title="Coming up" actionLabel="See all" onAction={onOpenUpcoming}>
      {overdue.length > 0 ? (
        <View
          accessible
          accessibilityRole="alert"
          className="mb-3 flex-row items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{ backgroundColor: withAlpha(colors.negative, colors.isDark ? 0.18 : 0.1) }}
        >
          <AppIcon name="alert" size={16} color={colors.negative} />
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-caption font-semibold text-negative"
          >
            {overdue.length === 1
              ? `${overdue[0]!.name} is overdue`
              : `${overdue.length} bills overdue`}
          </Text>
        </View>
      ) : null}

      {/* The week at a glance: which days something falls due. */}
      <View className="rounded-card bg-card p-4" style={[{ borderCurve: "continuous" }, elevation]}>
        <BillsWeekStrip
          items={entries.flatMap((entry) =>
            entry.at === null ? [] : [{ key: entry.key, name: entry.name, at: entry.at }],
          )}
          today={Date.now()}
        />
      </View>

      {/* Two equal columns: bills | subscriptions. */}
      <View className="mt-3 flex-row items-stretch gap-3">
        <Column
          icon="receipt"
          title="Bills"
          figure={billEntries.length > 0 ? moneyLabel(billTotal, currency) : "All clear"}
          caption={
            billEntries.length > 0
              ? `${billEntries.length} ${billEntries.length === 1 ? "bill" : "bills"} due`
              : "No bills due"
          }
          onPress={onOpenUpcoming}
          accessibilityLabel={`Bills, ${billEntries.length} due`}
        >
          {billEntries.length > 0 ? (
            billEntries
              .slice(0, COLUMN_ROWS)
              .map((entry) => <ColumnRow key={entry.key} entry={entry} currency={currency} />)
          ) : (
            <Text className="text-meta text-muted">Bills from your bank messages show here.</Text>
          )}
        </Column>

        <Column
          icon="repeat"
          title="Subscriptions"
          figure={
            subscriptions.activeCount > 0
              ? `${moneyLabel(fromMinorUnits(subscriptions.expectedMonthlyMinorUnits, currency), currency)}/mo`
              : "None yet"
          }
          caption={
            subscriptions.activeCount > 0
              ? `${subscriptions.activeCount} active`
              : "Found from repeat payments"
          }
          onPress={onOpenSubscriptions}
          accessibilityLabel={`Subscriptions, ${subscriptions.activeCount} active`}
        >
          {logoNames.length > 0 ? (
            <LogoStack
              names={logoNames}
              more={Math.max(0, subscriptions.activeCount - Math.min(4, logoNames.length))}
            />
          ) : null}
          {subEntries[0] ? <ColumnRow entry={subEntries[0]} currency={currency} /> : null}
        </Column>
      </View>
    </Section>
  );
}
