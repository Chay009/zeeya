import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "@/components/app-text";
import { SubscriptionDetail } from "../components/subscription-detail";
import { useSubscriptionDetail } from "../hooks/use-subscription-detail";

export function SubscriptionDetailScreen({ subscriptionKey }: { subscriptionKey: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, value: subscription, error } = useSubscriptionDetail(subscriptionKey);

  if (status === "loading") {
    return <View className="flex-1 bg-background" style={{ paddingTop: insets.top }} />;
  }

  if (status === "not-found" || subscription === null) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Subscription not found</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft">
          It may have been removed since this screen was opened.
        </Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-base font-bold text-ink">Couldn't load this subscription</Text>
        <Text className="mt-2 text-center text-caption text-muted-soft" numberOfLines={3}>
          {error ?? "Try going back and reopening the row."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="mt-4 rounded-pill bg-ink-deep px-4 py-2"
        >
          <Text className="text-caption font-extrabold text-on-ink">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SubscriptionDetail
      subscription={subscription}
      onBack={() => router.back()}
      topInset={insets.top}
    />
  );
}
