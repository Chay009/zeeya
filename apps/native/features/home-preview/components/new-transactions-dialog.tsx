import { Dialog } from "heroui-native";
import { Text, View } from "react-native";

import type { NewTransactionSummary } from "../data";
import { hp } from "../theme";

export function NewTransactionsDialog({
  transactions,
  onDismiss,
}: {
  transactions: NewTransactionSummary[];
  onDismiss: () => void;
}) {
  const isOpen = transactions.length > 0;

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>
            {transactions.length === 1
              ? "1 new transaction"
              : `${transactions.length} new transactions`}
          </Dialog.Title>
          <Dialog.Description>
            Captured while you were away — here&apos;s what changed.
          </Dialog.Description>

          <View style={{ marginTop: 16, gap: 4 }}>
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
                  borderTopColor: hp.border,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 14, fontWeight: "700", color: hp.ink }}
                >
                  {transaction.name}
                </Text>
                {transaction.amount && (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: transaction.direction === "income" ? hp.emeraldDeep : hp.coral,
                    }}
                  >
                    {transaction.amount}
                  </Text>
                )}
              </View>
            ))}
            {transactions.length > 8 && (
              <Text style={{ marginTop: 4, fontSize: 12, color: hp.mutedSoft }}>
                +{transactions.length - 8} more in Recent activity
              </Text>
            )}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
