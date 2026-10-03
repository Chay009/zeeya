import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";

import { useCardElevation } from "./elevation";

// The one card: white, 22pt radius, 16pt padding, the shared soft elevation,
// and its title INSIDE (left) with an optional link (right) — the reference
// dashboard's grouping, where each card is one clearly named thing.

export function Card({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
  className = "",
}: {
  title?: string;
  /** One plain line under the title saying what the card shows. */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const elevation = useCardElevation();
  return (
    <View
      className={`rounded-card bg-card p-4 ${className}`}
      style={[{ borderCurve: "continuous" }, elevation]}
    >
      {title ? (
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-subtitle font-semibold text-ink">{title}</Text>
            {subtitle ? <Text className="text-caption text-muted">{subtitle}</Text> : null}
          </View>
          {actionLabel && onAction ? (
            <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
              <Text className="text-caption font-semibold text-muted">{actionLabel} ›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
