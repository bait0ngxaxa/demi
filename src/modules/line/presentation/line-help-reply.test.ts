import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_WEB_NAVIGATION_PATHS } from "../domain/line-navigation-intents";
import type { OperationalLineRole } from "../domain/line-types";
import { buildLineHelpReply, LINE_HELP_REPLY_COPY } from "./line-help-reply";

const origin = "https://demi.example.org";
const liffUrl = "https://liff.line.me/1234567890-AbCdEfGh";
const allowlistedUris = new Set([
  ...Object.values(LINE_WEB_NAVIGATION_PATHS).map((path) => new URL(path, origin).toString()),
  liffUrl,
]);

function actions(roles: readonly OperationalLineRole[]) {
  return buildLineHelpReply(roles).quickReply?.items.map(({ action }) => action) ?? [];
}

describe("LINE HELP reply", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", origin);
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives a Patient the appointment message action and the four Patient destinations", () => {
    const reply = buildLineHelpReply(["PATIENT"]);

    expect(reply.text).toBe("เลือกเมนูที่ต้องการด้านล่าง หรือพิมพ์ “นัด” เพื่อดูนัดหมายถัดไป");
    expect(actions(["PATIENT"])).toEqual([
      { type: "message", label: "ตรวจสอบนัดหมาย", text: "นัด" },
      { type: "uri", label: "นัดหมายทั้งหมด", uri: `${origin}/app/personal/appointments` },
      { type: "uri", label: "บันทึกสุขภาพ", uri: `${origin}/app/personal/wellness` },
      { type: "uri", label: "ยาของฉัน", uri: `${origin}/app/personal/medications` },
      { type: "uri", label: "ข้อมูลการดูแล", uri: `${origin}/app/personal/care` },
    ]);
  });

  it("gives OSM and Hospital accounts only their work entries and no appointment hint", () => {
    expect(buildLineHelpReply(["OSM"]).text).toBe("เลือกเมนูที่ต้องการด้านล่าง");
    expect(actions(["OSM"])).toEqual([
      { type: "uri", label: "ผู้ป่วยที่ดูแล", uri: `${origin}/app/patients/assigned` },
      { type: "uri", label: "คัดกรองผู้ป่วย", uri: `${origin}/app/patients/assigned?task=screening` },
      { type: "uri", label: "บันทึกติดตาม", uri: `${origin}/app/patients/assigned?task=followup` },
    ]);
    expect(buildLineHelpReply(["HOSPITAL"]).text).toBe("เลือกเมนูที่ต้องการด้านล่าง");
    expect(actions(["HOSPITAL"])).toEqual([
      { type: "uri", label: "งานโรงพยาบาล", uri: `${origin}/app` },
    ]);
  });

  it("combines every eligible role in canonical order within LINE quick-reply limits", () => {
    const combined = actions(["PATIENT", "OSM", "HOSPITAL"]);

    expect(buildLineHelpReply(["PATIENT", "OSM", "HOSPITAL"]).text).toBe(LINE_HELP_REPLY_COPY.PATIENT);
    expect(combined.map(({ label }) => label)).toEqual([
      "ตรวจสอบนัดหมาย", "นัดหมายทั้งหมด", "บันทึกสุขภาพ", "ยาของฉัน", "ข้อมูลการดูแล",
      "ผู้ป่วยที่ดูแล", "คัดกรองผู้ป่วย", "บันทึกติดตาม",
      "งานโรงพยาบาล",
    ]);
    expect(combined.length).toBeLessThanOrEqual(13);
    for (const action of combined) expect(action.label.length).toBeLessThanOrEqual(20);
  });

  it("uses the existing INELIGIBLE copy with only the account management link when no role is eligible", () => {
    const reply = buildLineHelpReply([]);

    expect(reply.text).toBe("ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู");
    expect(actions([])).toEqual([{ type: "uri", label: "จัดการบัญชี DEMI", uri: liffUrl }]);
  });

  it("replies with plain text and no links on infrastructure failure", () => {
    expect(buildLineHelpReply("INFRASTRUCTURE_FAILURE")).toEqual({
      type: "text",
      text: "ขณะนี้ยังแสดงเมนูไม่ได้ กรุณาลองใหม่ภายหลัง",
    });
  });

  it.each([
    [["PATIENT"]],
    [["OSM"]],
    [["HOSPITAL"]],
    [["PATIENT", "OSM", "HOSPITAL"]],
    [[]],
  ] as const)("only emits allowlisted fixed-intent URIs and the fixed appointment message for %j", (roles) => {
    for (const action of actions(roles)) {
      if (action.type === "uri") {
        expect(allowlistedUris.has(action.uri)).toBe(true);
        expect(action.uri).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|U[0-9a-f]{32}/iu);
      } else {
        expect(roles).toContain("PATIENT");
        expect(action).toStrictEqual({ type: "message", label: "ตรวจสอบนัดหมาย", text: "นัด" });
      }
    }
  });

  it("fails loudly when the account management link cannot be built", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "");

    expect(() => buildLineHelpReply([])).toThrow();
  });
});
