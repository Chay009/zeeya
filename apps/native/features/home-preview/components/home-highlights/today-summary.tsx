import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Row, RowGroup } from "@/components/ui/list";
import { Money } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/states";
import { fromMinorUnits } from "@/lib/currency";
import type { HomeHighlights, TransactionSummary } from "@/lib/dashboard-data";

import { merchantVisual } from "../../data";

// Today: the day's net in the heading, then the latest few transactions in
// the shared row style. The biggest one is already visible by its amount —
// no separate banner competing for attention.

const VISIBLE = 3;

function transactionLabel(transaction: TransactionSummary): string {
  return transaction.brandName?.trim() || transaction.vendor?.trim() || transaction.category;
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function TodaySummary({
  data,
  onSeeActivity,
  onSelectTransaction,
}: {
  data: HomeHighlights;
  onSeeActivity?: () => void;
  onSelectTransaction?: (transactionId: string) => void;
}) {
  const today = data.today;
  const empty = today.transactionCount === 0 && today.recent.length === 0;
  const net = fromMinorUnits(today.netMinorUnits, data.currency);

  return (
    <Section
      title="Today"
      accessory={
        !empty ? (
          <View className="flex-row items-baseline gap-1">
            <Money
              value={Math.abs(net)}
              currency={data.currency}
              size="caption"
              tone={net > 0 ? "income" : "muted"}
              sign={net > 0 ? "income" : net < 0 ? "expense" : "none"}
            />
            <Text className="text-meta text-muted">net</Text>
          </View>
        ) : undefined
      }
    >
      {empty ? (
        <View className="rounded-card bg-card">
          <EmptyState compact icon="sparkles" title="Quiet day so far" body="Today's payments land here as they happen." />
        </View>
      ) : (
        <RowGroup>
          {today.recent.slice(0, VISIBLE).map((transaction) => {
            const name = transactionLabel(transaction);
            const visual = merchantVisual(
              transaction.brandName?.trim() || transaction.vendor?.trim() || "",
              transaction.category,
            );
            return (
              <TransactionRow
                key={transaction.id}
                name={name}
                subtitle={transaction.category}
                meta={timeLabel(transaction.date)}
                logo={{ letter: name.charAt(0).toUpperCase() || "?", tile: visual.tile, ink: visual.ink, img: visual.img }}
                amount={fromMinorUnits(transaction.amountMinorUnits, transaction.currency)}
                currency={transaction.currency}
                direction={transaction.direction}
                onPress={onSelectTransaction ? () => onSelectTransaction(transaction.id) : undefined}
              />
            );
          })}
          {today.transactionCount > VISIBLE && onSeeActivity ? (
            <Row
              onPress={onSeeActivity}
              title={<Text className="text-body font-medium text-accent-deep">See all {today.transactionCount} today</Text>}
              chevron
              className="min-h-[52px]"
            />
          ) : null}
        </RowGroup>
      )}
    </Section>
  );
}
