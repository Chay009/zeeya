import { useState } from "react";
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import type { HomeAccount } from "../data";
import { homeSpacing, hp } from "../theme";
import { AccountCard } from "./account-card";

// How much of the next card is left visible at the right edge. A peeked
// neighbour is what tells you the stack is swipeable without needing a
// caption to say so — full-width pages look like a static hero.
const PEEK = 26;

// A single horizontally-swipeable hero zone holding every confirmed
// account, not just the first — the previous version only ever rendered
// homeData.accounts[0], leaving every other bank reachable solely via a
// "View all N accounts" text link to the Cards tab. This keeps the "one
// hero zone" hierarchy (still a single card-shaped area at the top of
// Home) while actually surfacing every account.
export function AccountCarousel({
  accounts,
  // How far this carousel has been pulled past the page's right gutter by
  // its parent. The single-card case has to give that width back, and the
  // page dots have to stay centred on the visible page, not on the bled box.
  bleedRight = 0,
}: {
  accounts: HomeAccount[];
  bleedRight?: number;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const onLayout = (event: LayoutChangeEvent) =>
    setContainerWidth(event.nativeEvent.layout.width);

  if (accounts.length === 1) {
    return (
      <View style={{ marginRight: bleedRight }}>
        <AccountCard account={accounts[0]!} />
      </View>
    );
  }

  // Each page is the card plus its gutter, so snapping lands the next card
  // exactly where the current one was.
  const cardWidth = containerWidth > 0 ? containerWidth - bleedRight - PEEK : 0;
  const pageWidth = cardWidth + homeSpacing.sm;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.max(0, Math.min(index, accounts.length - 1)));
  };

  return (
    <View onLayout={onLayout} className="w-full">
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={pageWidth > 0 ? pageWidth : undefined}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingRight: PEEK + bleedRight }}
      >
        {accounts.map((account, index) => (
          <View
            key={account.key}
            style={{
              width: cardWidth || undefined,
              flexGrow: cardWidth ? 0 : 1,
              marginRight: index === accounts.length - 1 ? 0 : homeSpacing.sm,
            }}
          >
            <AccountCard account={account} />
          </View>
        ))}
      </ScrollView>

      {/* The active dot takes the current bank's own colour, so the
          indicator is part of the same identity the card is showing. */}
      <View className="mt-3 flex-row items-center justify-center gap-1.5" style={{ marginRight: bleedRight }}>
        {accounts.map((account, index) => (
          <View
            key={account.key}
            style={{
              height: 6,
              width: index === activeIndex ? 20 : 6,
              borderRadius: 3,
              backgroundColor:
                index === activeIndex ? account.bankColor || hp.ink : hp.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
