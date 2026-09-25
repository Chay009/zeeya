import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";

import { ALL_ACCOUNTS_KEY, bankShortName, last4Label } from "../account-scope";
import type { HomeAccount } from "../data";
import { useHomePalette } from "../theme";
import { BrandLogo } from "./brand-logo";

export function AccountScopeChips({
  accounts,
  selectedKey,
  onSelect,
  onOpenMore,
}: {
  accounts: HomeAccount[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onOpenMore: () => void;
}) {
  const hp = useHomePalette();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-3"
      contentContainerStyle={{ gap: 8, paddingRight: 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selectedKey === ALL_ACCOUNTS_KEY }}
        onPress={() => onSelect(ALL_ACCOUNTS_KEY)}
        className={`min-h-[56px] justify-center rounded-tile px-3.5 py-2 ${
          selectedKey === ALL_ACCOUNTS_KEY ? "bg-accent" : "border border-border bg-card"
        }`}
      >
        <Text
          className={`text-caption font-extrabold ${
            selectedKey === ALL_ACCOUNTS_KEY ? "text-on-accent" : "text-ink"
          }`}
        >
          All
        </Text>
        <Text
          className={`mt-0.5 text-label ${
            selectedKey === ALL_ACCOUNTS_KEY ? "text-on-accent opacity-70" : "text-muted"
          }`}
        >
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </Text>
      </Pressable>

      {accounts.map((account) => {
        const selected = selectedKey === account.key;
        return (
          <Pressable
            key={account.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${account.bankName} ${last4Label(account.last4)}`}
            onPress={() => onSelect(account.key)}
            className={`min-h-[56px] min-w-[128px] flex-row items-center gap-2 rounded-tile px-3 py-2 ${
              selected ? "bg-accent" : "border border-border bg-card"
            }`}
          >
            <BrandLogo
              letter={account.bankName.charAt(0).toUpperCase() || "?"}
              tile={selected ? hp.card : hp.surfaceMuted}
              ink={selected ? hp.ink : hp.ink}
              img={account.bankIcon}
              size={28}
              radius={8}
              iconRatio={0.7}
            />
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className={`text-caption font-extrabold ${selected ? "text-on-accent" : "text-ink"}`}
              >
                {bankShortName(account.bankName)}
              </Text>
              <Text
                numberOfLines={1}
                className={`mt-0.5 text-label ${selected ? "text-on-accent opacity-70" : "text-muted"}`}
              >
                {last4Label(account.last4)}
              </Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage accounts"
        onPress={onOpenMore}
        className="h-[56px] w-[56px] items-center justify-center rounded-tile border border-border bg-card"
      >
        <AppIcon name="chevron-right" size={18} color={hp.inkSoft} />
      </Pressable>
    </ScrollView>
  );
}
