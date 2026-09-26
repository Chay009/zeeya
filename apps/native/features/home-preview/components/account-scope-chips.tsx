import { PressableFeedback } from "heroui-native";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { tick } from "@/components/ui/motion";
import { useThemeColors } from "@/components/ui/theme";

import { ALL_ACCOUNTS_KEY, bankShortName, last4Label } from "../account-scope";
import type { HomeAccount } from "../data";
import { BrandLogo } from "./brand-logo";

// Account scope as a row of compact pills under the balance: selected is
// solid ink, the rest sit quietly on the fill. The trailing pill opens
// Cards & accounts.

function Pill({
  selected,
  onPress,
  accessibilityLabel,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        if (!selected) tick();
        onPress();
      }}
      className={`h-9 flex-row items-center gap-2 rounded-pill pl-1.5 pr-3.5 ${selected ? "bg-ink" : "bg-fill"}`}
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
}: {
  accounts: HomeAccount[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onOpenMore: () => void;
}) {
  const colors = useThemeColors();
  const allSelected = selectedKey === ALL_ACCOUNTS_KEY;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
    >
      <Pill selected={allSelected} onPress={() => onSelect(ALL_ACCOUNTS_KEY)} accessibilityLabel="All accounts">
        <View className={`h-6 w-6 items-center justify-center rounded-full ${allSelected ? "bg-on-ink/15" : "bg-card"}`}>
          <AppIcon name="card" size={13} color={allSelected ? colors.onInk : colors.ink} />
        </View>
        <Text className={`text-meta font-semibold ${allSelected ? "text-on-ink" : "text-ink"}`}>All</Text>
      </Pill>

      {accounts.map((account) => {
        const selected = selectedKey === account.key;
        return (
          <Pill
            key={account.key}
            selected={selected}
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
            <Text numberOfLines={1} className={`text-meta font-semibold ${selected ? "text-on-ink" : "text-ink"}`}>
              {bankShortName(account.bankName)}
            </Text>
            <Text numberOfLines={1} className={`text-meta ${selected ? "text-on-ink opacity-60" : "text-muted"}`}>
              {last4Label(account.last4)}
            </Text>
          </Pill>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage accounts"
        onPress={onOpenMore}
        className="h-9 w-9 items-center justify-center rounded-full bg-fill"
      >
        <AppIcon name="chevron-right" size={15} color={colors.inkSoft} />
      </Pressable>
    </ScrollView>
  );
}
