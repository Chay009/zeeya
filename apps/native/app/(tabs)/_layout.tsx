import { Tabs } from "expo-router";

import { FloatingTabBar } from "@/components/floating-tab-bar";

// Stable across renders, so the tab bar isn't handed a new render function
// (and re-created) every time the layout renders.
const renderTabBar = (props: Parameters<typeof FloatingTabBar>[0]) => <FloatingTabBar {...props} />;

export default function TabsLayout() {
  return (
    // freezeOnBlur: a tab you're not looking at stops rendering (react-native-
    // screens freezes its subtree) instead of re-rendering on every live data
    // update and running its animations in the background. It catches up —
    // with the latest cached data — the moment it's focused again.
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{ headerShown: false, freezeOnBlur: true, lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="activity" options={{ title: "Transactions" }} />
      <Tabs.Screen name="insights" options={{ title: "Analytics" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
