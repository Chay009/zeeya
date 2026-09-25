import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { SubscriptionsList } from "../components/subscriptions-list";
import { useSubscriptionsCatalog } from "../hooks/use-subscriptions-catalog";
import type { PreviewSub } from "../data";

export function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { subscriptions, status, error, reload } = useSubscriptionsCatalog();

  const openDetail = (subscription: PreviewSub) => {
    router.push({ pathname: "/subscriptions/[key]", params: { key: subscription.key } });
  };

  if (status === "loading" && subscriptions.items.length === 0) {
    return <View className="flex-1 bg-background" style={{ paddingTop: insets.top }} />;
  }

  if (status === "error") {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Couldn't load subscriptions</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft" numberOfLines={3}>
          {error ?? "Try again in a moment."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={reload}
          className="mt-4 rounded-pill bg-ink-deep px-4 py-2"
        >
          <Text className="text-caption font-extrabold text-on-ink">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SubscriptionsList
      onBack={() => router.back()}
      onSelect={openDetail}
      topInset={insets.top}
      subscriptions={subscriptions}
    />
  );
}
