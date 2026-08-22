import { createMalanaEngine, type MalanaResult } from "@zeeya/parser/malana";
import { PermissionsAndroid, Platform } from "react-native";
import SmsAndroid from "react-native-get-sms-android";

export interface RawSms {
  id: string;
  sender: string;
  body: string;
  date: number;
}

export interface ParsedSms extends RawSms {
  result: MalanaResult;
}

// SMS inbox reading only exists on Android — iOS sandboxes SMS entirely and
// exposes no read API to third-party apps, so this is a hard platform limit,
// not something a library or permission can work around.
export function isSmsReadSupported(): boolean {
  return Platform.OS === "android";
}

export async function requestSmsReadPermission(): Promise<boolean> {
  if (!isSmsReadSupported()) return false;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: "Read SMS",
    message:
      "zeeya reads your bank and transaction messages on-device to build your transaction history. Your SMS content never leaves your phone.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// Reads the device's existing SMS inbox via the native content provider
// (react-native-get-sms-android). Defaults to 5,000 messages, matching this
// app's expected per-user scale. `since`, when given, is passed through as
// the native module's own `minDate` filter (confirmed against its Java
// source: it's an inclusive per-row `date >=` check applied before
// maxCount truncation) — omitting it here reads the whole inbox, same as
// before this parameter existed.
//
// `order` controls which end of a maxCount-truncated result survives: it
// matters whenever a caller bounds this by `since` and the matching
// message count could exceed `maxCount` (see db/sync.ts's own comment on
// why an oldest-vs-newest choice here is a correctness question, not a
// cosmetic one, once a checkpoint is involved).
export function readSmsInbox(
  options: { maxCount?: number; since?: number; order?: "newest-first" | "oldest-first" } = {},
): Promise<RawSms[]> {
  return new Promise((resolve, reject) => {
    const filter = JSON.stringify({
      box: "inbox",
      maxCount: options.maxCount ?? 5000,
      minDate: options.since,
      // Without an explicit sort order, the native module passes null
      // straight to ContentResolver.query() and which messages survive a
      // maxCount truncation is OS/OEM-defined.
      sortOrder: (options.order ?? "newest-first") === "newest-first" ? "date DESC" : "date ASC",
    });
    SmsAndroid.list(
      filter,
      (error) => reject(new Error(error)),
      (_count, smsListJson) => {
        const raw = JSON.parse(smsListJson) as Array<{
          _id: string;
          address: string;
          body: string;
          date: number;
        }>;
        resolve(raw.map((m) => ({ id: m._id, sender: m.address, body: m.body, date: m.date })));
      },
    );
  });
}

// Parses every message on-device through Malana. Every message is parsed —
// never skipped or filtered out beforehand (see the earlier decision to drop
// the pre-parse relevance gate: at this app's scale, a wrongly-skipped
// message means silently losing real transaction data, which is worse than
// a wrong label on a fully-parsed one).
export function parseInboxMessages(messages: RawSms[]): ParsedSms[] {
  const engine = createMalanaEngine();
  return messages.map((m) => ({
    ...m,
    result: engine.parse(m.body, m.sender),
  }));
}
