import { useIncomingShare } from "expo-sharing";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { AppText as Text } from "@/components/app-text";
import { MessageArrived } from "@/components/art/message-arrived";
import { useAppTheme } from "@/contexts/app-theme-context";
import { currentLocalMessageTime, importSharedMessage } from "./import-shared-message";

export function ShareImportScreen() {
  const { isDark } = useAppTheme();
  const { sharedPayloads, clearSharedPayloads } = useIncomingShare();
  const payload = sharedPayloads.length === 1 ? sharedPayloads[0] : null;
  const isTextShare = payload?.shareType === "text";
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => currentLocalMessageTime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputStyle = {
    borderWidth: 1,
    borderColor: isDark ? "#57575c" : "#b4b4b9",
    backgroundColor: isDark ? "#27272a" : "#ffffff",
    color: isDark ? "#fafafa" : "#18181b",
    borderRadius: 10,
    padding: 12,
  } as const;

  useEffect(() => {
    setBody(isTextShare ? payload.value : "");
    setError(null);
  }, [isTextShare, payload?.value]);

  function dismiss() {
    if (saving) return;
    clearSharedPayloads();
    router.replace("/");
  }

  async function save() {
    if (saving || !isTextShare) return;
    setSaving(true);
    setError(null);
    try {
      await importSharedMessage({ sender, body, receivedAt });
      clearSharedPayloads();
      router.replace("/(tabs)/activity");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 18 }}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: isDark ? "#18181b" : "#f7f7f8" }}
    >
      <View style={{ alignItems: "center" }}>
        <MessageArrived size={96} />
      </View>
      <Text className="text-foreground" style={{ fontSize: 24, fontWeight: "700" }}>
        Import a financial message
      </Text>
      <Text className="text-muted-foreground">
        Review the text before saving it on this device. Zeeya does not upload the message.
      </Text>
      {!isTextShare ? (
        <Text className="text-foreground" accessibilityRole="alert">
          {sharedPayloads.length === 0
            ? "No shared message is available. Share text from your Messages app to Zeeya."
            : "Share one plain-text message at a time. Files, links and multiple items are not supported."}
        </Text>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text className="text-foreground" style={{ fontWeight: "600" }}>
              SMS sender
            </Text>
            <TextInput
              value={sender}
              onChangeText={setSender}
              placeholder="For example, VM-HDFCBK"
              autoCapitalize="characters"
              maxLength={80}
              style={inputStyle}
              placeholderTextColor={isDark ? "#a1a1aa" : "#71717a"}
              accessibilityLabel="SMS sender"
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text className="text-foreground" style={{ fontWeight: "600" }}>
              Message time
            </Text>
            <TextInput
              value={receivedAt}
              onChangeText={setReceivedAt}
              placeholder="YYYY-MM-DD HH:mm"
              autoCapitalize="none"
              style={inputStyle}
              placeholderTextColor={isDark ? "#a1a1aa" : "#71717a"}
              accessibilityLabel="Message time, year month day hour minute"
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text className="text-foreground" style={{ fontWeight: "600" }}>
              Message text
            </Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={4096}
              textAlignVertical="top"
              style={[inputStyle, { minHeight: 150 }]}
              accessibilityLabel="Shared message text"
            />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: "#b42318" }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: isDark ? "#f5ece5" : "#18181b",
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: isDark ? "#18181b" : "white",
                textAlign: "center",
                fontWeight: "700",
              }}
            >
              {saving ? "Importing…" : "Import message"}
            </Text>
          </Pressable>
        </>
      )}
      <Pressable
        onPress={dismiss}
        disabled={saving}
        accessibilityRole="button"
        style={{ padding: 12, opacity: saving ? 0.5 : 1 }}
      >
        <Text className="text-foreground" style={{ textAlign: "center" }}>
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}
