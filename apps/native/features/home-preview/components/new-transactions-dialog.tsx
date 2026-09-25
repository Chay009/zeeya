import { View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { NativeBottomSheet } from "@/components/native-ui/native-bottom-sheet";
import { useNativeUiColors } from "@/components/native-ui/theme";

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
  const colors = useNativeUiColors();

  return (
    <NativeBottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => !open && onDismiss()}
      title={total === 1 ? "1 new transaction" : `${total} new transactions`}
      description="Zeeya caught up with your latest financial activity."
    >
      <View style={{ gap: 4 }}>
        {transactions.slice(0, 8).map((transaction, index) => (
          <View
            key={transaction.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingVertical: 10,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.ink }}
            >
              {transaction.name}
            </Text>
            {transaction.amount && (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: transaction.direction === "income" ? colors.accent : colors.ink,
                }}
              >
                {transaction.amount}
              </Text>
            )}
          </View>
        ))}
        {total > 8 && (
          <Text style={{ marginTop: 4, fontSize: 12, color: colors.muted }}>
            +{total - 8} more in Recent activity
          </Text>
        )}
      </View>
    </NativeBottomSheet>
  );
}
