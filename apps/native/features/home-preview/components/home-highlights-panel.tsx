import type { ReactElement } from "react";
import { View } from "react-native";

import { EnterTransition } from "@/components/native-ui/enter-transition";
import type { HomeHighlights } from "@/lib/dashboard-data";

import type { PreviewSub } from "../data";
import { ErrorHighlights, LoadingHighlights } from "./home-highlights/loading-error";
import { InsightsCard, type InsightsBudget } from "./home-highlights/insights-card";
import { DueSoonCard, SubscriptionsPairCard } from "./home-highlights/pair-row";
import { TodaySummary } from "./home-highlights/today-summary";

export function HomeHighlightsPanel({
  status,
  error,
  highlights,
  afterToday,
  subscriptionPreviewItems,
  budget,
  onRetry,
  onSeeActivity,
  onOpenUpcoming,
  onOpenSubscriptions,
  onSelectTransaction,
}: {
  status: "loading" | "ready" | "error";
  error: string | null;
  highlights: HomeHighlights | null;
  afterToday?: ReactElement | null;
  subscriptionPreviewItems: PreviewSub[];
  budget: InsightsBudget;
  onRetry: () => void;
  onSeeActivity: () => void;
  onOpenUpcoming: () => void;
  onOpenSubscriptions: () => void;
  onSelectTransaction?: (transactionId: string) => void;
}) {
  if (status === "loading" && highlights === null) return <LoadingHighlights />;
  if (status === "error" && highlights === null)
    return <ErrorHighlights error={error} onRetry={onRetry} />;
  if (highlights === null) return null;

  return (
    <View className="mt-1">
      <EnterTransition index={0}>
        <TodaySummary
          data={highlights}
          onSeeActivity={onSeeActivity}
          onSelectTransaction={onSelectTransaction}
        />
      </EnterTransition>
      {afterToday ? <EnterTransition index={1}>{afterToday}</EnterTransition> : null}
      <EnterTransition index={afterToday ? 2 : 1}>
        <InsightsCard budget={budget} />
      </EnterTransition>
      <EnterTransition index={afterToday ? 3 : 2}>
        <View className="mt-3 flex-row items-stretch gap-3">
          <View className="min-w-0 flex-1">
            <DueSoonCard data={highlights} onOpen={onOpenUpcoming} />
          </View>
          <View className="min-w-0 flex-1">
            <SubscriptionsPairCard
              data={highlights}
              previewItems={subscriptionPreviewItems}
              onOpen={onOpenSubscriptions}
            />
        </View>
        </View>
      </EnterTransition>
    </View>
  );
}
