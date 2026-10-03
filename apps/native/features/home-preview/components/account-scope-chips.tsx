import { PressableFeedback } from "heroui-native";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { tick } from "@/components/ui/motion";
import { useThemeColors, withAlpha, type ThemeColors } from "@/components/ui/theme";

import { ALL_ACCOUNTS_KEY, bankShortName, last4Label } from "../account-scope";
import type { HomeAccount } from "../data";
import { BrandLogo } from "./brand-logo";

// Account scope as a row of compact pills under the balance: selected is
// solid ink, the rest sit quietly on the fill. The trailing pill opens
// Cards & accounts.

type ChipTone = "light" | "dark";

// On the dark hero the chips are glass: a faint white film when idle, the
// lime accent when selected. On light surfaces: ink / fill as before.
function chipColors(colors: ThemeColors, tone: ChipTone, selected: boolean) {
  if (tone === "dark") {
    return selected
      ? {
          background: colors.accent,
          text: colors.onAccent,
          subtle: withAlpha(colors.onAccent, 0.6),
          badge: withAlpha(colors.onAccent, 0.12),
        }
      : {
          background: withAlpha(colors.onHero, 0.09),
          text: colors.onHero,
          subtle: colors.onHeroMuted,
          badge: withAlpha(colors.onHero, 0.12),
        };
  }
  return selected
    ? {
        background: colors.ink,
        text: colors.onInk,
        subtle: withAlpha(colors.onInk, 0.6),
        badge: withAlpha(colors.onInk, 0.15),
      }
    : { background: colors.fill, text: colors.ink, subtle: colors.muted, badge: colors.card };
}

function Pill({
  selected,
  tone,
  onPress,
  accessibilityLabel,
  children,
}: {
  selected: boolean;
  tone: ChipTone;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const palette = chipColors(colors, tone, selected);
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        if (!selected) tick();
        onPress();
      }}
      className="h-9 flex-row items-center gap-2 rounded-pill pl-1.5 pr-3.5"
      style={{
        backgroundColor: palette.background,
        borderWidth: tone === "dark" && !selected ? 1 : 0,
        borderColor: withAlpha(colors.onHero, 0.1),
      }}
    >
      {children}
    </PressableFeedback>
  );
}

export function AccountScopeChips({
  accounts,
  selectedKey,
  onSelect,
  onOpenMore,
  tone = "light",
}: {
  accounts: HomeAccount[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onOpenMore: () => void;
  /** "dark" when the chips sit on the hero surface. */
  tone?: ChipTone;
}) {
  const colors = useThemeColors();
  const allSelected = selectedKey === ALL_ACCOUNTS_KEY;
  const all = chipColors(colors, tone, allSelected);
  const idle = chipColors(colors, tone, false);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
    >
      <Pill
        selected={allSelected}
        tone={tone}
        onPress={() => onSelect(ALL_ACCOUNTS_KEY)}
        accessibilityLabel="All accounts"
      >
        <View
          className="h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: all.badge }}
        >
          <AppIcon name="card" size={13} color={all.text} />
        </View>
        <Text className="text-meta font-semibold" style={{ color: all.text }}>
          All
        </Text>
      </Pill>

      {accounts.map((account) => {
        const selected = selectedKey === account.key;
        const palette = chipColors(colors, tone, selected);
        return (
          <Pill
            key={account.key}
            selected={selected}
            tone={tone}
            onPress={() => onSelect(account.key)}
            accessibilityLabel={`${account.bankName} ${last4Label(account.last4)}`}
          >
            <BrandLogo
              letter={account.bankName.charAt(0).toUpperCase() || "?"}
              tile={colors.card}
              ink={colors.ink}
              img={account.bankIcon}
              size={24}
              radius={12}
              iconRatio={0.66}
            />
            <Text
              numberOfLines={1}
              className="text-meta font-semibold"
              style={{ color: palette.text }}
            >
              {bankShortName(account.bankName)}
            </Text>
            <Text numberOfLines={1} className="text-meta" style={{ color: palette.subtle }}>
              {last4Label(account.last4)}
            </Text>
          </Pill>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage accounts"
        onPress={onOpenMore}
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: idle.background }}
      >
        <AppIcon name="chevron-right" size={15} color={idle.text} />
      </Pressable>
    </ScrollView>
  );
}
