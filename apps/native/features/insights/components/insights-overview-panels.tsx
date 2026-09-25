import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { GlassSurface } from "@/components/native-ui/glass-surface";
import { formatMoney } from "@/features/dashboard/utils/format";
import { fromMinorUnits } from "@/lib/currency";

import type { InsightsPresentation } from "../insights-presentation";
import { hp } from "../../home-preview/theme";

const PANEL_STYLE = {
  marginTop: 14,
  borderRadius: 24,
  borderColor: hp.border,
  padding: 18,
} as const;

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassSurface effectStyle="clear" elevated accessibilityLabel={title} style={PANEL_STYLE}>
      <Text style={{ fontSize: 17, fontWeight: "800", color: hp.ink }}>{title}</Text>
      {subtitle && <Text style={{ marginTop: 4, fontSize: 12, color: hp.muted }}>{subtitle}</Text>}
      {children}
    </GlassSurface>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 8 }}>
      <View
        style={{
          width: 42,
          height: 42,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 21,
          backgroundColor: hp.surfaceMuted,
        }}
      >
        <AppIcon name="sparkles" size={20} color={hp.muted} />
      </View>
      <Text style={{ marginTop: 10, fontSize: 14, fontWeight: "800", color: hp.ink }}>{title}</Text>
      <Text
        style={{ marginTop: 4, fontSize: 12, lineHeight: 18, textAlign: "center", color: hp.muted }}
      >
        {body}
      </Text>
    </View>
  );
}

function changeLabel(percent: number | null): string {
  if (percent === null) return "No prior month data";
  if (percent === 0) return "No change vs last month";
  return `${percent > 0 ? "+" : ""}${percent}% vs last month`;
}

function changeColor(percent: number | null): string {
  if (percent === null || percent === 0) return hp.muted;
  return percent > 0 ? hp.coral : hp.positive;
}

function AmountPair({
  current,
  previous,
  currency,
}: {
  current: number;
  previous: number;
  currency: string;
}) {
  return (
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ fontSize: 16, fontWeight: "800", color: hp.ink }}
      >
        {formatMoney(fromMinorUnits(current, currency), currency)}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ fontSize: 11, color: hp.muted }}
      >
        {formatMoney(fromMinorUnits(previous, currency), currency)} last month
      </Text>
    </View>
  );
}

