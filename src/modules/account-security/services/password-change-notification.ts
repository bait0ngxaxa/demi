import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { LineMessagingClient } from "@/modules/line/adapters/line-messaging-client";

type PasswordChangeNotificationDatabase = Pick<PrismaClient, "lineAccountBinding">;
type LineMessageSender = (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }>;

export async function notifyPasswordChangeLineBindings(
  database: PasswordChangeNotificationDatabase,
  userId: string,
  now: Date,
  sendLineMessage?: LineMessageSender,
  audit?: { action: string; metadata?: Record<string, string> },
): Promise<void> {
  try {
    const bindings = await database.lineAccountBinding.findMany({
      where: { userId, unlinkedAt: null, lineUserId: { not: null } },
      select: { lineUserId: true },
    });
    if (bindings.length === 0) return;
    const message = `รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now)} หากไม่ใช่คุณ ติดต่อโรงพยาบาล`;
    const send = sendLineMessage ?? ((lineUserId: string, text: string, retryKey: string) => new LineMessagingClient().pushText(lineUserId, text, retryKey));
    for (const binding of bindings) {
      if (!binding.lineUserId) continue;
      const result = await send(binding.lineUserId, message, randomUUID()).catch(() => ({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }));
      try {
        await recordAuditEvent({
          actorUserId: null,
          action: audit?.action ?? "account.password_changed.line_notification",
          resourceType: "User",
          resourceId: userId,
          metadata: { ...audit?.metadata, outcome: result.kind },
        });
      } catch {
        console.error("Password changed but LINE notification audit could not be stored");
      }
    }
  } catch {
    console.error("Password changed but LINE notification could not be sent");
  }
}
