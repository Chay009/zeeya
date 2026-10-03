import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { GlowLogos } from "@/components/finance/glow-logos";
import type { HomeHighlights, UpcomingPayment } from "@/lib/dashboard-data";

import type { PreviewSub } from "../../data";
import { merchantVisual } from "../../data";
import {
  amount,
  PAIR_VISIBLE_COUNT,
  PairCardShell,
  PairMerchantRow,
  PairOverflowHint,
  PairSummaryHero,
  relativeDueLabel,
} from "./shared";

function dueSoonRowVisual(payment: UpcomingPayment) {
  const style = merchantVisual(payment.merchant);
  return {
    letter: payment.merchant.charAt(0).toUpperCase() || "?",
    tile: style.tile,
    ink: style.ink,
    img: style.img,
  };
}

export function DueSoonCard({
  data,
  onOpen,
}: {
  data: HomeHighlights;
  onOpen: () => void;
}) {
  const payments = data.upcomingPayments;
  const totalCount = data.upcomingPaymentCount;
  const visible = payments.slice(0, PAIR_VISIBLE_COUNT);
  const overflow = Math.max(0, totalCount - PAIR_VISIBLE_COUNT);
  const billLabel = totalCount === 1 ? "bill" : "bills";

  return (
    <PairCardShell title="Upcoming" onPress={onOpen} art="hero-calendar" hue="#3B82F6">
      {totalCount === 0 ? (
        <Text className="mt-1 text-caption text-muted">Nothing due</Text>
      ) : (
        <>
          <PairSummaryHero
            count={totalCount}
            label={billLabel}
            totalLabel={amount(data.upcomingPaymentsTotalMinorUnits, data.currency)}
          />
          <View className="mt-3.5 gap-3">
            {visible.map((payment, index) => {
              const visual = dueSoonRowVisual(payment);
              return (
                <PairMerchantRow
                  key={payment.id}
                  letter={visual.letter}
                  tile={visual.tile}
                  ink={visual.ink}
                  img={visual.img}
                  name={payment.merchant}
                  subtitle={relativeDueLabel(payment.expectedAt)}
                  amountLabel={amount(payment.amountMinorUnits, payment.currency)}
                  faded={index === 1}
                />
              );
            })}
            <PairOverflowHint count={overflow} />
          </View>
        </>
      )}
    </PairCardShell>
  );
}

function subscriptionPreviewItemsForCurrency(
  items: readonly PreviewSub[],
  currency: string,
): PreviewSub[] {
  return items.filter((item) => item.currency === currency);
}

// How many services glow in the card before "+N more".
const GLOW_LOGO_COUNT = 4;

export function SubscriptionsPairCard({
  data,
  previewItems,
  onOpen,
}: {
  data: HomeHighlights;
  previewItems: PreviewSub[];
  onOpen: () => void;
}) {
  const subscriptions = data.subscriptions;
  const recurringCount = subscriptions.activeCount;
  const currencyItems = subscriptionPreviewItemsForCurrency(previewItems, data.currency);
  const glowing = currencyItems.slice(0, GLOW_LOGO_COUNT);

  return (
    <PairCardShell
      title="Subscriptions"
      onPress={onOpen}
      art="hero-subscriptions"
      hue="#8B5CF6"
    >
      {recurringCount === 0 ? (
        <Text className="mt-1 text-caption text-muted">None detected yet</Text>
      ) : (
        <>
          <PairSummaryHero
            count={recurringCount}
            label="active"
            totalLabel={amount(subscriptions.expectedMonthlyMinorUnits, data.currency)}
          />
          {/* The services themselves, each glowing in its brand colour. */}
          <View className="mt-3 flex-row items-end gap-2">
            <GlowLogos
              items={glowing.map((item) => ({
                key: item.key,
                letter: item.letter,
                tile: item.tile,
                ink: item.ink,
                img: item.img ?? undefined,
              }))}
              size={32}
              tail={40}
              step={7}
            />
            <PairOverflowHint count={Math.max(0, recurringCount - glowing.length)} />
          </View>
        </>
      )}
    </PairCardShell>
  );
}
