import { PressableFeedback } from "heroui-native";
import { useId, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { AppText as Text } from "@/components/app-text";
import { ProgressRing } from "@/components/charts/progress-ring";
import { CategoryTile } from "@/components/finance/category-tile";
import { GlowLogos } from "@/components/finance/glow-logos";
import { AppIcon } from "@/components/icon";
import { HeroAmount } from "@/components/ui/hero-amount";
import { moneyLabel } from "@/components/ui/money";
import { useCardElevation } from "@/components/ui/elevation";
import { useThemeColors } from "@/components/ui/theme";
import { BrandLogo } from "@/features/home-preview/components/brand-logo";
import { merchantVisual } from "@/features/home-preview/data";
import { fromMinorUnits } from "@/lib/currency";
import type {
  RankedSpendingComparison,
  SubscriptionSummary,
  VendorSpendingComparison,
} from "@/lib/dashboard-data";
import { moneyFontFamily } from "@/lib/fonts";

import { analyticsTrendChip } from "../analytics-trend";
import { categoryTint } from "../category-visual";
import type { SpendingPoint } from "../insights-data";

// The Analytics overview's building blocks (the design's screen 1): a summary
// card (the month's number, its shape, the top category and subscriptions),
// then list cards whose header lives inside the card, each opening a sheet.

/** "↑ 22%" / "↓ 8%" in the trend helper's colours (spending up = negative). */
function Change({ percent }: { percent: number | null }) {
  const chip = analyticsTrendChip(percent);
  if (!chip) return <Text className="text-meta text-faint">—</Text>;
  return <Text className={`text-meta font-semibold ${chip.className}`}>{chip.label}</Text>;
}

/** A small running-total line with a soft fill — the month's shape at a glance. */
/**
 * A smooth curve through the points (Catmull-Rom as cubic Béziers): the line
 * flows like a wave instead of breaking at every day.
 */
function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** The month's daily spending rhythm as a soft wave with a fading fill. */
function Sparkline({ series, color }: { series: readonly SpendingPoint[]; color: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const values = series.map((point) => Math.max(0, point.value));
  const max = Math.max(...values, 0);
  if (values.length < 2 || max <= 0) return null;
  // viewBox 0..100 × 0..40, stretched to the box — data-bound, no measuring.
  const points = values.map(
    (value, index) => [(index / (values.length - 1)) * 100, 37 - (value / max) * 32] as const,
  );
  const line = smoothPath(points);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${id}fill`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line} L100 40 L0 40 Z`} fill={`url(#${id}fill)`} />
      <Path
        d={line}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

export function merchantLogo(name: string, size: number) {
  const visual = merchantVisual(name, "");
  return (
    <BrandLogo
      letter={name.charAt(0).toUpperCase() || "?"}
      tile={visual.tile}
      ink={visual.ink}
      img={visual.img}
      size={size}
      radius={size * 0.3}
      iconRatio={0.62}
    />
  );
}

export function AnalyticsSummaryCard({
  verb,
  totalMinorUnits,
  currency,
  changePercent,
  series,
  topCategory,
  topCategoryShare,
  subscriptions,
  committedMonthlyMinorUnits,
  onOpenCategories,
  onOpenSubscriptions,
}: {
  /** "spent" / "earned". */
  verb: string;
  totalMinorUnits: number;
  currency: string;
  changePercent: number | null;
  series: readonly SpendingPoint[];
  topCategory: RankedSpendingComparison | null;
  /** 0..100 share of the month's spending. */
  topCategoryShare: number;
  subscriptions: readonly SubscriptionSummary[];
  committedMonthlyMinorUnits: number;
  onOpenCategories: () => void;
  onOpenSubscriptions: () => void;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation("raised");
  const chip = analyticsTrendChip(changePercent);
  const logos = subscriptions.slice(0, 3);
  const more = subscriptions.length - logos.length;
  return (
    <View className="rounded-card bg-card p-5" style={[{ borderCurve: "continuous" }, elevation]}>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <HeroAmount
            label={moneyLabel(fromMinorUnits(totalMinorUnits, currency), currency)}
            color={colors.ink}
            mutedColor={colors.muted}
            size={34}
          />
          <Text className="text-caption text-muted">{verb} this month</Text>
          {chip ? (
            <Text className={`mt-1 text-meta font-semibold ${chip.className}`}>
              {chip.label}
              <Text className="text-meta font-normal text-muted"> vs last month</Text>
            </Text>
          ) : null}
        </View>
        <View style={{ width: 128, height: 52 }}>
          {/* Warm coral (chart-4) — spend as energy, not alarm red. */}
          <Sparkline series={series} color={colors.chart[3] ?? colors.negative} />
        </View>
      </View>

      <View className="my-4 h-px" style={{ backgroundColor: colors.divider }} />

      <View className="flex-row gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open categories"
          onPress={onOpenCategories}
          className="min-w-0 flex-1"
        >
          <Text className="text-meta font-medium text-muted">Top category</Text>
          {topCategory ? (
            <View className="mt-2 flex-row items-center gap-2.5">
              <CategoryTile
                label={topCategory.category}
                color={categoryTint(topCategory.category)}
                size={40}
              />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-caption font-semibold text-ink">
                  {topCategory.category}
                </Text>
                <Text numberOfLines={1} className="text-meta text-muted">
                  {topCategoryShare}% of spending
                </Text>
              </View>
            </View>
          ) : (
            <Text className="mt-2 text-caption text-muted">Nothing yet</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open subscriptions"
          onPress={onOpenSubscriptions}
          className="min-w-0 flex-1"
        >
          <Text className="text-meta font-medium text-muted">Subscriptions</Text>
          {logos.length > 0 ? (
            <>
              <View className="mt-2 flex-row items-end gap-1.5">
                <GlowLogos
                  items={logos.map((item) => {
                    const visual = merchantVisual(item.merchant, "");
                    return {
                      key: item.id,
                      letter: item.merchant.charAt(0).toUpperCase() || "?",
                      tile: visual.tile,
                      ink: visual.ink,
                      img: visual.img,
                    };
                  })}
                  size={28}
                  tail={28}
                  step={5}
                />
                {more > 0 ? (
                  <View
                    className="h-[26px] items-center justify-center rounded-lg px-1.5"
                    style={{ backgroundColor: colors.fill }}
                  >
                    <Text className="text-meta font-semibold text-ink-soft">+{more}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} className="mt-1.5 text-meta text-muted">
                {moneyLabel(fromMinorUnits(committedMonthlyMinorUnits, currency), currency)} / month
                · {subscriptions.length} active
              </Text>
            </>
          ) : (
            <Text className="mt-2 text-caption text-muted">None detected yet</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** A list card whose header ("Categories" · "See all ›") sits inside it. */
export function OverviewListCard({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const elevation = useCardElevation();
  return (
    <View
      className="mt-4 overflow-hidden rounded-card bg-card px-5 pb-2 pt-4"
      style={[{ borderCurve: "continuous" }, elevation]}
    >
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-subtitle font-bold text-ink">{title}</Text>
        {onSeeAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all ${title.toLowerCase()}`}
            onPress={onSeeAll}
            hitSlop={10}
            className="flex-row items-center gap-0.5"
          >
            <Text className="text-caption font-semibold text-accent-deep">See all</Text>
            <AppIcon name="chevron-right" size={14} color={colors.accentDeep} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const amountStyle = {
  fontFamily: moneyFontFamily("semibold"),
  fontSize: 15,
  lineHeight: 20,
  letterSpacing: -0.2,
} as const;

export function ListRow({
  leading,
  title,
  subtitle,
  amount,
  share,
  shareWidth = 40,
  change,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string;
  amount: string;
  /** A narrow muted column after the amount ("32%", "12 txns"). */
  share?: string;
  shareWidth?: number;
  change?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}`}
      onPress={onPress}
      isDisabled={!onPress}
      className="-mx-2 flex-row items-center gap-3 rounded-2xl px-2 py-2.5"
    >
      {leading}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-meta text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} className="text-ink" style={amountStyle}>
        {amount}
      </Text>
      {share !== undefined ? (
        <Text className="text-right text-meta text-muted" style={{ width: shareWidth }}>
          {share}
        </Text>
      ) : null}
      {change !== undefined ? <View className="w-12 items-end">{change}</View> : null}
    </PressableFeedback>
  );
}

/** A horizontal bar on a faint track; `fraction` 0..1 of the track. */
export function RankBar({
  fraction,
  color,
  height = 8,
  track = true,
}: {
  fraction: number;
  color: string;
  height?: number;
  /** Draw the faint full-width track behind the fill. */
  track?: boolean;
}) {
  const colors = useThemeColors();
  const percent = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      className="w-full overflow-hidden rounded-pill"
      style={{ height, backgroundColor: track ? colors.fill : "transparent" }}
    >
      {/* True length: a small share stays small. */}
      <View
        className="h-full rounded-pill"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </View>
  );
}

/**
 * One "where it went" row (the reference design): icon · name with a bar
 * under it · amount with its share under it. The bar is measured against the
 * top row, so the leader reads full and the rest fall away; the % under the
 * amount gives the exact share of spending. The change vs last month sits
 * beside the name, small, only when there is one.
 */
/**
 * A distinct colour per rank (the chart palette: indigo, teal, amber, coral,
 * green), so the 1st category is the same colour in the ring and its row.
 * "Other" and anything past five is grey.
 */
export function rankColor(colors: ReturnType<typeof useThemeColors>, index: number): string {
  return index < 5 ? (colors.chart[index] ?? colors.muted) : (colors.chart[5] ?? colors.muted);
}

function ShareRow({
  leading,
  title,
  amount,
  share,
  changePercent,
  ringColor,
  subtitle,
  accessibilityLabel,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  amount: string;
  /** 0..100 share of the period's total; null when the total is unknown. */
  share: number | null;
  changePercent: number | null;
  ringColor: string;
  subtitle?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="-mx-2 flex-row items-center gap-3 rounded-2xl px-2 py-2.5"
    >
      {/* The share as a ring around the category's own mark — the space a
          bar would take, kept for the name. */}
      <ProgressRing fraction={(share ?? 0) / 100} color={ringColor} size={48} stroke={4}>
        {leading}
      </ProgressRing>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {title}
        </Text>
        {changePercent !== null ? (
          <View className="mt-0.5 flex-row items-center gap-1">
            <Change percent={changePercent} />
            <Text className="text-meta text-muted">vs last month</Text>
          </View>
        ) : null}
        {subtitle ? <Text className="mt-0.5 text-meta text-muted">{subtitle}</Text> : null}
      </View>
      <View className="min-w-[76px] items-end">
        <Text numberOfLines={1} className="text-ink" style={amountStyle}>
          {amount}
        </Text>
        <Text className="text-meta text-muted">
          {share !== null ? `${Math.round(share)}%` : "—"}
        </Text>
      </View>
    </PressableFeedback>
  );
}

/** Categories: one brand-green bar per row, the top category full length. */
export function CategoryChangeList({
  categories,
  totalMinorUnits,
  currency,
  onOpenCategory,
}: {
  categories: readonly RankedSpendingComparison[];
  totalMinorUnits: number;
  currency: string;
  onOpenCategory: (category: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <>
      {categories.map((row, index) => {
        const amount = moneyLabel(fromMinorUnits(row.currentMinorUnits, currency), currency);
        const previous = moneyLabel(fromMinorUnits(row.previousMinorUnits, currency), currency);
        const share = totalMinorUnits > 0 ? (row.currentMinorUnits / totalMinorUnits) * 100 : null;
        return (
          <ShareRow
            key={row.category}
            leading={<CategoryTile label={row.category} size={34} />}
            title={row.category}
            amount={amount}
            share={share}
            changePercent={row.changePercent}
            ringColor={rankColor(colors, index)}
            accessibilityLabel={`${row.category}, ${amount}${share !== null ? `, ${Math.round(share)}% of spending` : ""}, ${previous} at this point last month`}
            onPress={() => onOpenCategory(row.category)}
          />
        );
      })}
    </>
  );
}

/** Merchants: the same encoding as categories — bar = share of spending. */
export function VendorRankList({
  vendors,
  totalMinorUnits,
  currency,
  onOpenVendor,
  showCount = false,
}: {
  vendors: readonly VendorSpendingComparison[];
  totalMinorUnits: number;
  currency: string;
  onOpenVendor: (vendor: VendorSpendingComparison) => void;
  /** Adds the payment count under each bar (the sheet's fuller table). */
  showCount?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <>
      {vendors.map((row, index) => {
        const amount = moneyLabel(fromMinorUnits(row.currentMinorUnits, currency), currency);
        const share = totalMinorUnits > 0 ? (row.currentMinorUnits / totalMinorUnits) * 100 : null;
        return (
          <ShareRow
            key={row.identityKey ?? row.vendor}
            leading={merchantLogo(row.vendor, 32)}
            title={row.vendor}
            amount={amount}
            share={share}
            changePercent={row.changePercent}
            ringColor={rankColor(colors, index)}
            subtitle={
              showCount
                ? `${row.transactionCount} ${row.transactionCount === 1 ? "payment" : "payments"}`
                : undefined
            }
            accessibilityLabel={`${row.vendor}, ${amount}${share !== null ? `, ${Math.round(share)}% of spending` : ""}`}
            onPress={() => onOpenVendor(row)}
          />
        );
      })}
    </>
  );
}

export function RecentList({
  items,
}: {
  items: readonly {
    key: string;
    name: string;
    sub: string;
    date: number;
    amountLabel: string;
    logo: ReactNode;
    onPress: () => void;
  }[];
}) {
  return (
    <>
      {items.map((item) => (
        <ListRow
          key={item.key}
          leading={item.logo}
          title={item.name}
          subtitle={item.sub}
          amount={item.amountLabel}
          onPress={item.onPress}
        />
      ))}
    </>
  );
}
