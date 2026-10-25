import { useRouter } from "expo-router";
import { ListGroup, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { AppIcon, type AppIconName } from "@/components/icon";
import { LargeTitle } from "@/components/ui/header";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { useThemeColors } from "@/components/ui/theme";
import { seedSampleTransactions } from "@/db/dev-seed";
import { AccountCard } from "@/features/auth/components/account-card";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";

import { useAccountScopeCounts } from "../hooks/use-account-scope-counts";

type SettingsLink = {
  icon: AppIconName;
  title: string;
  description: string;
  onPress: () => void;
};

function SettingsGroup({ title, links }: { title: string; links: SettingsLink[] }) {
  const colors = useThemeColors();
  return (
    <View className="mt-6">
      <Text className="mb-2 text-caption font-bold text-foreground">{title}</Text>
      <ListGroup>
        {links.map((link) => (
          <ListGroup.Item key={link.title} onPress={link.onPress} accessibilityLabel={link.title}>
            <ListGroup.ItemPrefix>
              <AppIcon name={link.icon} size={19} color={colors.ink} />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{link.title}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={2}>
                {link.description}
              </ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </ListGroup.Item>
        ))}
      </ListGroup>
    </View>
  );
}

export function ProfileScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance();
  const router = useRouter();
  const { refreshing, onRefresh } = useDashboardSync();
  const accountScopeCounts = useAccountScopeCounts();
  const [seeding, setSeeding] = useState(false);

  const seedSampleData = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const result = await seedSampleTransactions();
      await onRefresh();
      Alert.alert(
        "Sample data added",
        `Inserted ${result.inserted} SMS message${result.inserted === 1 ? "" : "s"} with recurring bills, due-soon projections, and today's glance edge cases. Tap again to add another batch.`,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't seed sample data",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSeeding(false);
    }
  };

  const cardsDescription =
    accountScopeCounts.status === "ready"
      ? [
          accountScopeCounts.confirmedCount === 0
            ? "No accounts"
            : `${accountScopeCounts.confirmedCount} account${accountScopeCounts.confirmedCount === 1 ? "" : "s"}`,
          accountScopeCounts.detectedCount > 0
            ? `${accountScopeCounts.detectedCount} to confirm`
            : null,
        ]
          .filter((part) => part !== null)
          .join(", ")
      : "Loading accounts…";

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.muted}
            colors={[colors.ink]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: SCREEN_PADDING_X,
          paddingBottom: tabBarClearance,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitle title="You" topInset={insets.top} />

        <AccountCard />

        <SettingsGroup
          title="Account"
          links={[
            {
              icon: "shield",
              title: "Privacy & automation",
              description: "SMS access, sync, notifications, biometric lock, and screen protection",
              onPress: () => router.push("/settings"),
            },
            {
              icon: "card",
              title: "Cards & accounts",
              description: cardsDescription,
              onPress: () => router.push("/cards"),
            },
          ]}
        />

        <Surface variant="secondary" className="mt-6 flex-row items-start gap-2 rounded-tile p-3">
          <AppIcon name="lock" size={17} color={colors.inkSoft} />
          <Text className="flex-1 text-meta leading-4 text-muted">
            Zeeya only shows what the messages on this device support.
          </Text>
        </Surface>

        {__DEV__ ? (
          <SettingsGroup
            title="Developer"
            links={[
              {
                icon: "wrench",
                title: "Dashboard dev",
                description: "Open the preserved developer dashboard",
                onPress: () => router.push("/dashboard-dev"),
              },
              {
                icon: "wrench",
                title: seeding ? "Seeding sample data…" : "Seed sample data (dev)",
                description:
                  "Ingest realistic SMS (recurring subs → due soon, tied largest today, this-week charts). Safe to tap again.",
                onPress: () => void seedSampleData(),
              },
            ]}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
