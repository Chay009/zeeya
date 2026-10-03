import { Chip } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import type { PreviewSub } from "../data";
import { moneyFontFamily } from "@/lib/fonts";

export const previewCircleButtonClass =
  "h-10 w-10 items-center justify-center rounded-full border border-border bg-card";

export const previewEyebrowClass = "text-label font-semibold uppercase tracking-widest text-muted";

export const previewScreenTitleClass = "mt-1 text-title font-semibold tracking-tight text-ink";

export function SubscriptionSpendValue({ value, size = 28 }: { value: string; size?: number }) {
  const lines = value.split(" + ").map((part, index) => (index === 0 ? part : `+ ${part}`));
  const hasAmount = value !== "—";
  return (
    <View className="mt-1">
      {lines.map((line, index) => (
        <View key={`${index}-${line}`} className="flex-row items-baseline">
          <Text
            className="text-ink"
            style={{
              fontFamily: moneyFontFamily("bold"),
              fontSize: size,
              lineHeight: size * 1.18,
              letterSpacing: -size * 0.03,
            }}
          >
            {line}
          </Text>
          {hasAmount && index === lines.length - 1 ? (
            <Text className="ml-1 text-caption text-muted">/ month</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const TYPE_COLOR: Record<PreviewSub["type"], "success" | "accent" | "warning"> = {
  autopay: "success",
  recurring: "accent",
  manual: "warning",
};

export function SubscriptionTypeBadge({ subscription }: { subscription: PreviewSub }) {
  return (
    <Chip
      size="sm"
      variant="soft"
      color={TYPE_COLOR[subscription.type]}
      className="rounded-pill px-2"
    >
      <Chip.Label className="text-label font-semibold">{subscription.typeLabel}</Chip.Label>
    </Chip>
  );
}

export function SubscriptionStatusBadge({
  subscription,
}: {
  subscription: PreviewSub;
  contained?: boolean;
}) {
  const active = subscription.status === "Active";
  return (
    <Chip
      size="sm"
      variant="soft"
      color={active ? "success" : "default"}
      className="rounded-pill px-2"
    >
      <Chip.Label className="text-label font-semibold">{subscription.status}</Chip.Label>
    </Chip>
  );
}

export function ReactivatedBadge() {
  return (
    <Chip size="sm" variant="soft" color="accent" className="rounded-pill px-2">
      <Chip.Label className="text-label font-semibold">Reactivated</Chip.Label>
    </Chip>
  );
}
