import { Column, Text } from "@expo/ui/jetpack-compose";
import {
  background,
  cornerRadius,
  fillMaxSize,
  paddingAll,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import {
  INITIAL_OVERVIEW_SNAPSHOT,
  type OverviewWidgetSnapshot,
} from "../../shared/widgets/overview-snapshot";

const OverviewWidget = (props: OverviewWidgetSnapshot, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const foreground = dark ? "#F9FAFB" : "#18231F";
  const muted = dark ? "#ADB9B2" : "#56635D";
  const updatedAt = props.updatedAt;
  const ready = typeof updatedAt === "number";

  return (
    <Column
      verticalArrangement={{ spacedBy: 6 }}
      modifiers={[
        fillMaxSize(),
        cornerRadius(24),
        background(dark ? "#18231F" : "#F1F6F2"),
        paddingAll(16),
      ]}
    >
      <Text style={{ fontSize: 13, fontWeight: "bold" }} color={muted}>
        ZEEYA
      </Text>
      <Text style={{ fontSize: 22, fontWeight: "bold" }} color={foreground} maxLines={2}>
        {ready ? `${props.activeSubscriptionCount} active subscriptions` : "Open Zeeya"}
      </Text>
      <Text style={{ fontSize: 14 }} color={muted}>
        {ready ? `${props.accountCount} accounts tracked` : "Your overview will appear here"}
      </Text>
      <Text style={{ fontSize: 11 }} color={muted}>
        {ready ? `Saved ${new Date(updatedAt).toLocaleDateString()}` : "Tap to get started"}
      </Text>
    </Column>
  );
};

export default createWidget<OverviewWidgetSnapshot>(
  "ZeeyaOverviewWidget",
  OverviewWidget,
  INITIAL_OVERVIEW_SNAPSHOT,
);
