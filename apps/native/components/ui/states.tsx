import { Button, Skeleton } from "heroui-native";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

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
 * for that long reads as a flicker, not as loading — so placeholders only
 * appear once a load has taken longer than this. Until then the space is
 * reserved (same height, empty) so nothing jumps.
 */
export const SKELETON_DELAY_MS = 150;

export function useDelayedVisible(delayMs = SKELETON_DELAY_MS): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return visible;
}

/** Renders children only after the skeleton delay; reserves `minHeight` until then. */
export function Delayed({ children, minHeight = 0 }: { children: ReactNode; minHeight?: number }) {
  const visible = useDelayedVisible();
  if (!visible) return <View style={{ minHeight }} />;
  return <Animated.View entering={FadeIn.duration(duration.base)}>{children}</Animated.View>;
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
