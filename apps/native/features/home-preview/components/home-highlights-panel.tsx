import type { ReactElement } from "react";
import { View } from "react-native";

import { EnterTransition } from "@/components/native-ui/enter-transition";
import type { HomeHighlights } from "@/lib/dashboard-data";
import type { BillDue } from "@/lib/message-insights";

import type { PreviewSub } from "../data";
import { ComingUpTimeline } from "./coming-up-timeline";
import { ErrorHighlights, LoadingHighlights } from "./home-highlights/loading-error";
import type { InsightsBudget } from "./home-highlights/insights-card";
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
  showToday = true,
  bills = [],
}: {
  /** Bills, EMIs and premiums due, from the user's messages. */
  bills?: readonly BillDue[];
  /** False where today's movement is already shown (Home's balance card line). */
  showToday?: boolean;
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
      {showToday ? (
        <EnterTransition index={0}>
          <TodaySummary
            data={highlights}
            onSeeActivity={onSeeActivity}
            onSelectTransaction={onSelectTransaction}
          />
        </EnterTransition>
      ) : null}
      {afterToday ? <EnterTransition index={1}>{afterToday}</EnterTransition> : null}
      <EnterTransition index={afterToday ? 2 : 1}>
        {/* One commitment timeline: bills confirmed by message and estimated
            subscription charges, date-ordered (was two pair cards). */}
        <ComingUpTimeline
          highlights={highlights}
          bills={bills}
          subscriptionPreviewItems={subscriptionPreviewItems}
          onOpenUpcoming={onOpenUpcoming}
          onOpenSubscriptions={onOpenSubscriptions}
        />
      </EnterTransition>
    </View>
  );
}
