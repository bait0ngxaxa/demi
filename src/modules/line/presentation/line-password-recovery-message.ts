import "server-only";

import type { LineFlexMessage } from "../adapters/line-messaging-client";
import { notificationCard } from "./flex/notification-card";

/** Today's recovery Push text; the URL is on its own line. */
export function linePasswordRecoveryText(recoveryUrl: string): string {
  return `ตั้งรหัสผ่าน DEMI ใหม่ได้จากลิงก์นี้ ลิงก์ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว\n${recoveryUrl}\nหากคุณไม่ได้ขอ กรุณาติดต่อโรงพยาบาล`;
}

/**
 * ADR-0033: the recovery card. The Account LIFF recovery URL, which carries
 * the capability, appears only as the button URI: never in altText or any
 * text component.
 */
export function linePasswordRecoveryCard(recoveryUrl: string): LineFlexMessage {
  return notificationCard({
    tone: "warning",
    title: "ตั้งรหัสผ่านใหม่",
    fields: [],
    note: "ลิงก์ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว\nหากคุณไม่ได้ขอ กรุณาติดต่อโรงพยาบาล",
    action: { label: "ตั้งรหัสผ่านใหม่", uri: recoveryUrl },
    altText: "ลิงก์ตั้งรหัสผ่าน DEMI ใหม่",
  });
}
