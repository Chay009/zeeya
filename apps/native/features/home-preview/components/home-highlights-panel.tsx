import type { ReactElement } from "react";
import { View } from "react-native";

import { EnterTransition } from "@/components/native-ui/enter-transition";
import { Section } from "@/components/ui/section";
import type { HomeHighlights } from "@/lib/dashboard-data";

import type { PreviewSub } from "../data";
import { ErrorHighlights, LoadingHighlights } from "./home-highlights/loading-error";
import type { InsightsBudget } from "./home-highlights/insights-card";
import { DueSoonCard, SubscriptionsPairCard } from "./home-highlights/pair-row";
import { TodaySummary } from "./home-highlights/today-summary";

// Home's middle band: Today → this week → what's coming up. The old
// one-row "Insights" card is gone — it repeated the Budget card below.

export function HomeHighlightsPanel({
  status,
  error,
  highlights,
  afterToday,
  subscriptionPreviewItems,
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
  /** @deprecated kept for call-site compatibility; the budget lives in BudgetCard. */
  budget?: InsightsBudget;
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
    <View>
      <EnterTransition index={0}>
        <TodaySummary
          data={highlights}
          onSeeActivity={onSeeActivity}
          onSelectTransaction={onSelectTransaction}
        />
      </EnterTransition>
      {afterToday ? <EnterTransition index={1}>{afterToday}</EnterTransition> : null}
      <EnterTransition index={afterToday ? 2 : 1}>
        <Section title="Coming up">
          <View className="flex-row items-stretch gap-3">
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
        </Section>
      </EnterTransition>
    </View>
  );
}
