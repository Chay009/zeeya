import { createMalanaEngine, type MalanaResult } from "@zeeya/parser/malana";
import { PermissionsAndroid, Platform } from "react-native";
import SmsAndroid from "react-native-get-sms-android";
import { buildInboxFilter, type InboxFilterOptions } from "./sms-filter";

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

export async function hasSmsReadPermission(): Promise<boolean> {
  if (!isSmsReadSupported()) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}

export async function hasSmsReceivePermission(): Promise<boolean> {
  if (!isSmsReadSupported()) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
}

export async function hasSmsCapturePermissions(): Promise<boolean> {
  const [canRead, canReceive] = await Promise.all([
    hasSmsReadPermission(),
    hasSmsReceivePermission(),
  ]);
  return canRead && canReceive;
}

export async function requestSmsReadPermission(): Promise<boolean> {
  if (!isSmsReadSupported()) return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: "Allow Zeeya to read messages",
    message: "Zeeya reads financial SMS on this device to build your budget dashboard.",
    buttonPositive: "Allow",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestSmsCapturePermissions(): Promise<boolean> {
  if (!isSmsReadSupported()) return false;
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
  ]);
  return (
    results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
    results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED
  );
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
export function readSmsInbox(options: InboxFilterOptions = {}): Promise<RawSms[]> {
  return new Promise((resolve, reject) => {
    // Filter construction itself is a pure function in lib/sms-filter.ts —
    // see that module's own comment for why (unit-testable there, where
    // this whole file cannot be imported under Vitest at all).
    const filter = JSON.stringify(buildInboxFilter(options));
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
