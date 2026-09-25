import { Platform, Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { moneyFontFamily } from "@/lib/fonts";

import type { HomePreviewData } from "../data";
import { hp } from "../theme";
import { BrandLogo } from "./brand-logo";

const MAX_STRIP_ICONS = 4;

// A soft lift off the page. Without it these panels sit in the same plane
// as the background and the screen reads as one flat sheet — the hero card
// has real depth, so the tiles under it need to be on the same plane as
// each other and above the page.
const tileShadow = Platform.select({
  ios: {
    shadowColor: hp.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  android: { elevation: 2 },
  default: {},
});

// Surfaces separate from the page by fill and elevation — never a border.
// Borders were what made this grid read as a table of boxes.
function Tile({
  children,
  onPress,
  flex = 1,
  minHeight = 118,
  padding = 18,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  flex?: number;
  minHeight?: number;
  padding?: number;
  accessibilityLabel?: string;
}) {
  const chrome = {
    flex,
    minHeight,
    padding,
    ...tileShadow,
  } as const;

  if (!onPress) {
    return (
      <View className="overflow-hidden rounded-card bg-card" style={chrome}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="overflow-hidden rounded-card bg-card"
      style={({ pressed }) => [chrome, { opacity: pressed ? 0.85 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

// Three type sizes across the whole grid — 16 title, 13 sub, and whatever
// the tile's own value wants. Nothing in between.
function TileHeading({ children }: { children: string }) {
  return <Text className="text-base font-bold tracking-tight text-ink">{children}</Text>;
}

function TileSub({ children }: { children: string }) {
  return <Text className="mt-0.5 text-[13px] text-muted-soft">{children}</Text>;
}

// Where the month's money went, as thick proportional bars in each
// category's own colour, with the top category named underneath. The
// colours are real data (CategorySummary.color), so the tile changes with
// what you actually spent on.
function SpendBreakdownTile({
  data,
  onPress,
}: {
  data: HomePreviewData["cashflow"];
  onPress: () => void;
}) {
  const categories = data.categories.slice(0, 5);
  const top = categories[0];

  return (
    // 1.45fr against the subscriptions tile's 1fr — the unequal split is
    // what stops the row reading as a uniform 2-up.
    <Tile flex={1.45} minHeight={150} onPress={onPress} accessibilityLabel="Open activity">
      <TileHeading>Spending</TileHeading>
      <TileSub>{data.subtitle}</TileSub>

      {categories.length > 0 ? (
        <View className="mt-auto">
          <Text
            numberOfLines={1}
            className="text-[26px] tracking-tight text-ink"
            style={{ fontFamily: moneyFontFamily("semibold") }}
          >
            {data.expense}
          </Text>
          <View className="mt-3 h-[13px] flex-row gap-1">
            {categories.map((category) => (
              <View
                key={category.label}
                className="rounded-[7px]"
                style={{
                  flex: Math.max(category.pct, 10),
                  backgroundColor: category.color,
                }}
              />
            ))}
          </View>
          {top && (
            <View className="mt-2.5 flex-row items-center gap-1.5">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: top.color }}
              />
              <Text numberOfLines={1} className="flex-1 text-[13px] text-muted">
                {`${top.label} leads`}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text className="mt-auto text-[13px] text-muted-soft">Nothing captured yet</Text>
      )}
    </Tile>
  );
}

// Brand logos carry the colour here — nothing else in the tile is tinted,
// and they run big (42px) and overlapped so the strip reads as the tile's
// content rather than as decoration in a corner.
function SubscriptionsTile({
  subscriptions,
  onOpen,
}: {
  subscriptions: HomePreviewData["subscriptions"];
  onOpen: () => void;
}) {
  const items = subscriptions.items.slice(0, MAX_STRIP_ICONS);

  return (
    <Tile flex={1} minHeight={150} onPress={onOpen} accessibilityLabel="Open subscriptions">
      <TileHeading>Subscriptions</TileHeading>
      <TileSub>
        {subscriptions.activeCount === 1 ? "1 active" : `${subscriptions.activeCount} active`}
      </TileSub>

      <View className="mt-auto">
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          className="text-[22px] tracking-tight text-ink"
          style={{ fontFamily: moneyFontFamily("semibold") }}
        >
          {subscriptions.monthlySpend}
        </Text>
        {items.length > 0 ? (
          <View className="mt-3 flex-row items-center">
            {items.map((item, index) => (
              <View
                key={item.key}
                style={{
                  borderRadius: 21,
                  borderWidth: 2.5,
                  borderColor: hp.card,
                  marginLeft: index === 0 ? 0 : -12,
                }}
              >
                <BrandLogo
                  letter={item.letter}
                  tile={item.tile}
                  ink={item.ink}
                  img={item.img}
                  size={42}
                  radius={21}
                  iconRatio={0.6}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-3 text-[13px] text-muted-soft">None detected yet</Text>
        )}
      </View>
    </Tile>
  );
}

function WideActionTile({
  title,
  sub,
  onPress,
}: {
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Tile onPress={onPress} minHeight={84} padding={18} accessibilityLabel={title}>
      <View className="min-h-0 flex-1 flex-row items-center gap-3.5">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-base font-bold tracking-tight text-ink">
            {title}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted-soft">
            {sub}
          </Text>
        </View>
        <AppIcon name="chevron-right" size={22} color={hp.faint} />
      </View>
    </Tile>
  );
}

// Two rows of panels at deliberately different sizes. The month's expense
// total is not repeated here: CashflowCard shows the income/expense split
// and BudgetCard the spend-against-limit, so these answer "on what" and
// "where next" instead.
export function HomeSecondaryGrid({
  cashflow,
  subscriptions,
  accountCount,
  onOpenSubscriptions,
  onOpenActivity,
  onOpenCards,
}: {
  cashflow: HomePreviewData["cashflow"];
  subscriptions: HomePreviewData["subscriptions"];
  accountCount: number;
  onOpenSubscriptions: () => void;
  onOpenActivity: () => void;
  onOpenCards: () => void;
}) {
  return (
    <View className="mt-4 gap-3">
      <View className="flex-row gap-3">
        <SpendBreakdownTile data={cashflow} onPress={onOpenActivity} />
        <SubscriptionsTile subscriptions={subscriptions} onOpen={onOpenSubscriptions} />
      </View>

      {/* No analytics tile: Analytics is a bottom tab, so a shortcut to it
          here was a second route to the same place carrying no extra
          information. Cards has no tab, so it earns a row. */}
      <WideActionTile
        title="Cards & accounts"
        sub={accountCount === 1 ? "1 confirmed account" : `${accountCount} confirmed accounts`}
        onPress={onOpenCards}
      />
    </View>
  );
}
