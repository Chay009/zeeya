import { PressableFeedback } from "heroui-native";
import { ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { moneyFontFamily } from "@/lib/fonts";
import { duration, tick } from "@/components/ui/motion";
import { mixColors, useThemeColors, withAlpha } from "@/components/ui/theme";

import { ALL_ACCOUNTS_KEY, bankShortName, last4Label } from "../account-scope";
import type { HomeAccount } from "../data";
import { BrandLogo } from "./brand-logo";

// Accounts as tiles on the dark hero: each shows its bank, last digits and
// balance, so every account's money is readable at a glance; tapping one
// scopes Home to it. The selected tile turns lime. Screen readers hear the
// balance too (the label replaces the tile's text).

const TILE_WIDTH = 148;
const TILE_RADIUS = 16;
/** How far the tile row sits from the hero card's edges (its tray inset). */
export const TILE_INSET = 12;

function Tile({
  selected,
  onPress,
  accessibilityLabel,
  logo,
  title,
  subtitle,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  logo: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const ink = selected ? colors.onAccent : colors.onHero;
  const soft = selected ? withAlpha(colors.onAccent, 0.62) : colors.onHeroMuted;
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${accessibilityLabel}, ${title}`}
      onPress={() => {
        if (!selected) tick();
        onPress();
      }}
      className="justify-between p-3"
      style={{
        width: TILE_WIDTH,
        height: 98,
        // Concentric with the hero card: its 28pt radius less the 12pt inset.
        borderRadius: TILE_RADIUS,
        borderCurve: "continuous",
        // Opaque, so the hero art can tuck behind the row.
        backgroundColor: mixColors(colors.hero, colors.onHero, 0.07),
        // Always 1pt so selecting never shifts the content; only its colour changes.
        borderWidth: 1,
        borderColor: selected ? colors.accent : withAlpha(colors.onHero, 0.09),
      }}
    >
      {/* Selection fades in as a lime layer — an opacity transition, short
          and plain "ease" as a colour change should be. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: TILE_RADIUS - 1,
          borderCurve: "continuous",
          backgroundColor: colors.accent,
          opacity: selected ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: reducedMotion ? 0 : duration.fast,
          transitionTimingFunction: "ease",
        }}
      />
      <View className="flex-row items-start justify-between">
        {logo}
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{
            backgroundColor: selected
              ? withAlpha(colors.onAccent, 0.1)
              : withAlpha(colors.onHero, 0.08),
          }}
        >
          <AppIcon name="arrow-up-right" size={13} color={ink} />
        </View>
      </View>
      <View>
        <Text numberOfLines={1} className="text-meta font-medium" style={{ color: soft }}>
          {subtitle}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            color: ink,
            fontFamily: moneyFontFamily("semibold"),
            fontSize: 16,
            lineHeight: 21,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
      </View>
    </PressableFeedback>
  );
}

export function AccountTiles({
  accounts,
  selectedKey,
  totalLabel,
  onSelect,
}: {
  accounts: HomeAccount[];
  selectedKey: string;
  /** The all-accounts total shown on the "All" tile. */
  totalLabel: string;
  onSelect: (key: string) => void;
}) {
  const colors = useThemeColors();
  const allSelected = selectedKey === ALL_ACCOUNTS_KEY;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ gap: 10, paddingHorizontal: TILE_INSET }}
    >
      <Tile
        selected={allSelected}
        onPress={() => onSelect(ALL_ACCOUNTS_KEY)}
        accessibilityLabel="All accounts"
        logo={
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundColor: allSelected
                ? withAlpha(colors.onAccent, 0.1)
                : withAlpha(colors.onHero, 0.1),
            }}
          >
            <AppIcon name="card" size={15} color={allSelected ? colors.onAccent : colors.onHero} />
          </View>
        }
        subtitle={`All · ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
        title={totalLabel}
      />
      {accounts.map((account) => (
        <Tile
          key={account.key}
          selected={selectedKey === account.key}
          onPress={() => onSelect(account.key)}
          accessibilityLabel={`${account.bankName} ${last4Label(account.last4)}`}
          logo={
            <BrandLogo
              letter={account.bankName.charAt(0).toUpperCase() || "?"}
              tile={colors.card}
              ink={colors.ink}
              img={account.bankIcon}
              size={32}
              radius={16}
              iconRatio={0.66}
            />
          }
          subtitle={`${bankShortName(account.bankName)} ${last4Label(account.last4)}`}
          title={account.balance}
        />
      ))}
    </ScrollView>
  );
}
