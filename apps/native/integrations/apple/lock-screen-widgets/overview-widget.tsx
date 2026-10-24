import { Text, VStack } from "@expo/ui/swift-ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import {
  INITIAL_OVERVIEW_SNAPSHOT,
  type OverviewWidgetSnapshot,
} from "../../shared/widgets/overview-snapshot";

const LockScreenOverview = (props: OverviewWidgetSnapshot, environment: WidgetEnvironment) => {
  "widget";
  const ready = typeof props.updatedAt === "number";
  if (environment.widgetFamily === "accessoryInline") {
    return (
      <Text>{ready ? `Zeeya · ${props.activeSubscriptionCount} subscriptions` : "Open Zeeya"}</Text>
    );
  }
  if (environment.widgetFamily === "accessoryCircular") {
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 20, weight: "bold" })]}>
          {ready ? `${props.activeSubscriptionCount}` : "—"}
        </Text>
        <Text modifiers={[font({ size: 9 })]}>Active</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ weight: "bold" })]}>Zeeya</Text>
      <Text>{ready ? `${props.activeSubscriptionCount} active subscriptions` : "Open Zeeya"}</Text>
      <Text>{ready ? `${props.accountCount} accounts` : "To update your overview"}</Text>
    </VStack>
  );
};

export default createWidget<OverviewWidgetSnapshot>(
  "ZeeyaLockScreenWidget",
  LockScreenOverview,
  INITIAL_OVERVIEW_SNAPSHOT,
);
