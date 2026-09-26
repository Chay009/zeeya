import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";
import { Row, RowGroup } from "@/components/ui/list";

import type { NewTransactionSummary } from "../data";

export function NewTransactionsDialog({
  transactions,
  total = transactions.length,
  onDismiss,
}: {
  transactions: NewTransactionSummary[];
  total?: number;
  onDismiss: () => void;
}) {
  const isOpen = transactions.length > 0;

  return (
    <NativeBottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => !open && onDismiss()}
      title={total === 1 ? "1 new transaction" : `${total} new transactions`}
      description="Caught up with your latest activity."
    >
      <RowGroup variant="transparent" inset={0} className="rounded-none">
        {transactions.slice(0, 8).map((transaction) => (
          <Row
            key={transaction.key}
            className="min-h-[52px] px-0"
            title={transaction.name}
            trailing={
              transaction.amount ? (
                <Text
                  className={`text-body font-semibold ${
                    transaction.direction === "income" ? "text-positive" : "text-ink"
                  }`}
                >
                  {transaction.amount}
                </Text>
              ) : undefined
            }
          />
        ))}
      </RowGroup>
      {total > 8 ? (
        <View className="pt-2">
          <Text className="text-caption text-muted">+{total - 8} more in Transactions</Text>
        </View>
      ) : null}
    </NativeBottomSheet>
  );
}
