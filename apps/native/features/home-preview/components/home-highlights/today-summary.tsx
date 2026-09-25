import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { EnterTransition } from "@/components/native-ui/enter-transition";
import { LimeActionPill } from "@/components/native-ui/selected-pill";
import { MoneyText } from "@/components/native-ui/money-text";
import { formatDate } from "@/features/dashboard/utils/format";
import type { HomeHighlights, TransactionSummary } from "@/lib/dashboard-data";
import { merchantVisual } from "../../data";
import { hp } from "../../theme";
import { BrandLogo } from "../brand-logo";
import { EmptyNote } from "../empty-note";
import { amount, signedNet } from "./shared";

const TODAY_LOGO_SIZE = 40;

function transactionLabel(transaction: TransactionSummary): string {
  return transaction.brandName?.trim() || transaction.vendor?.trim() || transaction.category;
}

function transactionLogo(transaction: TransactionSummary) {
  const name = transactionLabel(transaction);
  const visual = merchantVisual(
    transaction.brandName?.trim() || transaction.vendor?.trim() || "",
    transaction.category,
  );

  return (
    <BrandLogo
      letter={name.charAt(0).toUpperCase() || "?"}
      tile={visual.tile}
      ink={visual.ink}
      img={visual.img}
      size={TODAY_LOGO_SIZE}
      radius={14}
      iconRatio={0.7}
    />
  );
}

function formatSignedTransactionAmount(transaction: TransactionSummary, currency: string): string {
  const sign = transaction.direction === "income" ? "+" : "−";
  return `${sign}${amount(transaction.amountMinorUnits, currency)}`;
}

function hasLargestAmountTie(
  largest: TransactionSummary,
  recent: readonly TransactionSummary[],
): boolean {
  return recent.some(
    (item) => item.id !== largest.id && item.amountMinorUnits === largest.amountMinorUnits,
  );
}

function largestHighlightLabel(tied: boolean): string {
  return tied ? "Tied for largest" : "Largest today";
}

function LargestTodayCaption({ tied }: { tied: boolean }) {
  return (
    <Text className="shrink-0 text-label font-semibold text-accent-deep">
      {largestHighlightLabel(tied)}
    </Text>
  );
}

function TodayTransactionRow({
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
  const amountClass = transaction.direction === "income" ? "text-positive" : "text-coral";

  const row = (
    <View className="min-h-[40px] flex-row items-center gap-3">
      <View className="shrink-0">{transactionLogo(transaction)}</View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
          {name}
        </Text>
        {featured ? (
          <View className="mt-0.5 flex-row items-center gap-2">
            <LargestTodayCaption tied={tied} />
            <Text className="text-label text-muted">· {formatDate(transaction.date)}</Text>
          </View>
        ) : (
          <Text className="mt-0.5 text-label text-muted">{formatDate(transaction.date)}</Text>
        )}
      </View>
      <MoneyText
        weight="medium"
        className={`shrink-0 text-subtitle font-semibold ${featured ? "text-accent-deep" : amountClass}`}
      >
        {formatSignedTransactionAmount(transaction, currency)}
      </MoneyText>
    </View>
  );

  if (!onPress) return row;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        featured ? `${largestHighlightLabel(tied)}: ${name}` : `View ${name}`
      }
      onPress={onPress}
      className={featured ? "rounded-[11px] bg-accent-soft px-2.5 py-1.5" : undefined}
    >
      {row}
    </Pressable>
  );
}

