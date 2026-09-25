import { BottomSheet as HeroBottomSheet } from "heroui-native";
import type { ReactNode } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/icon";

import { useNativeUiTheme } from "./theme";

export type NativeBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Gorhom snap points, kept at the shell seam so content stays unaware. */
  snapPoints?: Array<string | number>;
};

/**
 * Shared native sheet shell. HeroUI owns the portal, accessibility wiring,
 * drag-to-dismiss behavior, and Gorhom/Reanimated integration; this module
 * owns only Zeeya's spacing, theme, close affordance, and reduced-motion
 * choice.
 */
export function NativeBottomSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  snapPoints = ["70%"],
}: NativeBottomSheetProps) {
  const { colors } = useNativeUiTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <HeroBottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      animation={reducedMotion ? "disable-all" : undefined}
    >
      <HeroBottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <HeroBottomSheet.Overlay
          accessibilityLabel="Dismiss sheet"
          style={{ backgroundColor: colors.scrim }}
        />
        <HeroBottomSheet.Content
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose
          backgroundStyle={{
            backgroundColor: colors.surfaceRaised,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          contentContainerProps={{ style: { padding: 0 } }}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(12, insets.bottom),
            }}
          >
            <View
              accessibilityElementsHidden
              pointerEvents="none"
              style={{
                alignSelf: "center",
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.muted,
                opacity: 0.35,
              }}
            />
            <View
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingTop: 8,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <HeroBottomSheet.Title
                  style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}
                >
                  {title}
                </HeroBottomSheet.Title>
                {description && (
                  <HeroBottomSheet.Description
                    numberOfLines={2}
                    style={{ marginTop: 3, color: colors.muted, fontSize: 13, lineHeight: 18 }}
                  >
                    {description}
                  </HeroBottomSheet.Description>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close sheet"
                hitSlop={8}
                onPress={() => onOpenChange(false)}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  backgroundColor: colors.surfacePressed,
                }}
              >
                <AppIcon name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingTop: 12 }}>{children}</View>
          </View>
        </HeroBottomSheet.Content>
      </HeroBottomSheet.Portal>
    </HeroBottomSheet>
  );
}
