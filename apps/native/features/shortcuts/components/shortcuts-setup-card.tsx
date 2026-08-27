import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Pressable, Text, View } from "react-native";

const steps = [
  "In Shortcuts, create a Personal Automation triggered by Message.",
  "Choose Run Immediately, then add Zeeya's Import Financial Message action.",
  "Set Message to Shortcut Input's Content, Sender to Shortcut Input's Sender, and Received At to Current Date. Do not manually rerun the automation for the same message.",
];

export function ShortcutsSetupCard() {
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
        <Ionicons name="flash-outline" size={22} color="#176b4d" />
        <Text style={{ color: "#173d30", fontSize: 17, fontWeight: "800" }}>
          Apple Shortcuts capture
        </Text>
      </View>
      <Text style={{ color: "#526b60", fontSize: 13, lineHeight: 20, marginTop: 10 }}>
        iOS does not let apps read your Messages history. A one-time Personal Automation can save
        each new financial message securely for Zeeya; its content remains on this device.
      </Text>
      <View style={{ gap: 9, marginTop: 14 }}>
        {steps.map((step, index) => (
          <View key={step} style={{ flexDirection: "row", gap: 9 }}>
            <Text style={{ color: "#176b4d", fontWeight: "800" }}>{index + 1}.</Text>
            <Text style={{ color: "#526b60", flex: 1, fontSize: 13, lineHeight: 19 }}>{step}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => void openShortcuts()}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#176b4d",
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
