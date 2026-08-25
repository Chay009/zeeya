import { z } from "zod";

import type { Dashboard } from "../lib/dashboard";
import type { RawSms } from "../lib/sms";
import { ingestSmsBatch, loadDashboard } from "./ingestion";
import { withIngestionLock } from "./single-flight";

const ShortcutEnvelopeSchema = z.object({
  version: z.literal(1),
  id: z.string().trim().min(1),
  sender: z.string().default(""),
  body: z.string().min(1),
  receivedAt: z.number().int().nonnegative(),
  capturedAt: z.number().int().nonnegative(),
});

export interface PendingShortcutFile {
  fileName: string;
  contents: string;
}

export interface ShortcutMessageQueue {
  listPending(): Promise<PendingShortcutFile[]>;
  acknowledge(fileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
}

export interface RejectedShortcutMessage {
  fileName: string;
  reason: string;
}

export interface ShortcutDrainResult {
  dashboard: Dashboard;
  accepted: number;
  rejected: RejectedShortcutMessage[];
}

function decodePendingFile(
  file: PendingShortcutFile,
): { ok: true; message: RawSms } | { ok: false; rejection: RejectedShortcutMessage } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(file.contents);
  } catch {
    return {
      ok: false,
      rejection: { fileName: file.fileName, reason: "Shortcut message is not valid JSON." },
    };
  }

  const result = ShortcutEnvelopeSchema.safeParse(decoded);
  if (!result.success) {
    return {
      ok: false,
      rejection: {
        fileName: file.fileName,
        reason: "Shortcut message has an unsupported or malformed envelope.",
      },
    };
  }

  return {
    ok: true,
    message: {
      id: `shortcut:${result.data.id}`,
      sender: result.data.sender,
      body: result.data.body,
      date: result.data.receivedAt,
    },
  };
}

// This is the public iOS capture seam. The native adapter owns durable
// queue files; this operation owns validation, shared Malana ingestion,
// and acknowledgement. Keeping acknowledgement after ingest gives the
// handoff at-least-once delivery while the ledger's existing identity
// constraints make retries idempotent.
export function drainShortcutInbox(queue: ShortcutMessageQueue): Promise<ShortcutDrainResult> {
  return withIngestionLock(async () => {
    const files = await queue.listPending();
    const acceptedFiles: PendingShortcutFile[] = [];
    const rejectedFiles: Array<{
      file: PendingShortcutFile;
      rejection: RejectedShortcutMessage;
    }> = [];
    const messages: RawSms[] = [];
    const rejected: RejectedShortcutMessage[] = [];

    for (const file of files) {
      const decoded = decodePendingFile(file);
      if (!decoded.ok) {
        rejected.push(decoded.rejection);
        rejectedFiles.push({ file, rejection: decoded.rejection });
        continue;
      }
      acceptedFiles.push(file);
      messages.push(decoded.message);
    }

    for (const { file, rejection } of rejectedFiles) {
      try {
        await queue.quarantine(file.fileName);
      } catch (cause) {
        rejection.reason += ` Quarantine failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
    }

    if (messages.length > 0) {
      await ingestSmsBatch(messages, { advanceCheckpoint: false });
      for (const file of acceptedFiles) await queue.acknowledge(file.fileName);
    }

    return {
      dashboard: await loadDashboard(),
      accepted: messages.length,
      rejected,
    };
  });
}
