import { useLocalSearchParams } from "expo-router";

import { SubscriptionDetailScreen } from "@/features/home-preview/screens/subscription-detail-screen";

export default function SubscriptionDetailRoute() {
  const { key } = useLocalSearchParams<{ key: string | string[] }>();
  const subscriptionKey = Array.isArray(key) ? (key[0] ?? "") : (key ?? "");
  return <SubscriptionDetailScreen subscriptionKey={subscriptionKey} />;
}
