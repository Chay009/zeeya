import { PressableFeedback } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { Art } from "@/components/art/art";
import { ProgressRing } from "@/components/charts/progress-ring";
import { ShareBar } from "@/components/charts/share-bar";
import { Card } from "@/components/ui/card";
import { AppIcon, type AppIconName } from "@/components/icon";
import { moneyLabel } from "@/components/ui/money";
import { ErrorState } from "@/components/ui/states";
import { useThemeColors, withAlpha } from "@/components/ui/theme";
import type { Investment, MessageInsights, PlaceSpend } from "@/lib/message-insights";
import { moneyFontFamily } from "@/lib/fonts";

import { RankBar } from "./analytics-overview";

// What the parser reads beyond the transaction basics (bills due live in
// Home's Coming up): Analytics' one secondary section — how you paid, card
// credit, cashback, funds and places. Every block renders only when the
// user's messages carry its data.

const moneyStyle = {
  fontFamily: moneyFontFamily("semibold"),
  fontSize: 15,
  lineHeight: 20,
  letterSpacing: -0.2,
} as const;

// Neutral by design: a grey field and an ink icon, whatever the row — colour
// is kept for data and brand logos. `color` stays for call-site compatibility.
function IconBadge({ icon }: { icon: AppIconName; color?: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-xl"
      style={{ backgroundColor: colors.fill, borderCurve: "continuous" }}
    >
      <AppIcon name={icon} size={18} color={colors.ink} />
    </View>
  );
}

// ── Analytics: how you paid, cards, cashback, funds, places ─────────────────

