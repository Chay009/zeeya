import { Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import {
  INITIAL_OVERVIEW_SNAPSHOT,
  type OverviewWidgetSnapshot,
} from "../../shared/widgets/overview-snapshot";

const OverviewWidget = (props: OverviewWidgetSnapshot, environment: WidgetEnvironment) => {
  "widget";
  const foreground = environment.colorScheme === "dark" ? "#F9FAFB" : "#18231F";
  const muted = environment.colorScheme === "dark" ? "#ADB9B2" : "#56635D";
  const updatedAt = props.updatedAt;
  const ready = typeof updatedAt === "number";

  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 10 })]}>
      <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(muted)]}>ZEEYA</Text>
      <Text modifiers={[font({ size: 22, weight: "bold" }), foregroundStyle(foreground)]}>
        {ready ? `${props.activeSubscriptionCount} active subscriptions` : "Open Zeeya"}
      </Text>
      <Text modifiers={[font({ size: 14 }), foregroundStyle(muted)]}>
        {ready ? `${props.accountCount} accounts tracked` : "Your overview will appear here"}
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>
        {ready ? `Saved ${new Date(updatedAt).toLocaleDateString()}` : "Tap to get started"}
      </Text>
    </VStack>
  );
};

export default createWidget<OverviewWidgetSnapshot>(
  "ZeeyaOverviewWidget",
  OverviewWidget,
  INITIAL_OVERVIEW_SNAPSHOT,
);
