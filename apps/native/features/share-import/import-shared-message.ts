import { ingestSmsBatch } from "@/db/ingestion";
import { withIngestionLock } from "@/db/single-flight";
import { publishMessageSync } from "@/features/capabilities/message-sync-events";

export interface SharedMessageDraft {
  sender: string;
  body: string;
  receivedAt: string; // Local YYYY-MM-DD HH:mm, confirmed by the user.
}

export function currentLocalMessageTime(now = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function parseLocalMessageTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.getTime();
}

export function validatedSharedMessage(draft: SharedMessageDraft): {
  id: string;
  sender: string;
  body: string;
  date: number;
} {
  const sender = draft.sender.trim();
  const body = draft.body.trim();
  const date = parseLocalMessageTime(draft.receivedAt);

  if (!sender || sender.length > 80) throw new Error("Enter the SMS sender (up to 80 characters).");
  if (!body || body.length > 4096) throw new Error("Enter one message (up to 4,096 characters).");
  if (date === null) throw new Error("Enter the message time as YYYY-MM-DD HH:mm.");
  if (date > Date.now() + 5 * 60_000) throw new Error("The message time cannot be in the future.");

  // An incoming share has no trustworthy SMS-provider ID. The ledger's
  // sender/date/body fingerprint is its identity; do not invent a provider ID.
  return { id: "", sender, body, date };
}

export async function importSharedMessage(draft: SharedMessageDraft): Promise<number> {
  const message = validatedSharedMessage(draft);
  const result = await withIngestionLock(() =>
    ingestSmsBatch([message], { advanceCheckpoint: false, recordArrival: false }),
  );
  if (result.inserted > 0) publishMessageSync();
  return result.inserted;
}