function Legend({
  items,
  currency,
}: {
  items: readonly { label: string; value: number; color: string }[];
  currency: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <View className="mt-3 gap-2">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-2">
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <Text className="flex-1 text-caption text-ink-soft">{item.label}</Text>
          <Text className="w-10 text-right text-caption text-muted">
            {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "—"}
          </Text>
          <Text className="w-24 text-right text-ink" style={moneyStyle}>
            {moneyLabel(item.value, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function percentOf(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "—";
}

function usePaymentMix(insights: MessageInsights) {
  const colors = useThemeColors();
  const { paymentMix, onlineMix } = insights;
  const paid = [
    // Distinct, readable colours (not shades of one): indigo, amber, grey.
    { label: "UPI", value: paymentMix.upi, color: colors.chart[0] ?? colors.ink },
    { label: "Card", value: paymentMix.card, color: colors.chart[2] ?? colors.ink },
    { label: "Other", value: paymentMix.other, color: colors.chart[5] ?? colors.muted },
  ].filter((item) => item.value > 0);
  const where = [
    { label: "Online", value: onlineMix.online, color: colors.chart[1] ?? colors.ink },
    { label: "In store", value: onlineMix.offline, color: colors.chart[3] ?? colors.ink },
    // The message named no brand or place: shown, not guessed into a side.
    { label: "Can't tell", value: onlineMix.unknown, color: colors.fillStrong },
  ].filter((item) => item.value > 0);
  return { paid, where };
}

/** One line of the section: what, a detail, then a value or a chevron. */
function FactRow({
  icon,
  title,
  detail,
  value,
  valueColor,
  onPress,
  divider,
}: {
  icon: AppIconName;
  title: string;
  detail: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  divider: boolean;
}) {
  const colors = useThemeColors();
  return (
    <PressableFeedback
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}, ${detail}${value ? `, ${value}` : ""}`}
      onPress={onPress}
      isDisabled={!onPress}
      className="flex-row items-center gap-3 py-3"
      style={divider ? { borderTopWidth: 1, borderTopColor: colors.divider } : undefined}
    >
      <IconBadge icon={icon} color={colors.accentDeep} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-meta text-muted">
          {detail}
        </Text>
      </View>
      {value ? (
        <Text numberOfLines={1} style={[moneyStyle, { color: valueColor ?? colors.ink }]}>
          {value}
        </Text>
      ) : null}
      {onPress ? <AppIcon name="chevron-right" size={16} color={colors.faint} /> : null}
    </PressableFeedback>
  );
}

/**
 * Analytics' secondary band: what the parser read beyond the transaction
 * basics — how you paid (one stacked bar, with how many payments it covers),
 * online vs in store, each card's credit, cashback, funds and the top place.
 * One quiet card, so it never competes with the spending story above it.
 */
export function MessageInsightsSection({
  insights,
  status,
  onRetry,
  currency,
  onOpenOnlineMix,
  onOpenInvestments,
  onOpenPlaces,
}: {
  insights: MessageInsights;
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  currency: string;
  onOpenOnlineMix: () => void;
  onOpenInvestments: () => void;
  onOpenPlaces: () => void;
}) {
  // It sits directly on Analytics' sheet: rows and hairlines, no box.
  const { paid, where } = usePaymentMix(insights);
  const paidTotal = paid.reduce((sum, item) => sum + item.value, 0);
  const whereTotal = where.reduce((sum, item) => sum + item.value, 0);
  const { creditCards, paymentMix, cashback, investments, places } = insights;

  if (status === "error") {
    return (
      <Card title="From your messages">
        <ErrorState
          compact
          body="Couldn't read the details from your messages."
          onRetry={onRetry}
        />
      </Card>
    );
  }

  type Row = Omit<Parameters<typeof FactRow>[0], "divider"> & { key: string };
  const rows: Row[] = [];
  if (where.length > 1) {
    rows.push({
      key: "online",
      icon: "bag",
      title: "Online vs in store",
      detail: where.map((item) => `${item.label} ${percentOf(item.value, whereTotal)}`).join(" · "),
      onPress: onOpenOnlineMix,
    });
  }
  // No utilisation: the bank's SMS gives the available limit, not the total
  // limit or the outstanding, so any "used" share would be invented.
  for (const card of creditCards) {
    rows.push({
      key: `card:${card.key}`,
      icon: "card",
      title: `${card.bank}${card.last4 ? ` ••${card.last4}` : ""}`,
      detail: `Credit available · as of ${shortDate(card.asOf)}`,
      value: moneyLabel(card.availableLimit, currency),
    });
  }
  if (cashback.total > 0) {
    rows.push({
      key: "cashback",
      icon: "sparkles",
      title: "Cashback",
      detail: `${cashback.count} ${cashback.count === 1 ? "reward" : "rewards"} this month`,
      value: `+${moneyLabel(cashback.total, currency)}`,
    });
  }
  if (investments[0]) {
    rows.push({
      key: "investments",
      icon: "trend-up",
      title: "Investments",
      detail: `${investments.length} ${investments.length === 1 ? "fund" : "funds"} · NAV as of ${shortDate(investments[0].asOf)}`,
      onPress: onOpenInvestments,
    });
  }
  if (places[0]) {
    rows.push({
      key: "places",
      icon: "home",
      title: "Where you spend",
      detail: `${places[0].place} leads · ${moneyLabel(places[0].amount, currency)}`,
      onPress: onOpenPlaces,
    });
  }
  if (paid.length === 0 && rows.length === 0) return null;

  return (
    <Card title="From your messages">
      {paid.length > 0 ? (
        <View
          accessible
          accessibilityLabel={`How you paid: ${paid.map((item) => `${item.label} ${percentOf(item.value, paidTotal)}`).join(", ")}`}
          className="pb-3"
        >
          <View className="flex-row items-baseline justify-between">
            <Text className="text-body font-medium text-ink">How you paid</Text>
            <Text className="text-meta text-muted">
              {paymentMix.count} {paymentMix.count === 1 ? "payment" : "payments"} read
            </Text>
          </View>
          {/* One ring per method, each in its own colour, % inside. */}
          <View className="mt-3 flex-row justify-around">
            {paid.map((item) => (
              <View key={item.label} className="items-center">
                <ProgressRing
                  fraction={paidTotal > 0 ? item.value / paidTotal : 0}
                  color={item.color}
                  size={58}
                  stroke={5}
                  showPercent
                />
                <Text className="mt-1.5 text-caption font-medium text-ink">{item.label}</Text>
                <Text className="text-meta text-muted">{moneyLabel(item.value, currency)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {rows.map(({ key, ...row }, index) => (
        <FactRow key={key} {...row} divider={index > 0 || paid.length > 0} />
      ))}
    </Card>
  );
}

/** The "Online vs in store" sheet: the split with amounts, and what each side means. */
export function OnlineMixSheetContent({
  insights,
  currency,
}: {
  insights: MessageInsights;
  currency: string;
}) {
  const { where } = usePaymentMix(insights);
  return (
    <View className="px-5 pb-8">
      <ShareBar
        height={12}
        segments={where.map((item) => ({ key: item.label, value: item.value, color: item.color }))}
      />
      <Legend items={where} currency={currency} />
      <Text className="mt-5 text-meta text-muted">
        Online means a known online brand. In store means a known shop or a card swipe with a
        location. Can't tell: the message named neither.
      </Text>
    </View>
  );
}

/** The investments sheet: each fund's latest NAV and folio. */
export function InvestmentList({ investments }: { investments: readonly Investment[] }) {
  const colors = useThemeColors();
  return (
    <View className="px-5 pb-8">
      {investments.map((fund) => (
        <View key={fund.key} className="flex-row items-center gap-3 py-3">
          <Art
            name="cat-invest"
            size={36}
            fallback={<IconBadge icon="trend-up" color={colors.accentDeep} />}
          />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-body font-semibold text-ink">
              {fund.name}
            </Text>
            <Text numberOfLines={1} className="text-meta text-muted">
              {fund.folio ? `Folio ${fund.folio} · ` : ""}
              {shortDate(fund.asOf)}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-ink" style={moneyStyle}>
              {fund.nav.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </Text>
            <Text className="text-meta text-muted">NAV</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The places sheet: where this month's money went, ranked against the top place. */
export function PlaceList({
  places,
  currency,
}: {
  places: readonly PlaceSpend[];
  currency: string;
}) {
  const colors = useThemeColors();
  const top = Math.max(1, ...places.map((place) => place.amount));
  return (
    <View className="px-5 pb-8">
      {places.map((place, index) => (
        <View
          key={place.place}
          accessible
          accessibilityLabel={`${place.place}, ${moneyLabel(place.amount, currency)}, ${place.count} payments`}
          className="py-3"
        >
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-body font-semibold text-ink">
              {place.place}
            </Text>
            <Text className="text-ink" style={moneyStyle}>
              {moneyLabel(place.amount, currency)}
            </Text>
          </View>
          <View className="mt-2">
            <RankBar
              fraction={place.amount / top}
              color={index === 0 ? colors.accentDeep : withAlpha(colors.accentDeep, 0.45)}
              height={6}
            />
          </View>
          <Text className="mt-1 text-meta text-muted">
            {place.count} {place.count === 1 ? "payment" : "payments"}
          </Text>
        </View>
      ))}
    </View>
  );
}
