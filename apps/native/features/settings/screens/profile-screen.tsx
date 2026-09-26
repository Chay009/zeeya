import { useRouter } from "expo-router";
import { Avatar, Button, ListGroup, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { AppIcon, type AppIconName } from "@/components/icon";
import { useFloatingTabBarClearance } from "@/components/floating-tab-bar";
import { useDashboardSync } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { useThemeColors } from "@/components/ui/theme";
import { seedSampleTransactions } from "@/db/dev-seed";
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
      Alert.alert("Couldn't seed sample data", error instanceof Error ? error.message : String(error));
    } finally {
      setSeeding(false);
    }
  };

  const accountSummary =
    accountScopeCounts.status === "ready"
      ? accountScopeCounts.confirmedCount === 0
        ? "No confirmed balance accounts"
        : `${accountScopeCounts.confirmedCount} confirmed balance account${accountScopeCounts.confirmedCount === 1 ? "" : "s"}`
      : "Loading confirmed accounts…";

  const detectedSummary =
    accountScopeCounts.status === "ready"
      ? accountScopeCounts.detectedCount === 0
        ? "No pending account identities"
        : accountScopeCounts.detectedCount === 1
          ? "1 detected identity"
          : `${accountScopeCounts.detectedCount} detected identities`
      : "Loading detected identities…";

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: Math.max(insets.top, 18),
        paddingBottom: tabBarClearance,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between">
        <View style={{ width: 40 }} />
        <Text className="text-title font-extrabold text-foreground">Profile</Text>
        <Button
          isIconOnly
          variant="tertiary"
          size="sm"
          accessibilityLabel="Refresh profile data"
          onPress={() => void onRefresh()}
        >
          <AppIcon name="reload" size={19} color={colors.ink} />
        </Button>
      </View>

      <View className="mt-6 items-center">
        <Avatar size="lg">
          <Avatar.Fallback>
            <AppIcon name="user" size={30} color={colors.ink} />
          </Avatar.Fallback>
        </Avatar>
        <Text className="mt-3 text-title font-extrabold text-foreground">Your profile</Text>
        <Text className="mt-1 text-caption text-muted">Zeeya data and app settings</Text>
      </View>

      <SettingsGroup
        title="ACCOUNT"
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
            description: accountSummary,
            onPress: () => router.push("/cards"),
          },
          {
            icon: "receipt",
            title: "Recent activity",
            description: "Review real imported transactions and message details",
            onPress: () => router.navigate("/activity"),
          },
          {
            icon: "alert",
            title: "Detected identities",
            description: detectedSummary,
            onPress: () => router.push("/cards"),
          },
        ]}
      />

      <SettingsGroup
        title="APP"
        links={[
          {
            icon: "wrench",
            title: "Dashboard dev",
            description: "Open the preserved developer dashboard",
            onPress: () => router.push("/dashboard-dev"),
          },
          {
            icon: "reload",
            title: "Refresh data",
            description: "Read the latest available inbox data on this device",
            onPress: () => void onRefresh(),
          },
          ...(__DEV__
            ? [
                {
                  icon: "wrench" as AppIconName,
                  title: seeding ? "Seeding sample data…" : "Seed sample data (dev)",
                  description:
                    "Ingest realistic SMS (recurring subs → due soon, tied largest today, this-week charts). Safe to tap again.",
                  onPress: () => void seedSampleData(),
                },
              ]
            : []),
        ]}
      />

      <Surface variant="secondary" className="mt-6 flex-row items-start gap-2 rounded-tile p-3">
        <AppIcon name="lock" size={17} color={colors.inkSoft} />
        <Text className="flex-1 text-meta leading-4 text-muted">
          Your financial data is derived from the messages available on this device. Zeeya does not
          invent balances or activity when evidence is missing.
        </Text>
      </Surface>
    </ScrollView>
  );
}
