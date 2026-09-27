import { BottomSheet as HeroBottomSheet } from "heroui-native";
import { useState, type ReactNode } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/icon";

import { useThemeColors } from "@/components/ui/theme";

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
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  // HeroUI's portal mounts the (closed) Gorhom sheet up front, content and
  // all — so a screen with several sheets rendered every list inside them on
  // first paint and on every re-render. Content renders only once the sheet
  // has been opened (then stays, so closing animates with content intact).
  // Set while rendering, not in an effect, so the opening frame has it.
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);

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
            backgroundColor: colors.card,
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
                  backgroundColor: colors.fill,
                }}
              >
                <AppIcon name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingTop: 12 }}>{hasOpened ? children : null}</View>
          </View>
        </HeroBottomSheet.Content>
      </HeroBottomSheet.Portal>
    </HeroBottomSheet>
  );
}
