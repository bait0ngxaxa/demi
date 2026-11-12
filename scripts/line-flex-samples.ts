import type { LineMessage } from "@/modules/line/adapters/line-messaging-client";
import { notificationCard } from "@/modules/line/presentation/flex/notification-card";
import { buildNotificationLiffUrl } from "@/modules/line/services/line-deep-link-builder";

/**
 * ADR-0033: one synthetic sample of every Flex notification type, for
 * `npm run line:flex:validate`. No database, no real person: every value is
 * invented. Builders read the configured Workspace LIFF so LINE validates the
 * exact button URLs production would send.
 */
export type LineFlexSample = { readonly name: string; readonly build: () => LineMessage };

export const LINE_FLEX_SAMPLES: readonly LineFlexSample[] = [
  {
    name: "generic-card",
    build: () => notificationCard({
      tone: "info",
      title: "ตัวอย่างการแจ้งเตือน",
      fields: [{ label: "ประเภท", value: "ตัวอย่าง" }],
      note: "ข้อความตัวอย่างสำหรับตรวจรูปแบบ",
      action: { label: "เปิด DEMI", uri: buildNotificationLiffUrl("OPEN_WORK_WORKSPACE") },
      altText: "ตัวอย่างการแจ้งเตือน",
    }),
  },
];
