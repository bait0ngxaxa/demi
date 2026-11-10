import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";
const h = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("@line/liff", () => ({ default: { init: h.init } }));
import { LineDisconnectionNotice, LineRecoveryPanel, initializeLineAccountLiff } from "./line-recovery-panel";

const status = (state: LineDisconnectionStatus["state"], outcome: LineDisconnectionStatus["obligations"][number]["status"]): LineDisconnectionStatus => ({ state, canRelink: state === "REMOTE_CONFIRMED" || state === "RECOVERY_RELEASED_UNVERIFIED", obligations: [{ id: "f3333333-3333-4333-a333-333333333333", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "DEMI ทดสอบ", status: outcome }] });
describe("Thai bounded Recovery/status UX", () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
  it("shows local-only success and one recovery continuation without claiming provider success", () => {
    const html = renderToStaticMarkup(<LineRecoveryPanel status={status("RECOVERY_REQUIRED", "REMOTE_UNCONFIRMED")} liffId="1234567890-test" publicOrigin="https://demi.example.org" onReload={() => undefined} />);
    expect(html).toContain("หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว"); expect(html).toContain("ยังยืนยันการถอนสิทธิ์ LINE ไม่ได้");
    expect(html).toContain("ตรวจสอบเพื่อเชื่อมใหม่"); expect(html).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
    expect(html).toContain('<details>'); expect(html).toContain('aria-busy="false"');
  });
  it("pending status has an explicit refresh and no permanent spinner", () => {
    const html = renderToStaticMarkup(<LineRecoveryPanel status={status("PENDING", "REMOTE_UNCONFIRMED")} liffId={null} publicOrigin="" onReload={() => undefined} />);
    expect(html).toContain("กำลังรอผลการถอนสิทธิ์จาก LINE"); expect(html).toContain("ตรวจสอบสถานะอีกครั้ง"); expect(html).not.toContain("กำลังตรวจสอบ…");
  });
  it("labels confirmed removal only for actually confirmed obligations", () => {
    const selected = status("RECOVERY_REQUIRED", "REMOTE_UNCONFIRMED"); selected.obligations.push({ id: "e3333333-3333-4333-a333-333333333333", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "DEMI อีกแอป", status: "REMOTE_CONFIRMED" });
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={selected} />);
    expect(html).toContain("<li>DEMI ทดสอบ</li>"); expect(html).toContain("DEMI อีกแอป: LINE ยืนยันถอนสิทธิ์แล้ว");
    expect(html).not.toContain("LINE ยืนยันการถอนสิทธิ์ของแอปที่เกี่ยวข้องแล้ว");
  });
  it("preserves the distinction between release and provider confirmation", () => {
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={status("RECOVERY_RELEASED_UNVERIFIED", "RECOVERY_RELEASED_UNVERIFIED")} />);
    expect(html).toContain("การถอนสิทธิ์เดิมจาก LINE ยังไม่ยืนยัน"); expect(html).toContain("เริ่มเชื่อมบัญชีใหม่ได้");
    expect(html).not.toContain("REMOTE_CONFIRMED"); expect(html).not.toContain("RECOVERY_RELEASED_UNVERIFIED");
  });
  it("full confirmation does not conflate Rich Menu cleanup and LINE removal", () => {
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={status("REMOTE_CONFIRMED", "REMOTE_CONFIRMED")} />);
    expect(html).toContain("LINE ยืนยันการถอนสิทธิ์ของแอปที่เกี่ยวข้องแล้ว"); expect(html).not.toContain("เมนู");
  });
  it("groups mixed historical outcomes without treating recovery release as confirmation", () => {
    const selected = status("RECOVERY_REQUIRED", "PENDING");
    selected.obligations.push({ ...selected.obligations[0], id: "old", status: "RECOVERY_RELEASED_UNVERIFIED" });
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={selected} />);
    expect(html).toContain("ยังไม่ยืนยันการถอนสิทธิ์");
    expect(html).toContain("ผ่านการตรวจสอบเพื่อเชื่อมใหม่ แต่ยังไม่ยืนยันการถอนสิทธิ์");
    expect(html).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
  });
  it("omits an empty history disclosure", () => {
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={{ state: "NONE", canRelink: true, obligations: [] }} />);
    expect(html).not.toContain("<details"); expect(html).toContain("ยังไม่มีรายการถอนสิทธิ์ LINE");
  });
  it.each(["PENDING", "OBSERVED", "REMOTE_UNCONFIRMED", "REMOTE_CONFIRMED", "PROVEN_ABSENT", "RECOVERY_RELEASED_UNVERIFIED"] as const)("retains a single %s record under its descriptive group", (outcome) => {
    const html = renderToStaticMarkup(<LineDisconnectionNotice status={status("RECOVERY_REQUIRED", outcome)} />);
    expect(html.match(/<li>/gu)).toHaveLength(1);
    expect(html.match(/<h3 /gu)).toHaveLength(1);
    expect(html).toContain("DEMI ทดสอบ"); expect(html).not.toContain("<details open");
    expect(html).not.toContain("f3333333"); expect(html).not.toContain("b0000000");
    if (outcome !== "REMOTE_CONFIRMED") expect(html).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
  });
  it("bounds a stalled SDK initialization without authorizing anything", async () => {
    vi.useFakeTimers(); h.init.mockReturnValue(new Promise(() => undefined));
    const pending = initializeLineAccountLiff("1234567890-test"); const rejected = expect(pending).rejects.toThrow("ยังยืนยันไม่ได้");
    await vi.advanceTimersByTimeAsync(10000); await rejected;
  });
});
