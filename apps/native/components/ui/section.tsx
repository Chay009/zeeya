import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { headingFontFamily } from "@/lib/fonts";

// Section = a heading that sits ON the page (not inside a card) plus its
// content. Keeping headings outside cards is what gives the screen rhythm:
// page → heading → card, repeated at one spacing (24pt between sections,
// 10pt from heading to card). The heading is 18/23 semibold — a clear step
// above the 15pt body without shouting over the content it introduces.

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
    <View className="mb-2.5 flex-row items-center justify-between px-1">
      <Text
        className="font-semibold text-ink"
        style={{
          fontFamily: headingFontFamily("semibold"),
          fontSize: 18,
          lineHeight: 23,
          letterSpacing: -0.3,
        }}
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
    <View className={`mt-6 ${className}`}>
      {title ? (
        <SectionHeader
          title={title}
          actionLabel={actionLabel}
          onAction={onAction}
          accessory={accessory}
        />
      ) : null}
      {children}
    </View>
  );
}
