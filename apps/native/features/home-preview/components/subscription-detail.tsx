import { ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { NavBar } from "@/components/ui/header";
import { DetailRow, RowGroup } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { headingFontFamily, moneyFontFamily } from "@/lib/fonts";

import type { PreviewSub } from "../data";
import { BrandLogo } from "./brand-logo";
import { SubscriptionStatusBadge, SubscriptionTypeBadge } from "./subscription-ui";

// Subscription detail: the same receipt-style hero as a transaction, the
// key facts as grouped rows, then a quiet timeline of status changes.

export function SubscriptionDetail({
  subscription,
  onBack,
  topInset,
}: {
  subscription: PreviewSub;
  onBack: () => void;
  topInset: number;
}) {
  const nextOrLast = subscription.dateLabel.replace(/^(Last seen|Updated) /, "");

  return (
    <View className="flex-1 bg-background">
      <NavBar title="Subscription" onBack={onBack} topInset={topInset} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pb-2 pt-4">
          <BrandLogo
            letter={subscription.letter}
            tile={subscription.tile}
            ink={subscription.ink}
            img={subscription.img}
            size={64}
            radius={32}
            iconRatio={0.6}
          />
          <Text
            numberOfLines={2}
            className="mt-4 text-center text-subtitle font-semibold text-ink"
            style={{ fontFamily: headingFontFamily("semibold") }}
          >
            {subscription.name}
          </Text>
          <View className="mt-2 flex-row items-baseline">
            <Text className="text-display text-ink" style={{ fontFamily: moneyFontFamily("bold"), letterSpacing: -1.2 }}>
              {subscription.amount}
            </Text>
            {subscription.amountValue !== null ? (
              <Text className="ml-1 text-body text-muted">/ month</Text>
            ) : null}
          </View>
          <View className="mt-4 flex-row gap-2">
            <SubscriptionTypeBadge subscription={subscription} />
            <SubscriptionStatusBadge subscription={subscription} />
          </View>
        </View>

        <Section>
          <RowGroup inset={16}>
            <DetailRow label={subscription.dateLabelTitle} value={nextOrLast} />
            <DetailRow label="Charged via" value={subscription.typeLabel} />
            {subscription.meta ? <DetailRow label="Details" value={subscription.meta} /> : null}
          </RowGroup>
        </Section>

        {subscription.timeline.length > 0 ? (
          <Section title="History">
            <View className="rounded-card bg-card px-4 pb-2 pt-4">
              {subscription.timeline.map((event, index) => {
                const last = index === subscription.timeline.length - 1;
                return (
                  <View key={`${event.label}-${event.time}-${index}`} className="flex-row" style={{ minHeight: 56 }}>
                    <View className="w-6 items-center">
                      <View className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: event.dot }} />
                      {!last ? <View className="my-1 w-px flex-1 bg-divider" /> : null}
                    </View>
                    <View className="flex-1 pb-4 pl-2">
                      <Text className="text-body font-medium text-ink">{event.label}</Text>
                      <Text className="mt-0.5 text-caption text-muted">{event.time}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}
