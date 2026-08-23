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
// app's expected per-user scale. `since`/`until`, when given, are passed
// through as the native module's own `minDate`/`maxDate` filters
// (confirmed against its Java source: both are inclusive per-row `date >=`
// / `date <=` checks applied before maxCount truncation) — omitting them
// reads the whole inbox, same as before these parameters existed.
//
// `indexFrom` is a genuine offset into the since/until-*filtered* result
// set (confirmed against the same Java source: it's a position counter
// `c` that only increments on a filter match, checked before maxCount
// truncation) — this is what makes real multi-page draining possible
// (db/inbox-pagination.ts) without relying on message timestamps at all,
// unlike an earlier version of this pagination that moved the `since`
// boundary itself and broke whenever messages were packed more tightly
// than its overlap window.
//
// `order` controls which end of a maxCount-truncated result survives: it
// matters whenever a caller bounds this by `since`/`until` and the
// matching message count could exceed `maxCount` (see db/sync.ts's and
// db/backfill.ts's own comments on why an oldest-vs-newest choice here is
// a correctness question, not a cosmetic one, once a checkpoint or a
// bounded range is involved).
export function readSmsInbox(
  options: {
    maxCount?: number;
    since?: number;
    until?: number;
    indexFrom?: number;
    order?: "newest-first" | "oldest-first";
  } = {},
): Promise<RawSms[]> {
  return new Promise((resolve, reject) => {
    const filter = JSON.stringify({
      box: "inbox",
      maxCount: options.maxCount ?? 5000,
      minDate: options.since,
      maxDate: options.until,
      indexFrom: options.indexFrom,
      // A `date`-only ORDER BY has no defined tiebreak among rows sharing
      // one timestamp — separate ContentResolver.query() calls (each page
      // is its own query, see db/inbox-pagination.ts) aren't guaranteed to
      // return tied rows in the same relative order every time. Without a
      // stable secondary key, equal-timestamp rows could shuffle between
      // pages across two calls to this same paginated read, getting
      // skipped or duplicated at the page boundary even though `indexFrom`
      // itself is a real, correct offset. `_id` — the content provider's
      // own unique row id (already read elsewhere in this file) — is
      // stable and unique per message, so appending it as a secondary sort
      // key makes the full ordering deterministic across repeated queries.
      sortOrder:
        (options.order ?? "newest-first") === "newest-first"
          ? "date DESC, _id DESC"
          : "date ASC, _id ASC",
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
