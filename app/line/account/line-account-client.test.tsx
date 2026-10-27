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
      notificationPreference={state.notificationPreference}
      preferenceUiGeneration={state.preferenceUiGeneration ?? 0}
      menuCheckPending={state.menuCheckPending}
      menuCheckComplete={state.menuCheckComplete}
      relinkEligibility={state.relinkEligibility ?? "ELIGIBLE"}
      currentPassword={state.currentPassword ?? ""}
      currentPasswordError={state.currentPasswordError ?? ""}
      accountStatus={state.accountStatus ?? initial.status}
      canUnlink={state.canUnlink ?? initial.canUnlink}
      linePasswordRecoveryAvailable={state.linePasswordRecoveryAvailable ?? false}
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
      unlinkDisconnection={state.unlinkDisconnection}
      signOut={state.signOut}
      onRetrySignOut={() => undefined}
      onConfirmLink={() => undefined}
      onCurrentPasswordChange={() => undefined}
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
  it.each(["UNKNOWN", "MISMATCH", "UNAVAILABLE"] as const)("offers a manual menu refresh for %s without claiming readiness", (menuState) => {
    const markup = renderScreen({ ...emptyStatus, status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState }, { canRefreshReachability: true });
    expect(markup).toContain(menuState === "UNKNOWN" ? "เชื่อมบัญชีแล้ว กำลังตรวจสอบเมนู LINE" : "เชื่อมบัญชีแล้ว แต่เมนู LINE ยังไม่พร้อมใช้งาน");
    expect(markup).toContain(">ตรวจสอบสถานะเมนูอีกครั้ง</button>");
    expect(markup).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(markup).not.toContain(">เชื่อมบัญชี LINE นี้</button>");
    expect(markup).toContain('href="/app"');
  });

  it("allows a non-friend in an external browser to refresh after adding the OA manually", () => {
    const markup = renderScreen({ ...emptyStatus, status: "LINKED", canUnlink: true, reachability: "NOT_FRIEND", menuState: "APPLIED" }, { isInClient: false, canRefreshReachability: true });
    expect(markup).toContain("เชื่อมบัญชีสำเร็จแล้ว แต่ยังต้องเพิ่ม DEMI เป็นเพื่อน");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(markup).not.toContain(">กลับไปที่ LINE</button>");
  });

  it("explains LINE login and keeps a web fallback without LINE or a DEMI binding", () => {
    const markup = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, { liffState: "LOGIN_REQUIRED", isInClient: false });
    expect(markup).toContain("เข้าสู่ระบบ LINE เพื่อระบุบัญชี LINE");
    expect(markup).toContain("คุณยังต้องยืนยันการเชื่อมด้วยตนเอง");
    expect(markup).toContain('href="/app"');
    expect(markup).not.toContain("รับแจ้งเตือนนัดหมายผ่าน LINE");
  });

  it("keeps privacy-safe conflicts actionable without claiming a binding", () => {
    const markup = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, { view: "FAILURE", message: "ไม่สามารถเชื่อมบัญชีนี้ได้ กรุณาตรวจสอบบัญชีที่ใช้อยู่" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("กรุณาตรวจสอบบัญชีที่ใช้อยู่");
    expect(markup).toContain('href="/app"');
    expect(markup).not.toContain("เชื่อมบัญชี LINE สำเร็จ");
  });

  it("announces whether an account is being linked or unlinked", () => {
    const unlinkedMarkup = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { view: "BUSY" },
    );
    const linkedMarkup = renderScreen(
      { ...emptyStatus, status: "LINKED", canUnlink: true },
      { view: "BUSY" },
    );

    expect(unlinkedMarkup).toContain("กำลังเชื่อมบัญชี LINE...");
    expect(linkedMarkup).toContain("กำลังยกเลิกการเชื่อมต่อ LINE...");
  });

  it("creates the allowlisted DEMI return target from the unauthenticated account page", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNAUTHENTICATED", canUnlink: false }}
        liffId="1234567890-Recovery"
        publicOrigin="https://demi.example.org"
        linePasswordRecoveryAvailable={true}
        lifecycleReadiness={{ state: "NOT_CHECKED" }}
      />,
    );

    expect(markup).toContain('href="/login?returnTo=%2Fline%2Faccount"');
    expect(markup).toContain("เข้าสู่ระบบ DEMI");
    expect(markup).toContain("ขอลิงก์ตั้งรหัสผ่านใหม่ทาง LINE");
    expect(markup).toContain('name="nationalId"');
  });

  it("offers the Hospital process instead of a LINE request form when configuration is unavailable", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNAUTHENTICATED", canUnlink: false }}
        liffId={null}
        publicOrigin=""
        linePasswordRecoveryAvailable={false}
        lifecycleReadiness={{ state: "NOT_CHECKED" }}
      />,
    );

    expect(markup).toContain("กู้คืนรหัสผ่านผ่าน LINE ยังไม่พร้อมให้บริการ");
    expect(markup).toContain('href="/recover#recover-hospital"');
    expect(markup).not.toContain('name="nationalId"');
    expect(markup).not.toContain("DEMI_LINE_MESSAGING");
  });

  it("requires the current DEMI password before linking the open LINE account", () => {
    const markup = renderScreen(
      { ...emptyStatus, status: "UNLINKED", canUnlink: false },
      { view: "LINK_CONFIRM", currentPasswordError: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
    );

    expect(markup).toContain('name="currentPassword"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("รหัสผ่านปัจจุบันไม่ถูกต้อง");
  });

  it("keeps account linking unavailable while LIFF is loading", () => {
    const markup = renderToStaticMarkup(
      <LineAccountClient
        initial={{ ...emptyStatus, status: "UNLINKED", canUnlink: false }}
        liffId="1234567890-AbCdEfGh"
        publicOrigin="https://demi.example.org"
        linePasswordRecoveryAvailable={false}
        lifecycleReadiness={{ state: "READY" }}
        disconnection={{ state: "NONE", canRelink: true, obligations: [] }}
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
    expect(markup).not.toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
    expect(markup).not.toContain("warning");
  });

  it("shows the purpose-specific appointment preference as OFF until the Patient enables it", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "FRIEND",
      menuState: "APPLIED",
    }, {
      notificationPreference: { enabled: false, canEnable: true },
    });

    expect(markup).toContain("รับแจ้งเตือนนัดหมายผ่าน LINE");
    expect(markup).toContain("ใช้แจ้งเมื่อมีการสร้าง เปลี่ยนแปลง หรือยกเลิกนัดหมายของคุณ หรือของผู้ป่วยที่คุณดูแลหรือได้รับสิทธิ์ดูนัด ข้อความระบุเฉพาะประเภทนัด ไม่มีข้อมูลระบุตัวผู้ป่วยหรือรายละเอียดสุขภาพ");
    expect(markup).toContain("สถานะ: ปิด");
    expect(markup).toContain("มีนัดหมายประเภท ติดตาม / ประเมิน / ให้ความรู้ อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(markup).toContain(">เปิดการแจ้งเตือน</button>");
    expect(markup).toContain("ไม่รับประกันว่าข้อความจะถึงหรือแสดงบนอุปกรณ์");
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
    expect(markup).toContain("เชื่อมบัญชีแล้ว กำลังตรวจสอบเมนู LINE");
    expect(markup).not.toContain(">ตรวจสอบอีกครั้ง</button>");
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
    expect(markup).toContain("เชื่อมบัญชีแล้ว แต่ยังยืนยันสถานะ LINE ไม่ได้");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
  });

  it("keeps a failed friendship check from hiding the linked result", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "NOT_FRIEND",
      menuState: "UNKNOWN",
    }, { friendshipWarning: true, canRefreshReachability: true });

    expect(markup).toContain("สถานะล่าสุดที่ตรวจสอบได้");
    expect(markup).toContain("ยังตรวจสอบสถานะ LINE ไม่สำเร็จ");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
  });

  it("offers LIFF friendship and explicit verification for a linked non-friend", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "LINKED",
      canUnlink: true,
      reachability: "NOT_FRIEND",
      menuState: "UNKNOWN",
    }, { friendshipSupported: true, canRefreshReachability: true });

    expect(markup).toContain("เชื่อมบัญชีสำเร็จแล้ว แต่ยังต้องเพิ่ม DEMI เป็นเพื่อน");
    expect(markup).toContain(">เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).toContain("ตรวจสอบอีกครั้ง</button>");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).not.toContain("MISMATCH");
  });

  it.each(["UNKNOWN", "APPLIED"] as const)("uses a primary return only for verified ready FRIEND with menu %s", (menuState) => {
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

    expect(markup).toMatch(menuState === "APPLIED"
      ? /<button[^>]*class="[^"]*bg-brand [^"]*">กลับไปที่ LINE<\/button>/u
      : /<button[^>]*class="[^"]*bg-surface [^"]*">กลับไปที่ LINE<\/button>/u);
    expect(markup).not.toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).toContain(menuState === "APPLIED"
      ? "พร้อมใช้งานผ่าน LINE แล้ว"
      : "เชื่อมบัญชีแล้ว กำลังตรวจสอบเมนู LINE");
  });

  it("shows the linked result and account controls for a DEMI account without an available LINE menu", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "INELIGIBLE",
      canUnlink: true,
    }, { canRefreshReachability: true, friendshipWarning: true });

    expect(markup).toContain("สถานะล่าสุดที่ตรวจสอบได้");
    expect(markup).toContain("บัญชี DEMI นี้ยังไม่มีเมนู LINE ให้ใช้งานในขณะนี้");
    expect(markup).toContain("ยกเลิกการเชื่อมต่อ LINE");
    expect(markup).not.toContain(">ตรวจสอบอีกครั้ง</button>");
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

    expect(markup).toContain("บัญชี LINE นี้เชื่อมกับ DEMI เรียบร้อยแล้ว");
    expect(markup).toContain("ยังยืนยันสถานะ LINE ปัจจุบันไม่ได้");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toContain(">ตรวจสอบอีกครั้ง</button>");
    expect(markup).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(markup).toContain("ยังตรวจสอบสถานะ LINE ไม่สำเร็จ");
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

    expect(markup).toContain("บัญชี LINE นี้เชื่อมกับ DEMI เรียบร้อยแล้ว");
    expect(markup).toContain("ยังยืนยันสถานะ LINE ปัจจุบันไม่ได้");
    expect(markup).toContain(">เพิ่ม DEMI เป็นเพื่อน</button>");
    expect(markup).toContain(">กลับไปที่ LINE</button>");
    expect(markup).toMatch(/<button[^>]*class="[^"]*bg-brand [^"]*">เพิ่ม DEMI เป็นเพื่อน<\/button>/u);
    expect(markup).toMatch(/<button[^>]*class="[^"]*border-line-strong[^"]*">กลับไปที่ LINE<\/button>/u);
    expect(markup).toContain("ตรวจสอบอีกครั้ง</button>");
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
    expect(markup).toContain("กำลังออกจากระบบ DEMI…");
    expect(markup).not.toContain(">กลับไปที่ LINE</button>");
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
    expect(link).toContain("คุณกำลังเชื่อม LINE ที่ใช้อยู่กับบัญชี DEMI ที่เข้าสู่ระบบในเบราว์เซอร์นี้");
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

  it("offers exactly one Disconnection action for a linked account", () => {
    const linked = renderScreen({ ...emptyStatus, status: "LINKED", canUnlink: true });
    expect(linked.match(/>ยกเลิกการเชื่อมต่อ LINE<\/button>/gu)).toHaveLength(1);
    expect(linked).not.toContain("ใช้บัญชี DEMI อื่น");
    expect(linked).not.toContain(">ออกจากระบบ DEMI</button>");
    expect(linked).toContain("ระบบจะออกจากบัญชี DEMI นี้ให้ด้วย");

    const confirm = renderScreen({ ...emptyStatus, status: "LINKED", canUnlink: true }, { view: "UNLINK_CONFIRM" });
    expect(confirm.match(/>ยืนยันยกเลิกการเชื่อมต่อ<\/button>/gu)).toHaveLength(1);
    expect(confirm).toContain("จากนั้นระบบจะออกจากบัญชี DEMI นี้ และพาไปหน้าเข้าสู่ระบบ");
  });

  it("keeps the session-only account switch where linking may happen on a shared device", () => {
    const unlinked = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false });
    expect(unlinked).toContain(">ใช้บัญชี DEMI อื่น</button>");
    const linkConfirm = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, { view: "LINK_CONFIRM" });
    expect(linkConfirm).toContain(">ใช้บัญชี DEMI อื่น</button>");
    expect(linkConfirm).toContain("หากใช้เครื่องร่วมกับผู้อื่นหรือไม่แน่ใจ");
  });

  it("reports DEMI sign-out separately from the committed unlink", () => {
    const base = { ...emptyStatus, status: "UNLINKED" as const, canUnlink: false };
    const pending = renderScreen(base, { view: "SUCCESS", successAction: "UNLINK", signOut: { state: "PENDING" } });
    expect(pending).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว"); expect(pending).toContain("กำลังออกจากระบบ DEMI…");

    const failed = renderScreen(base, { view: "SUCCESS", successAction: "UNLINK", signOut: { state: "FAILED" } });
    expect(failed).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว แต่ยังออกจากระบบ DEMI ไม่สำเร็จ");
    expect(failed).toContain(">ลองออกจากระบบอีกครั้ง</button>");
    expect(failed).not.toContain(">ยกเลิกการเชื่อมต่อ LINE</button>");

    const redirecting = renderScreen(base, { view: "SUCCESS", successAction: "UNLINK", signOut: { state: "REDIRECTING", redirectTo: "/login?returnTo=%2Fline%2Faccount" } });
    expect(redirecting).toContain('href="/login?returnTo=%2Fline%2Faccount"');
    expect(redirecting).toContain("ไปหน้าเข้าสู่ระบบ DEMI");
  });

  it("never presents local unlink as provider deauthorization", () => {
    const base = { ...emptyStatus, status: "UNLINKED" as const, canUnlink: false };
    const unconfirmed = renderScreen(base, { view: "SUCCESS", successAction: "UNLINK", unlinkDisconnection: { state: "RECOVERY_REQUIRED", canRelink: false, obligations: [
      { id: "a1111111-1111-4111-a111-111111111111", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "LINE Login ของ DEMI", status: "REMOTE_CONFIRMED" },
      { id: "b1111111-1111-4111-a111-111111111111", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "DEMI MINI App", status: "REMOTE_UNCONFIRMED" },
    ] } });
    expect(unconfirmed).toContain("LINE Login ของ DEMI: LINE ยืนยันถอนสิทธิ์แล้ว");
    expect(unconfirmed).toContain("DEMI MINI App: ยังไม่ยืนยันถอนสิทธิ์");
    expect(unconfirmed).not.toContain("LINE ยืนยันการถอนสิทธิ์ของแอปที่เกี่ยวข้องแล้ว");
    // Recovery belongs to the next sign-in of this same owner, not this success view.
    expect(unconfirmed).not.toContain("ตรวจสอบเพื่อเชื่อมใหม่");
    const unknown = renderScreen(base, { view: "SUCCESS", successAction: "UNLINK", unlinkDisconnection: null });
    expect(unknown).toContain("ขณะนี้ยังยืนยันการถอนสิทธิ์จาก LINE ไม่ได้");
  });

  it("keeps the Link path available only when the server marks Relink eligible", () => {
    const eligible = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, {
      lifecycleReadiness: { state: "READY" },
      relinkEligibility: "ELIGIBLE",
    });
    const unknown = renderScreen({ ...emptyStatus, status: "UNLINKED", canUnlink: false }, {
      lifecycleReadiness: { state: "DEGRADED", history: "UNKNOWN" },
      relinkEligibility: "UNVERIFIED",
    });

    expect(eligible).toContain(">เชื่อมบัญชี LINE นี้</button>");
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
    expect(markup).toContain("กำลังออกจากระบบ DEMI…");
    expect(markup).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
  });

  it("keeps recoverable operation failures safe and actionable", () => {
    const markup = renderScreen({
      ...emptyStatus,
      status: "UNLINKED",
      canUnlink: false,
    }, {
      view: "FAILURE",
      message: "ไม่สามารถเชื่อมบัญชี LINE นี้ได้ หาก LINE นี้หรือบัญชี DEMI นี้ยังเชื่อมกับอีกบัญชีหนึ่ง กรุณายกเลิกการเชื่อมต่อเดิมก่อนแล้วลองใหม่",
    });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(">ลองใหม่</button>");
    expect(markup).not.toContain("LINE_USER_ID");
    expect(markup).not.toContain("National ID");
  });
});
