import { Tabs } from "expo-router";

import { FloatingTabBar } from "@/components/floating-tab-bar";
import { NotificationActionRegistration } from "@/integrations/shared/notifications/notification-action-registration";
import { QuickActionRegistration } from "@/integrations/shared/quick-actions/quick-action-registration";

// Stable across renders, so the tab bar isn't re-created on each render.
const renderTabBar = (props: Parameters<typeof FloatingTabBar>[0]) => <FloatingTabBar {...props} />;

export default function TabsLayout() {
  return (
    <>
      <QuickActionRegistration />
      <NotificationActionRegistration />
      {/* Hidden tabs stop re-rendering until focused, then catch up with cached data. */}
      <Tabs
        tabBar={renderTabBar}
        screenOptions={{ headerShown: false, freezeOnBlur: true, lazy: true }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="activity" options={{ title: "Transactions" }} />
        <Tabs.Screen name="insights" options={{ title: "Analytics" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </>
  );
}