export function InsightsMonthTotalsPanel({ data }: { data: InsightsPresentation }) {
  const current = data.currentMonth;
  const previous = data.previousMonth;
  const rows = [
    ["Income", current.incomeMinorUnits, previous.incomeMinorUnits],
    ["Spending", current.spendingMinorUnits, previous.spendingMinorUnits],
    ["Net", current.netMinorUnits, previous.netMinorUnits],
  ] as const;

  return (
    <Panel
      title="This month"
      subtitle={`${current.transactionCount} captured transaction${current.transactionCount === 1 ? "" : "s"} · ${changeLabel(data.spendingChangePercent)}`}
    >
      <View style={{ marginTop: 14, gap: 2 }}>
        {rows.map(([label, currentValue, previousValue], index) => (
          <View
            key={label}
            style={{
              minHeight: 54,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: hp.divider,
            }}
          >
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: hp.ink }}>{label}</Text>
              <Text style={{ marginTop: 2, fontSize: 11, color: hp.muted }}>
                Current · previous
              </Text>
            </View>
            <AmountPair current={currentValue} previous={previousValue} currency={data.currency} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

export function InsightsCategoriesPanel({ data }: { data: InsightsPresentation }) {
  return (
    <Panel title="Top categories" subtitle="Current month compared with the previous month">
      {data.topCategories.length === 0 ? (
        <EmptyPanel
          title="No category data yet"
          body="Category comparisons appear after captured expenses are available."
        />
      ) : (
        <View style={{ marginTop: 12, gap: 2 }}>
          {data.topCategories.map((category, index) => (
            <View
              key={category.category}
              style={{
                minHeight: 62,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: hp.divider,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 17,
                  backgroundColor: hp.accentSoft,
                }}
              >
                <AppIcon name="pie-chart" size={17} color={hp.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: hp.ink }}>
                  {category.category}
                </Text>
                <Text
                  style={{ marginTop: 3, fontSize: 11, color: changeColor(category.changePercent) }}
                >
                  {changeLabel(category.changePercent)}
                </Text>
              </View>
              <AmountPair
                current={category.currentMinorUnits}
                previous={category.previousMinorUnits}
                currency={data.currency}
              />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

export function InsightsSubscriptionsPanel({ data }: { data: InsightsPresentation }) {
  const subscriptions = data.subscriptions;
  return (
    <Panel
      title="Committed subscriptions"
      subtitle={`${subscriptions.likelyCount} likely · ${subscriptions.activeCount} active or possible`}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ marginTop: 12, fontSize: 26, fontWeight: "800", color: hp.ink }}
      >
        {formatMoney(
          fromMinorUnits(subscriptions.monthlyCommittedMinorUnits, data.currency),
          data.currency,
        )}
      </Text>
      <Text style={{ marginTop: 3, fontSize: 12, color: hp.muted }}>
        Monthly total for likely recurring charges
      </Text>

      {subscriptions.top.length === 0 ? (
        <EmptyPanel
          title="No recurring charges yet"
          body="Subscription candidates appear after repeated captured charges."
        />
      ) : (
        <View style={{ marginTop: 14, gap: 2 }}>
          {subscriptions.top.map((subscription, index) => (
            <View
              key={subscription.id}
              style={{
                minHeight: 54,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: hp.divider,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: hp.ink }}>
                  {subscription.merchant}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 11, color: hp.muted }}>
                  {subscription.confidence === "likely" ? "Likely recurring" : "Possible recurring"}{" "}
                  · {subscription.count} charge{subscription.count === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "800", color: hp.ink }}>
                {formatMoney(
                  fromMinorUnits(subscription.amountMinorUnits, data.currency),
                  data.currency,
                )}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

export function InsightsVendorsPanel({ data }: { data: InsightsPresentation }) {
  return (
    <Panel title="Top vendors" subtitle="Ranked by current-month captured spend">
      {data.topVendors.length === 0 ? (
        <EmptyPanel
          title="No vendor data yet"
          body="Vendor comparisons appear when captured expenses include a merchant."
        />
      ) : (
        <View style={{ marginTop: 12, gap: 2 }}>
          {data.topVendors.map((vendor, index) => (
            <View
              key={`${vendor.vendor}:${index}`}
              style={{
                minHeight: 58,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: hp.divider,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "800", color: hp.ink }}>
                  {vendor.vendor}
                </Text>
                <Text
                  style={{ marginTop: 3, fontSize: 11, color: changeColor(vendor.changePercent) }}
                >
                  {changeLabel(vendor.changePercent)} · {vendor.transactionCount} transaction
                  {vendor.transactionCount === 1 ? "" : "s"}
                </Text>
              </View>
              <AmountPair
                current={vendor.currentMinorUnits}
                previous={vendor.previousMinorUnits}
                currency={data.currency}
              />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

export function InsightsBudgetPanel({ data }: { data: InsightsPresentation }) {
  const budget = data.budget;
  if (budget === null) return null;

  return (
    <Panel title="Budget performance" subtitle="Based on the configured daily budget">
      <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 11, color: hp.muted }}>Adherence</Text>
          <Text style={{ marginTop: 3, fontSize: 24, fontWeight: "800", color: hp.ink }}>
            {budget.adherenceScore}%
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 11, color: hp.muted }}>Projected month</Text>
          <Text style={{ marginTop: 3, fontSize: 16, fontWeight: "800", color: hp.ink }}>
            {formatMoney(
              fromMinorUnits(budget.projectedMonthSpendMinorUnits, data.currency),
              data.currency,
            )}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 14,
          height: 8,
          overflow: "hidden",
          borderRadius: 4,
          backgroundColor: hp.track,
        }}
      >
        <View
          style={{
            width: `${Math.min(100, Math.max(0, budget.usedPercent))}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: hp.accent,
          }}
        />
      </View>
      <Text style={{ marginTop: 7, fontSize: 12, color: hp.muted }}>
        {formatMoney(
          fromMinorUnits(budget.currentMonthSpentMinorUnits, data.currency),
          data.currency,
        )}{" "}
        of{" "}
        {formatMoney(
          fromMinorUnits(budget.currentMonthBudgetMinorUnits, data.currency),
          data.currency,
        )}{" "}
        used · {budget.daysOverBudget} day{budget.daysOverBudget === 1 ? "" : "s"} over budget
      </Text>
    </Panel>
  );
}

export function InsightsOverviewPanels({
  data,
  includeTotals = true,
  includeBudget = true,
}: {
  data: InsightsPresentation;
  /** The historical chart summary can own this slot while these panels add the bounded rows. */
  includeTotals?: boolean;
  includeBudget?: boolean;
}) {
  return (
    <>
      {includeTotals && <InsightsMonthTotalsPanel data={data} />}
      <InsightsCategoriesPanel data={data} />
      <InsightsSubscriptionsPanel data={data} />
      <InsightsVendorsPanel data={data} />
      {includeBudget && data.budget !== null && <InsightsBudgetPanel data={data} />}
    </>
  );
}
