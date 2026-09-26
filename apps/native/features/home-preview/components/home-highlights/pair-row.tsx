import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
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
    <PairCardShell title="Upcoming" onPress={onOpen}>
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
  const visible = currencyItems.slice(0, PAIR_VISIBLE_COUNT);
  const overflow = Math.max(0, recurringCount - PAIR_VISIBLE_COUNT);

  return (
    <PairCardShell title="Subscriptions" onPress={onOpen}>
      {recurringCount === 0 ? (
        <Text className="mt-1 text-caption text-muted">None detected yet</Text>
      ) : (
        <>
          <PairSummaryHero
            count={recurringCount}
            label="active"
            totalLabel={amount(subscriptions.expectedMonthlyMinorUnits, data.currency)}
          />
          <View className="mt-3.5 gap-3">
            {visible.map((item, index) => (
              <PairMerchantRow
                key={item.key}
                letter={item.letter}
                tile={item.tile}
                ink={item.ink}
                img={item.img}
                name={item.name}
                amountLabel={`${item.amount}/mo`}
                faded={index === 1}
              />
            ))}
            <PairOverflowHint count={overflow} />
          </View>
        </>
      )}
    </PairCardShell>
  );
}