function TodayLargestBanner({
  transaction,
  currency,
  tied,
  onPress,
}: {
  transaction: TransactionSummary;
  currency: string;
  tied: boolean;
  onPress: () => void;
}) {
  const name = transactionLabel(transaction);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${name}`}
      onPress={onPress}
      className="mt-4 rounded-[11px] bg-accent-soft px-2.5 py-1.5"
    >
      <View className="min-h-[40px] flex-row items-center gap-3">
        <View className="shrink-0">{transactionLogo(transaction)}</View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-subtitle font-semibold text-ink">
            {name}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <LargestTodayCaption tied={tied} />
            <Text className="text-label text-muted">· {formatDate(transaction.date)}</Text>
          </View>
        </View>
        <MoneyText
          weight="medium"
          className={`shrink-0 text-subtitle font-semibold ${
            transaction.direction === "income" ? "text-positive" : "text-accent-deep"
          }`}
        >
          {formatSignedTransactionAmount(transaction, currency)}
        </MoneyText>
      </View>
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
  const today = data.today;
  const empty = today.transactionCount === 0 && today.recent.length === 0;
  const netClass =
    today.netMinorUnits > 0
      ? "text-positive"
      : today.netMinorUnits < 0
        ? "text-coral"
        : "text-ink";

  return (
    <View className="mt-4 rounded-card bg-card px-4 py-5">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-[17px] font-semibold text-ink">Today at a glance</Text>
        {onSeeActivity ? (
          <Pressable accessibilityRole="button" accessibilityLabel="See today’s activity" onPress={onSeeActivity}>
            <AppIcon name="chevron-right" size={16} color={hp.faint} />
          </Pressable>
        ) : null}
      </View>
      {empty ? (
        <EmptyNote
          icon="sparkles"
          title="Quiet day so far"
          body="Income, spending, and today’s biggest transaction will show up here once a message is captured."
        />
      ) : (
        <>
          <View className="mt-2 flex-row items-end justify-between px-1">
            <View className="flex-row items-baseline gap-1.5">
              <MoneyText weight="semibold" className={`text-[32px] tracking-tight ${netClass}`}>
                {signedNet(today.netMinorUnits, data.currency)}
              </MoneyText>
              <Text className="text-caption text-muted">net</Text>
            </View>
            <View className="items-end gap-1">
              <Text className="text-caption text-positive">
                {amount(today.incomeMinorUnits, data.currency)} in
              </Text>
              <Text className="text-caption text-coral">
                {amount(today.spendingMinorUnits, data.currency)} out
              </Text>
            </View>
          </View>
          {today.recent.length > 0 && (() => {
            const recent = today.recent.slice(0, 3);
            const largest = today.largestTransaction;
            const largestInRecent =
              largest !== null && recent.some((transaction) => transaction.id === largest.id);
            return (
              <View className="mt-4 gap-3.5 px-1">
                {recent.map((transaction, rowIndex) => {
                  const isLargestRow =
                    largest !== null &&
                    transaction.amountMinorUnits === largest.amountMinorUnits;
                  const tied =
                    isLargestRow && largest !== null && hasLargestAmountTie(largest, recent);
                  return (
                    <EnterTransition key={transaction.id} index={rowIndex + 1}>
                      <TodayTransactionRow
                        transaction={transaction}
                        currency={data.currency}
                        featured={isLargestRow}
                        tied={tied}
                        onPress={
                          isLargestRow
                            ? () => onSelectTransaction?.(transaction.id) ?? onSeeActivity?.()
                            : () => onSelectTransaction?.(transaction.id)
                        }
                      />
                    </EnterTransition>
                  );
                })}
                {today.transactionCount > 3 ? (
                  <LimeActionPill
                    accessibilityLabel={`See all ${today.transactionCount} transactions`}
                    onPress={onSeeActivity}
                    className="mt-1 self-stretch justify-center py-2.5"
                  >
                    <Text className="text-caption font-semibold text-on-accent">
                      See all {today.transactionCount}
                    </Text>
                    <Text className="text-caption font-semibold text-on-accent">›</Text>
                  </LimeActionPill>
                ) : null}
                {largest && !largestInRecent ? (
                  <EnterTransition index={4}>
                    <TodayLargestBanner
                      transaction={largest}
                      currency={data.currency}
                      tied={hasLargestAmountTie(largest, recent)}
                      onPress={() => onSelectTransaction?.(largest.id) ?? onSeeActivity?.()}
                    />
                  </EnterTransition>
                ) : null}
              </View>
            );
          })()}
        </>
      )}
    </View>
  );
}
