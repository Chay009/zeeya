import * as Linking from "expo-linking";
import { Pressable, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { AppIcon } from "@/components/icon";
import { useThemeColors } from "@/components/ui/theme";

const steps = [
  "In Shortcuts, create a Personal Automation triggered by Message.",
  "Choose Run Immediately, then add Zeeya's Import Financial Message action.",
  "Set Message to Shortcut Input's Content, Sender to Shortcut Input's Sender, and Received At to Current Date. Do not manually rerun the automation for the same message.",
];

export function ShortcutsSetupCard() {
  const colors = useThemeColors();
  const openShortcuts = async () => {
    await Linking.openURL("shortcuts://");
  };

  return (
    <View
      style={{
        backgroundColor: "#e8f7f0",
        borderRadius: 22,
        padding: 18,
        marginTop: 24,
        borderWidth: 1,
        borderColor: "#b9dfce",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <AppIcon name="flash" size={22} color={colors.accentDeep} />
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "800" }}>
          Apple Shortcuts capture
        </Text>
      </View>
      <Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 10 }}>
        iOS does not let apps read your Messages history. A one-time Personal Automation can save
        each new financial message securely for Zeeya; its content remains on this device.
      </Text>
      <View style={{ gap: 9, marginTop: 14 }}>
        {steps.map((step, index) => (
          <View key={step} style={{ flexDirection: "row", gap: 9 }}>
            <Text style={{ color: colors.accentDeep, fontWeight: "800" }}>{index + 1}.</Text>
            <Text style={{ color: colors.inkSoft, flex: 1, fontSize: 13, lineHeight: 19 }}>{step}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => void openShortcuts()}
        style={{
          alignSelf: "flex-start",
          backgroundColor: colors.accentDeep,
          paddingHorizontal: 18,
          paddingVertical: 11,
          borderRadius: 999,
          marginTop: 16,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>Open Shortcuts</Text>
      </Pressable>
    </View>
  );
}
