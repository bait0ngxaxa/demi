import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_CARD_LIMITS,
  NotificationCardContractError,
  notificationCard,
  type NotificationCardInput,
} from "./notification-card";

const BASE: NotificationCardInput = {
  tone: "info",
  title: "นัดหมายใหม่",
  fields: [
    { label: "ประเภท", value: "ติดตาม" },
    { label: "วันเวลา", value: "12 พ.ย. 2569 เวลา 09:30 น." },
  ],
  note: "เปิดดูรายละเอียดใน DEMI",
  action: { label: "ดูนัดหมาย", uri: "https://liff.line.me/1234567890-WorkSpace/app/personal/appointments" },
  altText: "นัดหมายใหม่: ติดตาม 12 พ.ย. 2569",
};

describe("ADR-0033 notification card", () => {
  it("renders the golden Flex message", () => {
    expect(notificationCard(BASE)).toEqual({
      type: "flex",
      altText: "นัดหมายใหม่: ติดตาม 12 พ.ย. 2569",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          backgroundColor: "#e5f0f4",
          contents: [{ type: "text", text: "นัดหมายใหม่", size: "lg", weight: "bold", color: "#315f74", wrap: true }],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "16px",
          contents: [
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "ประเภท", size: "sm", color: "#536b64", flex: 2, wrap: true },
                { type: "text", text: "ติดตาม", size: "sm", color: "#102620", flex: 5, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                { type: "text", text: "วันเวลา", size: "sm", color: "#536b64", flex: 2, wrap: true },
                { type: "text", text: "12 พ.ย. 2569 เวลา 09:30 น.", size: "sm", color: "#102620", flex: 5, wrap: true },
              ],
            },
            { type: "separator", margin: "md", color: "#d5e0dc" },
            { type: "text", text: "เปิดดูรายละเอียดใน DEMI", size: "sm", color: "#536b64", wrap: true, margin: "md" },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "12px",
          contents: [{
            type: "button",
            style: "primary",
            color: "#126759",
            height: "sm",
            action: { type: "uri", label: "ดูนัดหมาย", uri: "https://liff.line.me/1234567890-WorkSpace/app/personal/appointments" },
          }],
        },
      },
    });
  });

  it("is deterministic: the same input always serializes to identical JSON", () => {
    expect(JSON.stringify(notificationCard(BASE))).toBe(JSON.stringify(notificationCard({ ...BASE, fields: [...BASE.fields] })));
  });

  it.each([
    ["info", "#315f74", "#e5f0f4"],
    ["warning", "#805313", "#fff3d6"],
    ["danger", "#a23a3a", "#f9e8e8"],
    ["success", "#176b50", "#e0f1e9"],
  ] as const)("tints the %s header with DESIGN.md tokens", (tone, strong, soft) => {
    const header = notificationCard({ ...BASE, tone }).contents.header;
    expect(header?.backgroundColor).toBe(soft);
    expect(header?.contents[0]).toMatchObject({ color: strong });
  });

  it("omits the footer for a card without a button and uses only kilo/mega-era features", () => {
    const message = notificationCard({ ...BASE, action: undefined });
    expect(message.contents.footer).toBeUndefined();
    const json = JSON.stringify(message);
    for (const property of ["deca", "hecto", "scaling", "maxWidth", "maxHeight", "lineSpacing", "video", "image", "hero"]) {
      expect(json).not.toContain(`"${property}"`);
    }
    expect(["kilo", "mega"]).toContain(message.contents.size);
  });

  it("enforces altText presence, length and the no-URL rule", () => {
    expect(() => notificationCard({ ...BASE, altText: "" })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, altText: "ก".repeat(NOTIFICATION_CARD_LIMITS.altText + 1) })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, altText: "ก".repeat(NOTIFICATION_CARD_LIMITS.altText) })).not.toThrow();
    expect(() => notificationCard({ ...BASE, altText: "ดู https://liff.line.me/x" })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, altText: "ดู liff.line.me/x" })).toThrow(NotificationCardContractError);
  });

  it("enforces field count and label/value bounds", () => {
    const field = { label: "ป้าย", value: "ค่า" };
    expect(() => notificationCard({ ...BASE, fields: Array.from({ length: 6 }, () => field) })).not.toThrow();
    expect(() => notificationCard({ ...BASE, fields: Array.from({ length: 7 }, () => field) })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, fields: [{ label: "ก".repeat(21), value: "ค่า" }] })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, fields: [{ label: "ป้าย", value: "ก".repeat(121) }] })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, fields: [{ label: "ป้าย", value: " " }] })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, fields: [], note: undefined })).toThrow(NotificationCardContractError);
  });

  it("accepts only LIFF button URLs", () => {
    expect(() => notificationCard({ ...BASE, action: { label: "เปิด", uri: "https://demi.example.org/app" } })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, action: { label: "เปิด", uri: "http://liff.line.me/1-a" } })).toThrow(NotificationCardContractError);
    expect(() => notificationCard({ ...BASE, action: { label: "ก".repeat(21), uri: BASE.action?.uri ?? "" } })).toThrow(NotificationCardContractError);
  });

  it("keeps every valid card within the serialized size bound", () => {
    const largest = notificationCard({
      ...BASE,
      title: "ก".repeat(NOTIFICATION_CARD_LIMITS.title),
      fields: Array.from({ length: NOTIFICATION_CARD_LIMITS.fields }, () => ({
        label: "ก".repeat(NOTIFICATION_CARD_LIMITS.fieldLabel),
        value: "ก".repeat(NOTIFICATION_CARD_LIMITS.fieldValue),
      })),
      note: "ก".repeat(NOTIFICATION_CARD_LIMITS.note),
      altText: "ก".repeat(NOTIFICATION_CARD_LIMITS.altText),
    });
    expect(new TextEncoder().encode(JSON.stringify(largest)).length).toBeLessThanOrEqual(NOTIFICATION_CARD_LIMITS.serializedBytes);
  });
});
