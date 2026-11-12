import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { isLineFlexMessagesEnabled } from "@/lib/env/server";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { LineMessagingClient, type LineFlexMessage } from "@/modules/line/adapters/line-messaging-client";
import { notificationCard } from "@/modules/line/presentation/flex/notification-card";

type PasswordChangeNotificationDatabase = Pick<PrismaClient, "lineAccountBinding">;
type LineMessageSender = (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }>;
type LineFlexMessageSender = (lineUserId: string, message: LineFlexMessage, retryKey: string) => Promise<{ kind: string }>;

export type PasswordChangeNotificationOptions = {
  /** Overrides DEMI_LINE_FLEX_MESSAGES_ENABLED (tests). */
  readonly flexMessages?: boolean;
  readonly sendLineFlexMessage?: LineFlexMessageSender;
};

/**
 * ADR-0033: the password-change notice as today's text and as a card. The
 * time is formatted once from `now`, so both forms are fixed before any send.
 * No button: the notice asks the user to contact the Hospital.
 */
export function passwordChangeLineNotificationMessages(now: Date): { text: string; card: LineFlexMessage } {
  const changedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now);
  return {
    text: `รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ ${changedAt} หากไม่ใช่คุณ ติดต่อโรงพยาบาล`,
    card: notificationCard({
      tone: "warning",
      title: "เปลี่ยนรหัสผ่านแล้ว",
      fields: [{ label: "เวลา", value: changedAt }],
      note: "หากไม่ใช่คุณ ติดต่อโรงพยาบาล",
      altText: "รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนแล้ว",
    }),
  };
}

export async function notifyPasswordChangeLineBindings(
  database: PasswordChangeNotificationDatabase,
  userId: string,
  now: Date,
  sendLineMessage?: LineMessageSender,
  audit?: { action: string; metadata?: Record<string, string> },
  options: PasswordChangeNotificationOptions = {},
): Promise<void> {
  try {
    const bindings = await database.lineAccountBinding.findMany({
      where: { userId, unlinkedAt: null, lineUserId: { not: null } },
      select: { lineUserId: true },
    });
    if (bindings.length === 0) return;
    const messages = passwordChangeLineNotificationMessages(now);
    const flexMessages = options.flexMessages ?? isLineFlexMessagesEnabled();
    const sendText = sendLineMessage ?? ((lineUserId: string, text: string, retryKey: string) => new LineMessagingClient().pushText(lineUserId, text, retryKey));
    const sendFlex = options.sendLineFlexMessage ??
      ((lineUserId: string, message: LineFlexMessage, retryKey: string) => new LineMessagingClient().pushMessages(lineUserId, [message], retryKey));
    for (const binding of bindings) {
      if (!binding.lineUserId) continue;
      const retryKey = randomUUID();
      const result = await (flexMessages
        ? sendFlex(binding.lineUserId, messages.card, retryKey)
        : sendText(binding.lineUserId, messages.text, retryKey)).catch(() => ({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }));
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
