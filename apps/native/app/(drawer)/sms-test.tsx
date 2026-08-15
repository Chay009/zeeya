// Plumbing-test screen for on-device SMS parsing: request permission, read
// the inbox, run every message through Malana, show what comes out.
// Deliberately minimal — this proves the permission + native-read + parse
// pipeline works end to end; it's expected to be replaced by the real UI.
import { Card, Chip, useThemeColor } from "heroui-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Container } from "@/components/container";
import {
  isSmsReadSupported,
  type ParsedSms,
  parseInboxMessages,
  readSmsInbox,
  requestSmsReadPermission,
} from "@/lib/sms";

type Status = "idle" | "requesting" | "reading" | "parsing" | "done" | "denied" | "error";

export default function SmsTestScreen() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ParsedSms[]>([]);

  const mutedColor = useThemeColor("muted");
  const successColor = useThemeColor("success");
  const dangerColor = useThemeColor("danger");
  const foregroundColor = useThemeColor("foreground");

  const run = useCallback(async () => {
    setError(null);

    if (!isSmsReadSupported()) {
      setStatus("error");
      setError("SMS reading is Android-only — iOS blocks third-party SMS access entirely.");
      return;
    }

    setStatus("requesting");
    const granted = await requestSmsReadPermission();
    if (!granted) {
      setStatus("denied");
      return;
    }

    try {
      setStatus("reading");
      const raw = await readSmsInbox();
      setStatus("parsing");
      const parsed = parseInboxMessages(raw);
      setMessages(parsed);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const relevantCount = messages.filter((m) => m.result.category !== null).length;

  return (
    <Container className="p-6">
      <View className="py-4 mb-4">
        <Text className="text-2xl font-bold text-foreground mb-1">SMS Parse Test</Text>
        <Text className="text-muted text-sm">
          Reads your device's SMS inbox and runs every message through the Malana parser,
          on-device. Nothing is sent anywhere.
        </Text>
      </View>

      <Pressable
        className="bg-foreground py-3 px-4 rounded-lg self-start active:opacity-70 mb-4"
        onPress={run}
        disabled={status === "requesting" || status === "reading" || status === "parsing"}
      >
        <Text className="text-background font-medium">
          {status === "idle" && "Scan SMS Inbox"}
          {status === "requesting" && "Requesting permission…"}
          {status === "reading" && "Reading inbox…"}
          {status === "parsing" && "Parsing…"}
          {status === "done" && "Re-scan"}
          {status === "denied" && "Permission denied — tap to retry"}
          {status === "error" && "Retry"}
        </Text>
      </Pressable>

      {status === "denied" && (
        <Text style={{ color: dangerColor }} className="mb-4 text-sm">
          SMS permission was denied. This screen can't read your inbox without it.
        </Text>
      )}
      {status === "error" && error && (
        <Text style={{ color: dangerColor }} className="mb-4 text-sm">
          {error}
        </Text>
      )}
      {status === "done" && (
        <Text style={{ color: successColor }} className="mb-4 text-sm">
          Parsed {messages.length} messages — {relevantCount} recognized as bank/transaction
          related.
        </Text>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card variant="secondary" className="mb-3 p-3">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-foreground font-medium">{item.sender}</Text>
              {item.result.category && (
                <Chip size="sm" variant="secondary">
                  {item.result.category}
                </Chip>
              )}
            </View>
            <Text style={{ color: mutedColor }} className="text-xs mb-2" numberOfLines={2}>
              {item.body}
            </Text>
            {item.result.trxTypeRich && (
              <Text style={{ color: foregroundColor }} className="text-sm">
                {item.result.trxTypeRich} · {item.result.trx ?? "?"} {item.result.currency ?? ""}
                {item.result.merchantCategory ? ` · ${item.result.merchantCategory}` : ""}
                {item.result.isSpam ? " · flagged spam" : ""}
              </Text>
            )}
          </Card>
        )}
      />
    </Container>
  );
}
