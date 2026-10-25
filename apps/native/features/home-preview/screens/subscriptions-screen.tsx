import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavBar } from "@/components/ui/header";
import { SCREEN_PADDING_X } from "@/components/ui/screen";
import { ErrorState, SkeletonHero, SkeletonRows } from "@/components/ui/states";
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
    return (
      <View className="flex-1 bg-background">
        <NavBar title="Subscriptions" onBack={() => router.back()} topInset={insets.top} />
        <View className="pt-2" style={{ paddingHorizontal: SCREEN_PADDING_X }}>
          <SkeletonHero />
          <View className="mt-6">
            <SkeletonRows count={4} />
          </View>
        </View>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View className="flex-1 bg-background">
        <NavBar title="Subscriptions" onBack={() => router.back()} topInset={insets.top} />
        <View className="flex-1 justify-center pb-24">
          <ErrorState title="Couldn't load subscriptions" body={error} onRetry={reload} />
        </View>
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
