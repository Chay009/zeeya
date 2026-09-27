import { Button, Skeleton } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";

import { duration } from "./motion";
import { useThemeColors } from "./theme";

// Loading, empty and error states. Every data surface uses these so the app
// never shows a blank white screen or a raw error string.

export function EmptyState({
  icon = "sparkles",
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
}: {
  icon?: AppIconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View className={`items-center px-6 ${compact ? "py-8" : "py-14"}`}>
      <View className="h-14 w-14 items-center justify-center rounded-full bg-fill">
        <AppIcon name={icon} size={24} color={colors.muted} />
      </View>
      <Text className="mt-4 text-center text-body font-semibold text-ink">{title}</Text>
      {body ? (
        <Text className="mt-1.5 max-w-[280px] text-center text-caption text-muted">{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" className="mt-5" onPress={onAction}>
          <Button.Label>{actionLabel}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  compact = false,
}: {
  title?: string;
  body?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon="cloud-off"
      title={title}
      body={body ?? "Pull down to refresh, or try again."}
      actionLabel={onRetry ? "Try again" : undefined}
      onAction={onRetry}
      compact={compact}
    />
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <Skeleton className={`rounded-sm ${className}`} />;
}

/**
 * Local SQLite reads usually land in a few milliseconds. Showing a skeleton
 * for that long reads as a flicker, not as loading — so placeholders stay
 * invisible for this long, then fade in. Their space is laid out from the
 * start, so nothing jumps either way.
 */
export const SKELETON_DELAY_MS = 150;

const FADE_IN = { from: { opacity: 0 }, to: { opacity: 1 } };

/**
 * Children render immediately but stay transparent until the skeleton delay
 * passes, then fade in. Pure Reanimated CSS (`backwards` fill holds the
 * `from` frame during the delay) — no timer, no state, no re-render.
 */
export function Delayed({ children, minHeight = 0 }: { children: ReactNode; minHeight?: number }) {
  return (
    <Animated.View
      style={{
        minHeight,
        animationName: FADE_IN,
        animationDuration: duration.base,
        animationDelay: SKELETON_DELAY_MS,
        animationFillMode: "backwards",
      }}
    >
      {children}
    </Animated.View>
  );
}

const ROW_HEIGHT = 68;

/** Placeholder for a grouped list while it loads. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <Delayed minHeight={count * ROW_HEIGHT}>
      <View className="overflow-hidden rounded-card bg-card">
        {Array.from({ length: count }, (_, index) => (
          <View key={index} className="flex-row items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-10 w-10 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-3.5 w-2/5 rounded-sm" />
              <Skeleton className="h-3 w-1/4 rounded-sm" />
            </View>
            <Skeleton className="h-3.5 w-16 rounded-sm" />
          </View>
        ))}
      </View>
    </Delayed>
  );
}

/** Placeholder for a hero card (big number + chart). */
export function SkeletonHero() {
  return (
    <Delayed minHeight={300}>
      <View className="rounded-card bg-card p-5">
        <Skeleton className="h-3.5 w-28 rounded-sm" />
        <Skeleton className="mt-3 h-10 w-44 rounded-sm" />
        <Skeleton className="mt-3 h-5 w-24 rounded-pill" />
        <Skeleton className="mt-6 h-40 w-full rounded-tile" />
      </View>
    </Delayed>
  );
}
