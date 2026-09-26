import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductDetailLoading, ProductDetailMessage } from "../components/product-detail";
import { SubscriptionDetail } from "../components/subscription-detail";
import { useSubscriptionDetail } from "../hooks/use-subscription-detail";

export function SubscriptionDetailScreen({ subscriptionKey }: { subscriptionKey: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, value: subscription, error } = useSubscriptionDetail(subscriptionKey);
  const back = () => router.back();

  if (status === "loading") {
    return <ProductDetailLoading topInset={insets.top} onBack={back} />;
  }

  if (status === "error") {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={back}
        title="Couldn't load this subscription"
        body={error ?? "Go back and open it again."}
      />
    );
  }

  if (status === "not-found" || subscription === null) {
    return (
      <ProductDetailMessage
        topInset={insets.top}
        onBack={back}
        title="Subscription not found"
        body="It may have been removed since this screen was opened."
      />
    );
  }

  return <SubscriptionDetail subscription={subscription} onBack={back} topInset={insets.top} />;
}
