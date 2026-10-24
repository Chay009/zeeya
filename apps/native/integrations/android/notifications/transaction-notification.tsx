import { Column, Text } from "@expo/ui/jetpack-compose";
import { paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createCustomNotification } from "expo-widgets";

type TransactionNotice = { count: number };

// Runs in Expo's isolated widget runtime. Only count data crosses this boundary.
export const TransactionNotification = createCustomNotification(
  "ZeeyaTransactionNotification",
  (props: TransactionNotice) => {
    "widget";
    const title = props.count === 1 ? "New transaction detected" : "New transactions detected";
    return {
      collapsed: (
        <Column modifiers={[paddingAll(8)]}>
          <Text style={{ fontSize: 14, fontWeight: "bold" }}>{title}</Text>
          <Text style={{ fontSize: 12 }}>{`${props.count} added to Zeeya`}</Text>
        </Column>
      ),
      expanded: (
        <Column verticalArrangement={{ spacedBy: 6 }} modifiers={[paddingAll(12)]}>
          <Text style={{ fontSize: 11, fontWeight: "bold" }}>ZEEYA · ACTIVITY</Text>
          <Text style={{ fontSize: 18, fontWeight: "bold" }}>{title}</Text>
          <Text>{`${props.count} new ${props.count === 1 ? "transaction was" : "transactions were"} added.`}</Text>
          <Text style={{ fontSize: 12 }}>Tap to view transactions</Text>
        </Column>
      ),
      headsUp: (
        <Column modifiers={[paddingAll(8)]}>
          <Text style={{ fontSize: 14, fontWeight: "bold" }}>{title}</Text>
          <Text style={{ fontSize: 12 }}>Tap to open Zeeya</Text>
        </Column>
      ),
    };
  },
);

export async function postTransactionNotification(count: number, channelId: string): Promise<void> {
  await TransactionNotification.post(
    { count },
    {
      id: "zeeya-financial-activity",
      channelId,
      title: count === 1 ? "New transaction detected" : "New transactions detected",
      text: `${count} new ${count === 1 ? "transaction was" : "transactions were"} added to Zeeya.`,
      url: "zeeya://activity",
      ongoing: false,
      autoCancel: true,
    },
  );
}
