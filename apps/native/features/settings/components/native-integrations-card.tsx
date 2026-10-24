import { Button, Surface } from "heroui-native";
import { Alert, Linking, Platform } from "react-native";
import { AppText as Text } from "@/components/app-text";

/** OS-owned setup stays in the OS; no imitation widget picker or permissions. */
export function NativeIntegrationsCard() {
  const android = Platform.OS === "android";
  return (
    <Surface variant="secondary" className="mt-6 gap-4 rounded-card p-5">
      <Text className="text-title font-bold text-foreground">Outside the app</Text>
      <Text className="text-body font-bold text-foreground">Home Screen widget</Text>
      <Text className="text-caption leading-5 text-muted">
        {android
          ? "Touch and hold an empty area of your Home Screen, choose Widgets, then find Zeeya overview. Drag it onto your Home Screen."
          : "Touch and hold your Home Screen, tap Edit, then Add Widget. Search for Zeeya and choose an overview size."}{" "}
        Widgets show account and subscription counts, not balances or message text. Open Zeeya to
        refresh the saved overview.
      </Text>
      {!android ? (
        <>
          <Text className="text-body font-bold text-foreground">Lock Screen widget</Text>
          <Text className="text-caption leading-5 text-muted">
            Touch and hold your Lock Screen, choose Customize, then Add Widgets. Select Zeeya quick
            view. This is a saved overview, not a Live Activity.
          </Text>
        </>
      ) : null}
      <Text className="text-body font-bold text-foreground">App-icon shortcuts</Text>
      <Text className="text-caption leading-5 text-muted">
        Touch and hold the Zeeya icon to jump to transactions, analytics, or subscriptions.
        Available shortcuts depend on your launcher.
      </Text>
      <Text className="text-body font-bold text-foreground">Share a message</Text>
      <Text className="text-caption leading-5 text-muted">
        Share financial text from another app to Zeeya. Review it before importing; parsing and
        storage remain on this device.
      </Text>
      <Text className="text-body font-bold text-foreground">Notification appearance</Text>
      <Text className="text-caption leading-5 text-muted">
        Enable transaction notifications above. Expand a notification to see its full layout. Lock
        Screen visibility, sound, and banners are controlled by your device settings.
      </Text>
      <Button
        variant="tertiary"
        onPress={() =>
          void Linking.openSettings().catch(() => {
            Alert.alert(
              "Couldn't open device settings",
              "Open Settings on your device and find Zeeya under Apps.",
            );
          })
        }
      >
        Open device settings
      </Button>
    </Surface>
  );
}
