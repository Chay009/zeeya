import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { ListGroup, PressableFeedback, Separator } from "heroui-native";
import Animated from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import { rowEnter, rowExit, rowLayout } from "./motion";
import { useThemeColors } from "./theme";

// Grouped rows — the iOS "inset grouped list". HeroUI's ListGroup is the
// surface; rows get hairline separators inset past the leading visual so the
// list reads as one object, not a stack of cards.

export function RowGroup({
  children,
  inset = 68,
  className = "",
  variant = "default",
  animated = false,
}: {
  children: ReactNode;
  /** Separator start inset — align it with the row's text column. */
  inset?: number;
  className?: string;
  variant?: "default" | "transparent";
  /**
   * For lists whose rows change under a filter: new rows fade in, removed
   * rows fade out, and the rest slide to their new place instead of jumping.
   */
  animated?: boolean;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <ListGroup variant={variant} className={`overflow-hidden rounded-card ${className}`}>
      {items.map((child, index) => {
        const content = (
          <>
            {index > 0 ? <Separator className="bg-divider" style={{ marginLeft: inset }} /> : null}
            {child}
          </>
        );
        return animated ? (
          <Animated.View key={child.key ?? index} entering={rowEnter} exiting={rowExit} layout={rowLayout}>
            {content}
          </Animated.View>
        ) : (
          <Fragment key={child.key ?? index}>{content}</Fragment>
        );
      })}
    </ListGroup>
  );
}

function Chevron() {
  const colors = useThemeColors();
  return <AppIcon name="chevron-right" size={16} color={colors.faint} />;
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  trailingSubtitle,
  onPress,
  chevron = false,
  accessibilityLabel,
  className = "",
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  trailingSubtitle?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  className?: string;
}) {
  const body = (
    <View className={`min-h-[60px] flex-row items-center gap-3 px-4 py-3 ${className}`}>
      {leading ? <ListGroup.ItemPrefix>{leading}</ListGroup.ItemPrefix> : null}
      <ListGroup.ItemContent className="min-w-0">
        {typeof title === "string" ? (
          <Text numberOfLines={1} className="text-body font-semibold text-ink">
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === "string" ? (
            <Text numberOfLines={1} className="mt-0.5 text-caption text-muted">
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </ListGroup.ItemContent>
      {trailing || trailingSubtitle ? (
        <View className="shrink-0 items-end">
          {trailing}
          {typeof trailingSubtitle === "string" ? (
            <Text numberOfLines={1} className="mt-0.5 text-meta text-muted">
              {trailingSubtitle}
            </Text>
          ) : (
            trailingSubtitle
          )}
        </View>
      ) : null}
      {chevron ? <Chevron /> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof title === "string" ? title : undefined)}
      onPress={onPress}
      animation={false}
    >
      <PressableFeedback.Highlight />
      {body}
    </PressableFeedback>
  );
}

/** Label / value line for detail screens (Account · HDFC •••• 4321). */
export function DetailRow({ label, value, valueClassName = "" }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <View className="min-h-[52px] flex-row items-center justify-between gap-4 px-4 py-3">
      <Text className="text-body text-muted">{label}</Text>
      {typeof value === "string" ? (
        <Text numberOfLines={2} className={`min-w-0 flex-1 text-right text-body font-medium text-ink ${valueClassName}`}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
