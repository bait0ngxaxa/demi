import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const liffMocks = vi.hoisted(() => ({
  closeWindow: vi.fn(),
}));

vi.mock("@line/liff", () => ({ default: liffMocks }));

import {
  LineAccountClient,
  LineAccountScreen,
  closeLineLiffWindow,
} from "./line-account-client";

const emptyStatus = {
  reachability: null,
  menuState: null,
  cleanupState: null,
};

type ScreenProps = Parameters<typeof LineAccountScreen>[0];

function renderScreen(
  initial: ScreenProps["initial"],
  state: Partial<Omit<ScreenProps, "initial" | "confirmationRef">> = {},
): string {
  return renderToStaticMarkup(
    <LineAccountScreen
      initial={initial}
      lifecycleReadiness={state.lifecycleReadiness ?? { state: "READY" }}
      relinkEligibility={state.relinkEligibility ?? "ELIGIBLE"}
      accountStatus={state.accountStatus ?? initial.status}
      canUnlink={state.canUnlink ?? initial.canUnlink}
      liffState={state.liffState ?? "READY"}
      isInClient={state.isInClient ?? true}
      friendshipSupported={state.friendshipSupported ?? false}
      canRefreshReachability={state.canRefreshReachability ?? false}
      reachabilityBusy={state.reachabilityBusy ?? false}
      friendshipBusy={state.friendshipBusy ?? false}
      friendshipWarning={state.friendshipWarning ?? false}
      view={state.view ?? "READY"}
      successAction={state.successAction ?? null}
      message={state.message ?? ""}
      providerWarning={state.providerWarning ?? false}
      confirmationRef={createRef<HTMLButtonElement>()}
      onStartLineLogin={() => undefined}
      onBeginLink={() => undefined}
      onBeginUnlink={() => undefined}
      onConfirmLink={() => undefined}
      onConfirmUnlink={() => undefined}
      onRequestFriendship={() => undefined}
      onRefreshReachability={() => undefined}
      onReturnToLine={() => undefined}
      onCancel={() => undefined}
      onRestart={() => undefined}
      onReload={() => undefined}
    />,
  );
}

