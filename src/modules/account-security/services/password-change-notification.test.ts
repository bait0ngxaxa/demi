import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

import type { LineFlexComponent, LineFlexMessage } from "@/modules/line/adapters/line-messaging-client";

import { notifyPasswordChangeLineBindings, passwordChangeLineNotificationMessages } from "./password-change-notification";

const NOW = new Date("2026-10-25T03:00:00.000Z");

function texts(components: readonly LineFlexComponent[] | undefined): string[] {
  return (components ?? []).flatMap((component) =>
    component.type === "text" ? [component.text] : component.type === "box" ? texts(component.contents) : []);
}

function database(lineUserIds: string[]) {
  return { lineAccountBinding: { findMany: vi.fn(async () => lineUserIds.map((lineUserId) => ({ lineUserId }))) } } as never;
}

describe("ADR-0033 password-change notice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps today's text and shows the same time in a button-less card", () => {
    const { text, card } = passwordChangeLineNotificationMessages(NOW);
    const changedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(NOW);
    expect(text).toBe(`รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ ${changedAt} หากไม่ใช่คุณ ติดต่อโรงพยาบาล`);
    expect(card.altText).toBe("รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนแล้ว");
    expect(card.contents.footer).toBeUndefined();
    expect(texts(card.contents.header?.contents)).toEqual(["เปลี่ยนรหัสผ่านแล้ว"]);
    expect(texts(card.contents.body?.contents)).toEqual(["เวลา", changedAt, "หากไม่ใช่คุณ ติดต่อโรงพยาบาล"]);
    expect(JSON.stringify(passwordChangeLineNotificationMessages(NOW))).toBe(JSON.stringify({ text, card }));
  });

  it("sends today's text while Flex cards are disabled", async () => {
    const sendText = vi.fn(async () => ({ kind: "ACCEPTED" }));
    const sendFlex = vi.fn(async () => ({ kind: "ACCEPTED" }));
    await notifyPasswordChangeLineBindings(database([`U${"a".repeat(32)}`]), "user-1", NOW, sendText, undefined, {
      flexMessages: false,
      sendLineFlexMessage: sendFlex,
    });
    expect(sendFlex).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith(`U${"a".repeat(32)}`, passwordChangeLineNotificationMessages(NOW).text, expect.any(String));
  });

  it("sends the card to every linked LINE account while Flex cards are enabled", async () => {
    const sendText = vi.fn(async () => ({ kind: "ACCEPTED" }));
    const sendFlex = vi.fn<(lineUserId: string, message: LineFlexMessage, retryKey: string) => Promise<{ kind: string }>>(async () => ({ kind: "ACCEPTED" }));
    await notifyPasswordChangeLineBindings(database([`U${"a".repeat(32)}`, `U${"b".repeat(32)}`]), "user-1", NOW, sendText, undefined, {
      flexMessages: true,
      sendLineFlexMessage: sendFlex,
    });
    expect(sendText).not.toHaveBeenCalled();
    expect(sendFlex).toHaveBeenCalledTimes(2);
    expect(sendFlex.mock.calls[0]?.[1]).toEqual(passwordChangeLineNotificationMessages(NOW).card);
    expect(sendFlex.mock.calls[0]?.[2]).not.toBe(sendFlex.mock.calls[1]?.[2]);
  });
});
