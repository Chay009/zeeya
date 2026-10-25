import "@/global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppStatusBar } from "@/components/app-status-bar";
import { AppThemeProvider } from "@/contexts/app-theme-context";
import { DatabaseProvider } from "@/db/provider";
import { CapabilityProvider } from "@/features/capabilities/provider";
import "@/features/capabilities/background/task";
import { DashboardSyncProvider } from "@/features/dashboard/hooks/dashboard-sync-provider";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { appFontsToLoad } from "@/lib/fonts";
import { queryClient } from "@/utils/trpc";

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

const STACK_SCREEN_OPTIONS = { freezeOnBlur: true } as const;

function StackLayout() {
  return (
    // freezeOnBlur: the screens underneath a pushed detail screen (the whole
    // tab tree) stop re-rendering until they're visible again.
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="activity-detail/[id]"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="transaction-detail/[id]"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="backfill"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="cards" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard-dev" options={{ title: "Dashboard dev" }} />
      <Stack.Screen name="transaction/[id]" options={{ title: "Transaction" }} />
      <Stack.Screen name="subscriptions/index" options={{ headerShown: false }} />
      <Stack.Screen name="subscriptions/[key]" options={{ headerShown: false }} />
      <Stack.Screen name="import-shared-message" options={{ title: "Import shared message" }} />
    </Stack>
  );
}

export default function Layout() {
  // appFontsToLoad carries three kinds of font: Inter, which only Android
  // needs (iOS renders real SF Pro as its own OS default with no
  // fontFamily override — see lib/fonts.ts), plus Plus Jakarta Sans for money
  // and headings — the app's own display identity, which
  // BOTH platforms need since neither OS provides either. So both
  // platforms wait here — iOS's blocking load is small and happens once.
  const [fontsLoaded, fontError] = useFonts(appFontsToLoad);

  useEffect(() => {
    if (fontError) void SplashScreen.hideAsync();
  }, [fontError]);

  if (fontError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text accessibilityRole="alert">Unable to load app fonts. Please reopen the app.</Text>
        {__DEV__ ? <Text>{fontError.message}</Text> : null}
      </View>
    );
  }

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AppThemeProvider>
            <AppStatusBar />
            <HeroUINativeProvider>
              <DatabaseProvider>
                <DashboardSyncProvider>
                  <CapabilityProvider>
                    <OnboardingGate>
                      <StackLayout />
                    </OnboardingGate>
                  </CapabilityProvider>
                </DashboardSyncProvider>
              </DatabaseProvider>
            </HeroUINativeProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