describe("LINE account user experience", () => {
  it("creates the allowlisted DEMI return target from the unauthenticated account page", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNAUTHENTICATED", canUnlink: false }}
        liffId={null}
        publicOrigin=""
        lifecycleReadiness={{ state: "NOT_CHECKED" }}
      />,
    );

    expect(markup).toContain('href="/login?returnTo=%2Fline%2Faccount"');
    expect(markup).toContain("เข้าสู่ระบบ DEMI");
  });

  it("keeps account linking unavailable while LIFF is loading", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNLINKED", canUnlink: false }}
        liffId="1234567890-AbCdEfGh"
        publicOrigin="https://demi.example.org"
        lifecycleReadiness={{ state: "STAGED" }}
      />,
    );

    expect(markup).toContain("กำลังเตรียมการเชื่อมต่อ LINE");
    expect(markup).not.toContain("เชื่อมบัญชี LINE นี้</button>");
  });

  it("shows a ready linked account with return as the primary action and unlink secondary", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "APPLIED",
    }, { canRefreshReachability: true });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
    expect(markup).not.toContain("warning");
  });

  it("keeps a linked account successful while menu presentation is pending", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "UNKNOWN",
    }, { canRefreshReachability: true });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่");
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง");
    expect(markup).not.toContain("เมนู LINE อาจยังไม่พร้อม");
    expect(markup).not.toContain("UNKNOWN");
  });

  it("keeps unknown reachability secondary and offers an explicit check when tokens are available", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "UNKNOWN",
      menuState: "UNKNOWN",
    }, { canRefreshReachability: true });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("ยังยืนยันสถานะ LINE ไม่ได้");
  });

  it("keeps a failed friendship check from hiding the linked result", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "NOT_FRIEND",
      menuState: "UNKNOWN",
    }, { friendshipWarning: true, canRefreshReachability: true });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("บัญชีของคุณยังเชื่อมต่ออยู่");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
  });

  it("offers the LIFF friendship action and a bounded refresh for a linked non-friend", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "NOT_FRIEND",
      menuState: "UNKNOWN",
    }, { friendshipSupported: true, canRefreshReachability: true });

    expect(markup).toContain("เชื่อมบัญชีแล้ว แต่ต้องเพิ่ม DEMI เป็นเพื่อนก่อนจึงจะใช้เมนูส่วนตัวได้");
    expect(markup).toContain(">เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง</button>");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).not.toContain("MISMATCH");
  });

  it.each(["UNKNOWN", "APPLIED"] as const)("makes return the only primary completion action for FRIEND with menu %s", (menuState) => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState,
    }, {
      view: "SUCCESS",
      successAction: "LINK",
      providerWarning: menuState !== "APPLIED",
      canRefreshReachability: true,
    });

    expect(markup).toMatch(/<button[^>]*class="[^"]*bg-brand [^"]*">กลับไปที่ LINE<\/button>/u);
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง");
    expect(markup).not.toContain("เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).toContain(menuState === "APPLIED"
      ? "พร้อมใช้งานผ่าน LINE แล้ว"
      : "ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่");
  });

  it("shows the linked result and account controls for a DEMI account without an available LINE menu", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "INELIGIBLE",
      canUnlink: true,
    }, { canRefreshReachability: true, friendshipWarning: true });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("บัญชี DEMI นี้ยังไม่มีเมนู LINE ให้ใช้งานในขณะนี้");
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง");
    expect(markup).not.toContain("การเชื่อมต่อ LINE ล้มเหลว");
  });

  it("gives a later unlinked visit calm information when the default menu may still be updating", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
      cleanupState: "PENDING",
    }, { liffState: "READY" });

    expect(markup).toContain("เมนู LINE อาจใช้เวลาสักครู่ในการกลับสู่สถานะเริ่มต้น");
    expect(markup).not.toContain("PENDING");
    expect(markup).not.toContain("cleanup");
  });

  it("renders a dedicated successful link result without stale pre-link warnings", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
      reachability: "UNKNOWN",
      menuState: "UNKNOWN",
    }, {
      accountStatus: "LINKED",
      canUnlink: true,
      view: "SUCCESS",
      successAction: "LINK",
      providerWarning: true,
      friendshipWarning: true,
      canRefreshReachability: true,
    });

    expect(markup).toContain("เชื่อมบัญชี LINE สำเร็จ");
    expect(markup).toContain("บัญชี LINE นี้เชื่อมกับ DEMI เรียบร้อยแล้ว");
    expect(markup).toContain("ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("ยังยืนยันสถานะ LINE ไม่ได้");
    expect(markup).not.toContain("ยังตรวจสอบไม่สำเร็จ");
    expect(markup).not.toContain("เชื่อมบัญชีแล้ว แต่ต้องเพิ่ม DEMI เป็นเพื่อน");
    expect(markup).not.toContain("UNKNOWN");
    expect(markup).not.toContain("MISMATCH");
  });

  it("keeps link success clear and actionable when friendship is required", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "NOT_FRIEND",
      menuState: "UNKNOWN",
    }, {
      view: "SUCCESS",
      successAction: "LINK",
      friendshipSupported: true,
      providerWarning: true,
      canRefreshReachability: true,
      friendshipWarning: true,
    });

    expect(markup).toContain("เชื่อมบัญชี LINE สำเร็จ");
    expect(markup).toContain("บัญชี LINE นี้เชื่อมกับ DEMI เรียบร้อยแล้ว");
    expect(markup).toContain("เชื่อมบัญชีแล้ว แต่ต้องเพิ่ม DEMI เป็นเพื่อนก่อนจึงจะใช้เมนูส่วนตัวได้");
    expect(markup).toContain(">เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toMatch(/<button[^>]*class="[^"]*bg-brand [^"]*">เพิ่ม DEMI เป็นเพื่อน<\/button>/u);
    expect(markup).toMatch(/<button[^>]*class="[^"]*border-line-strong[^"]*">กลับไปที่ LINE<\/button>/u);
    expect(markup).not.toContain("ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("ระบบกำลังเตรียมเมนู LINE");
  });

  it("renders authoritative unlink success while menu reset may still be pending", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
      reachability: "UNKNOWN",
      cleanupState: "PENDING",
    }, {
      view: "SUCCESS",
      successAction: "UNLINK",
      providerWarning: true,
    });

    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว");
    expect(markup).toContain("บัญชี LINE นี้ไม่ได้เชื่อมกับบัญชี DEMI แล้ว");
    expect(markup).toContain("เมนู LINE อาจใช้เวลาสักครู่ในการกลับสู่สถานะเริ่มต้น");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).not.toContain("PENDING");
    expect(markup).not.toContain("UNKNOWN");
    expect(markup).not.toContain("provider");
    expect(markup).not.toContain("cleanup");
  });

  it("shows truthful instructions without trying to close an external browser", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "APPLIED",
    }, { isInClient: false });

    expect(markup).toContain("กลับไปที่แชท LINE เพื่อใช้งานต่อ");
    expect(markup).not.toContain(">กลับไปที่ LINE</button>");

    liffMocks.closeWindow.mockClear();
    closeLineLiffWindow(false);
    expect(liffMocks.closeWindow).not.toHaveBeenCalled();
  });

  it("calls the supported LIFF close action only after an explicit in-client action", () => {
    closeLineLiffWindow(true);
    expect(liffMocks.closeWindow).toHaveBeenCalledOnce();
  });

  it("gives unavailable account and LIFF states a retry action", () => {
    const accountUnavailable = renderScreen({
      ...emptyStatus,
      status: "UNAVAILABLE",
      canUnlink: false,
    });
    const liffUnavailable = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
    }, { liffState: "UNAVAILABLE" });

    expect(accountUnavailable).toContain("ยังโหลดข้อมูลไม่ได้");
    expect(accountUnavailable).toContain(">ลองอีกครั้ง</button>");
    expect(liffUnavailable).toContain("ยังเปิดการเชื่อมต่อ LINE ไม่ได้");
    expect(liffUnavailable).toContain(">ลองอีกครั้ง</button>");
  });

  it("keeps both link and unlink operations explicitly confirmed", () => {
    const link = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
    }, { view: "LINK_CONFIRM" });
    const unlink = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "APPLIED",
    }, { view: "UNLINK_CONFIRM" });

    expect(link).toContain("ยืนยันเชื่อมบัญชี");
    expect(link).toContain("บัญชี LINE ที่กำลังเปิดอยู่นี้จะเชื่อมกับบัญชี DEMI");
    expect(unlink).toContain("ยกเลิกการเชื่อมต่อบัญชี LINE?");
    expect(unlink).toContain("ยืนยันยกเลิกการเชื่อมต่อ");
  });

  it("keeps local unlink available and describes the remote uncertainty when readiness degrades", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "APPLIED",
    }, {
      lifecycleReadiness: { state: "DEGRADED", history: "PRESENT" },
      relinkEligibility: "UNVERIFIED",
    });

    expect(markup).toContain("เชื่อมต่อแล้ว");
    expect(markup).toContain("ยังหยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมได้จากปุ่มยกเลิกด้านบน");
    expect(markup).toContain(">ยกเลิกการเชื่อมต่อ LINE</button>");
    expect(markup).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
  });

  it("blocks Relink while historical eligibility is unavailable and offers retry", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
      cleanupState: "PENDING",
    }, {
      lifecycleReadiness: { state: "DEGRADED", history: "PRESENT" },
      relinkEligibility: "UNVERIFIED",
    });

    expect(markup).toContain("พบประวัติการถอนสิทธิ์เดิม แต่ขณะนี้ตรวจสอบเงื่อนไขการเชื่อมใหม่ไม่ได้");
    expect(markup).toContain("คุณยังเข้าสู่ระบบ DEMI ตามปกติได้");
    expect(markup).toContain(">ตรวจสอบสถานะอีกครั้ง</button>");
    expect(markup).not.toContain(">เชื่อมบัญชี LINE นี้</button>");
    expect(markup).not.toContain(">เข้าสู่ระบบ LINE</button>");
    expect(markup).not.toContain("ยังเริ่มการตรวจสอบเพื่อเชื่อมใหม่ได้");
  });

  it("keeps the staged path available only when the server marks Relink eligible", () => {
    const staged = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, {
      lifecycleReadiness: { state: "STAGED" },
      relinkEligibility: "ELIGIBLE",
    });
    const unknown = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, {
      lifecycleReadiness: { state: "DEGRADED", history: "UNKNOWN" },
      relinkEligibility: "UNVERIFIED",
    });

    expect(staged).toContain(">เชื่อมบัญชี LINE นี้</button>");
    expect(unknown).not.toContain(">เชื่อมบัญชี LINE นี้</button>");
  });

  it("does not present a suspended or ineligible owner as having an active binding", () => {
    const markup = renderScreen({ ...emptyStatus, status: "INELIGIBLE", canUnlink: false });

    expect(markup).toContain("บัญชี DEMI นี้ยังไม่สามารถจัดการการเชื่อมต่อ LINE ได้");
    expect(markup).not.toContain("เชื่อมต่อแล้ว");
    expect(markup).not.toContain(">ยกเลิกการเชื่อมต่อ LINE</button>");
  });

  it("warns after local unlink when configuration cannot confirm remote removal", () => {
    const markup = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, {
      lifecycleReadiness: { state: "DEGRADED", history: "UNKNOWN" },
      relinkEligibility: "UNVERIFIED",
      view: "SUCCESS",
      successAction: "UNLINK",
    });

    expect(markup).toContain("หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว แต่ขณะนี้ยังยืนยันการถอนสิทธิ์จาก LINE ไม่ได้");
    expect(markup).toContain(">ตรวจสอบสถานะอีกครั้ง</button>");
    expect(markup).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
  });

  it("keeps recoverable operation failures safe and actionable", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
    }, {
      view: "FAILURE",
      message: "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ กรุณาตรวจสอบบัญชีและลองใหม่",
    });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(">ลองใหม่</button>");
    expect(markup).not.toContain("LINE_USER_ID");
    expect(markup).not.toContain("National ID");
  });
});
