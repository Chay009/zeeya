import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { headingFontFamily } from "@/lib/fonts";

// Section = a heading that sits ON the page (not inside a card) plus its
// content. Keeping headings outside cards is what gives the screen rhythm:
// page → heading → card, repeated at one spacing.

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  accessory,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  accessory?: ReactNode;
}) {
  return (
    <View className="mb-3 min-h-7 flex-row items-center justify-between px-1">
      <Text
        className="text-subtitle font-bold tracking-tight text-ink"
        style={{ fontFamily: headingFontFamily("bold") }}
      >
        {title}
      </Text>
      {accessory}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Text className="text-caption font-semibold text-accent-deep">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Section({
  title,
  actionLabel,
  onAction,
  accessory,
  children,
  className = "",
}: {
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`mt-7 ${className}`}>
      {title ? (
        <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} accessory={accessory} />
      ) : null}
      {children}
    </View>
  );
}
