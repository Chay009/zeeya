import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/build/layouts/Tabs";
import { Tabs } from "heroui-native";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { GlassSurface } from "@/components/native-ui/glass-surface";
import { snappy } from "@/components/ui/motion";
import { useThemeColors } from "@/components/ui/theme";

const BAR_RADIUS = 26;
const BAR_PADDING = 6;
const PILL_RADIUS = BAR_RADIUS - BAR_PADDING;
// GlassSurface's own minHeight plus the padding around it — the bar's real
// on-screen height, independent of the device's bottom inset.
const BAR_VISUAL_HEIGHT = 64 + BAR_PADDING * 2;
// Breathing room between the bar's top edge and the content stopping above
// it, so the last row isn't flush against the bar.
const BAR_CONTENT_GAP = 16;

// The bar sits at bottom: max(12, insets.bottom) and is BAR_VISUAL_HEIGHT
// tall — a screen's scrollable content needs at least that much bottom
// padding, plus the same bottom inset again (the bar's offset from the
// screen edge doesn't shrink the space content needs below it), or content
// renders underneath the bar on any device whose inset differs from the
// fixed value a plain constant would assume.
export function useFloatingTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return BAR_VISUAL_HEIGHT + Math.max(12, insets.bottom) + BAR_CONTENT_GAP;
}

// Selecting a tab gives its icon a small spring pop — dips, then settles —
// so the switch feels physical, not just recoloured.
function TabIcon({ name, selected, color }: { name: AppIconName; selected: boolean; color: string }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!selected || reducedMotion) return;
    scale.value = withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, snappy));
  }, [reducedMotion, scale, selected]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <AppIcon name={name} size={23} color={color} strokeWidth={selected ? 2 : 1.7} />
    </Animated.View>
  );
}

const TAB_ICONS: Record<string, AppIconName> = {
  index: "home",
  activity: "rupee-receipt",
  insights: "pie-chart",
  profile: "user",
};

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const activeRoute = state.routes[state.index]?.name ?? "";

  const selectTab = (routeName: string) => {
    const route = state.routes.find((candidate) => candidate.name === routeName);
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (route.key !== state.routes[state.index]?.key && !event.defaultPrevented) {
      if (Platform.OS !== "web" && process.env.NODE_ENV !== "test") {
        void Haptics.selectionAsync().catch(() => undefined);
      }
      navigation.navigate(route.name);
    }
  };

  return (
    <GlassSurface
      effectStyle="regular"
      elevated
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: Math.max(12, insets.bottom),
        minHeight: 64,
        // Radii are nested properly now: the pill inside is BAR_RADIUS minus
        // the padding around it, so its curve is concentric with the bar's
        // instead of the two fighting each other.
        borderRadius: BAR_RADIUS,
        padding: BAR_PADDING,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 12,
        zIndex: 20,
      }}
    >
      <Tabs value={activeRoute} onValueChange={selectTab} style={{ width: "100%", gap: 0 }}>
        <Tabs.List
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: 0,
            padding: 0,
            borderRadius: PILL_RADIUS,
            backgroundColor: "transparent",
          }}
        >
          <Tabs.Indicator
            style={{ top: 0, borderRadius: PILL_RADIUS, backgroundColor: colors.ink }}
          />
          {state.routes.map((route) => {
            const { options } = descriptors[route.key]!;
            const icon = TAB_ICONS[route.name];
            const label = typeof options.title === "string" ? options.title : route.name;

            return (
              <Tabs.Trigger
                key={route.key}
                value={route.name}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: route.name === activeRoute }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: PILL_RADIUS,
                  paddingVertical: 10,
                  paddingHorizontal: 2,
                }}
              >
                {({ isSelected }) =>
                  icon ? (
                    <View
                      pointerEvents="none"
                      style={{ alignItems: "center", justifyContent: "center", gap: 4 }}
                    >
                      <TabIcon
                        name={icon}
                        selected={isSelected}
                        color={isSelected ? colors.onInk : colors.muted}
                      />
                      <Text
                        numberOfLines={1}
                        className="text-label font-medium"
                        style={{ color: isSelected ? colors.onInk : colors.muted }}
                      >
                        {label}
                      </Text>
                    </View>
                  ) : null
                }
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
      </Tabs>
    </GlassSurface>
  );
}
