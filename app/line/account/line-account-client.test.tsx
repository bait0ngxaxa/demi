import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LineAccountClient, LineAccountScreen } from "./line-account-client";

const emptyStatus = {
  reachability: null,
  menuState: null,
  cleanupState: null,
};

function renderScreen(
  initial: Parameters<typeof LineAccountScreen>[0]["initial"],
  state: Partial<Omit<Parameters<typeof LineAccountScreen>[0], "initial" | "confirmationRef">> = {},
): string {
  return renderToStaticMarkup(
    <LineAccountScreen
      initial={initial}
      accountStatus={state.accountStatus ?? initial.status}
      canUnlink={state.canUnlink ?? initial.canUnlink}
      liffState={state.liffState ?? "UNAVAILABLE"}
      view={state.view ?? "READY"}
      message={state.message ?? ""}
      providerWarning={state.providerWarning ?? false}
      successMessage={state.successMessage ?? ""}
      confirmationRef={createRef<HTMLButtonElement>()}
      onStartLineLogin={() => undefined}
      onBeginLink={() => undefined}
      onBeginUnlink={() => undefined}
      onConfirmLink={() => undefined}
      onConfirmUnlink={() => undefined}
      onCancel={() => undefined}
      onRestart={() => undefined}
    />,
  );
}

describe("LINE account foundation UI", () => {
  it.each([
    ["FRIEND", "เพิ่ม DEMI เป็นเพื่อนแล้ว"],
    ["NOT_FRIEND", "ยังไม่ได้เพิ่ม DEMI เป็นเพื่อน หรือบัญชีอาจบล็อก DEMI อยู่"],
    ["UNKNOWN", "ยังยืนยันสถานะ LINE ไม่ได้"],
  ] as const)("explains %s reachability accurately", (reachability, wording) => {
    const markup = renderScreen({ ...emptyStatus, status: "LINKED", canUnlink: true, reachability });
    expect(markup).toContain(wording);
  });

  it.each(["PENDING", "UNKNOWN", "UNAVAILABLE", "MISMATCH"] as const)("shows unresolved %s cleanup after authoritative unlink", (cleanupState) => {
    const markup = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false, cleanupState, reachability: "UNKNOWN" });
    expect(markup).toContain("ยกเลิกการเชื่อมต่อแล้ว แต่ยังปรับปรุงเมนู LINE ไม่สำเร็จ");
    expect(markup).not.toContain("ยืนยันยกเลิกการเชื่อมต่อ</button>");
  });
  it("shows the existing DEMI sign-in flow to an unauthenticated visitor", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient initial={{ ...emptyStatus, status: "UNAUTHENTICATED", canUnlink: false }} liffId={null} publicOrigin="" />,
    );
    expect(markup).toContain("กรุณาเข้าสู่ระบบ DEMI ก่อนจัดการบัญชี LINE");
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain("ยืนยันเชื่อมบัญชี");
  });

  it("keeps the link action unavailable while LIFF is loading", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient initial={{ ...emptyStatus, status: "UNLINKED", canUnlink: false }} liffId="1234567890-AbCdEfGh" publicOrigin="https://demi.example.org" />,
    );
    expect(markup).toContain("กำลังเตรียมการเชื่อมต่อ LINE");
    expect(markup).not.toContain("เชื่อมบัญชี LINE นี้</button>");
  });

  it("keeps account management available without advertising an ineligible workspace", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient initial={{ ...emptyStatus, status: "INELIGIBLE", canUnlink: true }} liffId={null} publicOrigin="" />,
    );
    expect(markup).toContain("บัญชี DEMI นี้ยังไม่พร้อมใช้งาน");
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
    expect(markup).not.toContain("พื้นที่ส่วนตัว");
    expect(markup).toContain("min-h-12");
    expect(markup).toContain("focus-visible:outline-focus-ring");
    expect(markup).toContain("max-w-xl");
  });

  it("does not offer self-service unlink to a non-ACTIVE DEMI account", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient initial={{ ...emptyStatus, status: "INELIGIBLE", canUnlink: false }} liffId={null} publicOrigin="" />,
    );
    expect(markup).not.toContain("ยกเลิกการเชื่อมต่อ LINE</button>");
  });

  it("renders self-service unlink after a successful link updates client state", () => {
    const markup = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { accountStatus: "LINKED", canUnlink: true },
    );
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
  });

  it("renders the ready-to-link action only after LIFF is ready", () => {
    const markup = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, { liffState: "READY" });
    expect(markup).toContain("เชื่อมบัญชี LINE นี้");
    expect(markup).toContain("px-4");
    expect(markup).toContain("w-full max-w-xl");
    expect(markup).not.toContain("พื้นที่ส่วนตัว");
    expect(markup).not.toContain("ตรวจสอบนัดหมาย");
  });

  it("renders explicit link and unlink confirmations with focusable actions", () => {
    const link = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { view: "LINK_CONFIRM", liffState: "READY" },
    );
    expect(link).toContain("ยืนยันบัญชีที่เปิดอยู่");
    expect(link).toContain("บัญชี LINE ที่กำลังเปิดอยู่นี้จะเชื่อมกับบัญชี DEMI");
    expect(link).toContain("ยืนยันเชื่อมบัญชี");
    expect(link).toContain("focus-visible:outline-focus-ring");

    const unlink = renderScreen(
      { ...emptyStatus, status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "APPLIED" },
      { view: "UNLINK_CONFIRM" },
    );
    expect(unlink).toContain("ยกเลิกการเชื่อมต่อบัญชี LINE?");
    expect(unlink).toContain("เมนู LINE จะหยุดใช้กับบัญชี DEMI นี้ทันที");
    expect(unlink).toContain("การยกเลิกไม่ลบบัญชี DEMI");
    expect(unlink).toContain("ยืนยันยกเลิกการเชื่อมต่อ");
  });

  it("shows truthful linked status, provider reconciliation warning and success state", () => {
    const linked = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "UNKNOWN",
      menuState: "UNAVAILABLE",
    });
    expect(linked).toContain("บัญชี LINE เชื่อมกับบัญชี DEMI นี้แล้ว");
    expect(linked).toContain("เมนู LINE อาจยังไม่พร้อม");
    expect(linked).toContain("ยกเลิกการเชื่อมต่อ LINE");

    const success = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { view: "SUCCESS", successMessage: "ยกเลิกการเชื่อมต่อบัญชี LINE แล้ว", providerWarning: true },
    );
    expect(success).toContain("ยกเลิกการเชื่อมต่อบัญชี LINE แล้ว");
    expect(success).toContain("การปรับปรุงเมนู LINE อาจใช้เวลา");
    expect(success).toContain('role="status"');
  });

  it("renders only privacy-safe failure copy and keeps the screen readable on mobile", () => {
    const markup = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { view: "FAILURE", message: "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ กรุณาตรวจสอบบัญชีและลองใหม่" },
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("เริ่มรายการใหม่");
    expect(markup).not.toContain("LINE_USER_ID");
    expect(markup).not.toContain("National ID");
    expect(markup).toContain("px-4");
    expect(markup).toContain("max-w-xl");
    expect(markup).toContain("min-h-12");
  });
});
