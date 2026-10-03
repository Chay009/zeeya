import { useRouter, type Href } from "expo-router";
import { PressableFeedback } from "heroui-native";
import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";
import { BUDGETS_ROUTE } from "@/features/budgets/routes";

// Home's doing-row: four square shortcuts, the primary one (Budgets) in lime
// — the one colour moment between the hero and the content. Gives Home
// things to act on, not only things to read. No haptic: the press and the screen
// change are the feedback, and haptics are kept for state changes.

const SHORTCUTS: {
  key: string;
  label: string;
  icon: AppIconName;
  href: Href;
  primary?: boolean;
}[] = [
  { key: "budgets", label: "Budgets", icon: "pie-chart", href: BUDGETS_ROUTE, primary: true },
  { key: "search", label: "Search", icon: "search", href: "/activity" as Href },
  { key: "subscriptions", label: "Recurring", icon: "repeat", href: "/subscriptions" as Href },
  { key: "accounts", label: "Accounts", icon: "card", href: "/cards" as Href },
];

export function HomeShortcuts() {
  const router = useRouter();
  const colors = useThemeColors();
  return (
    <View className="mt-4 flex-row gap-2.5">
      {SHORTCUTS.map((item) => {
        const ink = item.primary ? colors.onAccent : colors.ink;
        return (
          <PressableFeedback
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href)}
            className="flex-1 items-center justify-center gap-1.5 rounded-[20px] py-3.5"
            style={{
              borderCurve: "continuous",
              backgroundColor: item.primary ? colors.accent : colors.card,
            }}
          >
            {/* A bare icon — no bubble; the card is the button. */}
            <AppIcon name={item.icon} size={22} color={ink} />
            <Text numberOfLines={1} className="text-meta font-semibold" style={{ color: ink }}>
              {item.label}
            </Text>
          </PressableFeedback>
        );
      })}
    </View>
  );
}
