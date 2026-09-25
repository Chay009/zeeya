import * as Haptics from "expo-haptics";
import { forwardRef, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { AppText } from "@/components/app-text";

import { GlassSurface } from "./glass-surface";
import { useNativeUiColors } from "./theme";

export type GlassButtonTone = "neutral" | "accent";

export type GlassButtonProps = Omit<PressableProps, "children" | "style" | "onPress"> & {
  children?: ReactNode;
  label?: string;
  icon?: ReactNode;
  tone?: GlassButtonTone;
  iconOnly?: boolean;
  /** Optional material surface override for dark hero chrome or compact controls. */
  surfaceStyle?: StyleProp<ViewStyle>;
  /** Optional label colour when a custom material surface needs explicit contrast. */
  contentColor?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
};

/**
 * A compact, high-contrast action primitive for chrome and toolbar actions.
 * The iOS implementation gets Expo's real interactive glass material when
 * available; Android and web retain a normal, themed pressable surface.
 */
export const GlassButton = forwardRef<View, GlassButtonProps>(function GlassButton(
  {
    children,
    label,
    icon,
    tone = "neutral",
    iconOnly = label === undefined && children === undefined,
    surfaceStyle,
    contentColor,
    disabled = false,
    onPress,
    style,
    accessibilityRole = "button",
    ...props
  },
  ref,
) {
  const colors = useNativeUiColors();

  const handlePress = (event: GestureResponderEvent) => {
    if (disabled) return;
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    onPress?.(event);
  };

  const content = children ?? (
    <>
      {icon}
      {label !== undefined && (
        <AppText
          numberOfLines={1}
          style={[
            styles.label,
            { color: contentColor ?? (tone === "accent" ? colors.onAccent : colors.ink) },
          ]}
        >
          {label}
        </AppText>
      )}
    </>
  );

  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pressable,
        style,
        { opacity: pressed || disabled ? 0.72 : 1 },
      ]}
    >
      <GlassSurface
        interactive
        elevated={tone === "neutral"}
        tintColor={tone === "accent" ? colors.accent : undefined}
        style={[
          styles.surface,
          surfaceStyle,
          tone === "accent" && { backgroundColor: colors.accent, borderColor: colors.accent },
        ]}
      >
        <View style={[styles.content, iconOnly && styles.iconOnly]}>{content}</View>
      </GlassSurface>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: {
    minWidth: 44,
    minHeight: 44,
  },
  surface: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  content: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  iconOnly: {
    width: 42,
    paddingHorizontal: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
});
