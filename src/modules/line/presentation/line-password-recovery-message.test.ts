import { describe, expect, it } from "vitest";

import type { LineFlexComponent } from "../adapters/line-messaging-client";
import { linePasswordRecoveryCard, linePasswordRecoveryText } from "./line-password-recovery-message";

const CAPABILITY = "0f8e7d6c-5b4a-4392-8a1b-0c9d8e7f6a5b";
const URL = `https://liff.line.me/1234567890-AbCdEf/recover?capability=${CAPABILITY}`;

function texts(components: readonly LineFlexComponent[] | undefined): string[] {
  return (components ?? []).flatMap((component) =>
    component.type === "text" ? [component.text] : component.type === "box" ? texts(component.contents) : []);
}

describe("ADR-0033 LINE password recovery message", () => {
  it("keeps today's text byte for byte", () => {
    expect(linePasswordRecoveryText(URL)).toBe(
      `ตั้งรหัสผ่าน DEMI ใหม่ได้จากลิงก์นี้ ลิงก์ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว\n${URL}\nหากคุณไม่ได้ขอ กรุณาติดต่อโรงพยาบาล`,
    );
  });

  it("puts the recovery URL only in the button URI", () => {
    const card = linePasswordRecoveryCard(URL);
    expect(card.altText).toBe("ลิงก์ตั้งรหัสผ่าน DEMI ใหม่");
    const visible = [card.altText, ...texts(card.contents.header?.contents), ...texts(card.contents.body?.contents), ...texts(card.contents.footer?.contents)];
    for (const text of visible) {
      expect(text).not.toContain(CAPABILITY);
      expect(text).not.toMatch(/https?:|liff\.line\.me|capability/u);
    }
    expect(texts(card.contents.header?.contents)).toEqual(["ตั้งรหัสผ่านใหม่"]);
    expect(texts(card.contents.body?.contents)).toEqual(["ลิงก์ใช้ได้ 15 นาทีและใช้ได้ครั้งเดียว\nหากคุณไม่ได้ขอ กรุณาติดต่อโรงพยาบาล"]);
    expect(card.contents.footer?.contents).toEqual([
      { type: "button", style: "primary", color: "#126759", height: "sm", action: { type: "uri", label: "ตั้งรหัสผ่านใหม่", uri: URL } },
    ]);
    expect(JSON.stringify(card).split(CAPABILITY)).toHaveLength(2);
  });

  it("refuses a recovery link that is not a LIFF URL", () => {
    expect(() => linePasswordRecoveryCard(`https://demi.example.org/recover?capability=${CAPABILITY}`)).toThrow();
  });
});
