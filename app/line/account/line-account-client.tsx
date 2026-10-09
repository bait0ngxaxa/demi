"use client";

import liff from "@line/liff";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";
import { disconnectionStatusSchema, initializeLineAccountLiff, LineRecoveryPanel } from "./line-recovery-panel";
import { AppointmentNotificationPreference, type AppointmentNotificationPreferenceView } from "./appointment-notification-preference";

type InitialStatus = {
  status: "UNAUTHENTICATED" | "UNLINKED" | "LINKED" | "INELIGIBLE" | "UNAVAILABLE";
  canUnlink: boolean;
  reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
  menuState: "UNKNOWN" | "APPLIED" | "MISMATCH" | "UNAVAILABLE" | null;
  cleanupState: "PENDING" | "CONFIRMED_CLEAN" | "MISMATCH" | "UNAVAILABLE" | "UNKNOWN" | null;
};

type MenuPresentation = NonNullable<InitialStatus["menuState"]>;
type CleanupPresentation = NonNullable<InitialStatus["cleanupState"]>;
type Intent = { intentId: string; challenge: string };
type LiffState = "LOADING" | "READY" | "LOGIN_REQUIRED" | "UNAVAILABLE";
type ViewState = "READY" | "LINK_CONFIRM" | "UNLINK_CONFIRM" | "BUSY" | "SUCCESS" | "FAILURE";
type SuccessAction = "LINK" | "UNLINK" | null;
type RelinkEligibility = "ELIGIBLE" | "BLOCKED" | "UNVERIFIED";

export type LineAccountLifecycleReadiness =
  | { state: "READY" }
  | { state: "STAGED" }
  | { state: "DEGRADED"; history: "PRESENT" | "NONE" | "UNKNOWN" }
  | { state: "NOT_CHECKED" };

const safeFailure = "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
const menuStates = new Set<MenuPresentation>(["UNKNOWN", "APPLIED", "MISMATCH", "UNAVAILABLE"]);
const cleanupStates = new Set<CleanupPresentation>(["PENDING", "CONFIRMED_CLEAN", "MISMATCH", "UNAVAILABLE", "UNKNOWN"]);
const primaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";
const secondaryButtonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-center font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(safeFailure);
  return value;
}

function parseIntent(value: unknown): Intent {
  const record = responseRecord(value);
  if (typeof record.intentId !== "string" || typeof record.challenge !== "string") throw new Error(safeFailure);
  return { intentId: record.intentId, challenge: record.challenge };
}

function parseMenuResult(value: unknown): { presentation: MenuPresentation } {
  const record = responseRecord(value);
  if (typeof record.presentation !== "string" || !menuStates.has(record.presentation as MenuPresentation)) {
    throw new Error(safeFailure);
  }
  return { presentation: record.presentation as MenuPresentation };
}

function parseCleanupResult(value: unknown): { cleanup: CleanupPresentation; disconnection?: LineDisconnectionStatus } {
  const record = responseRecord(value);
  if (typeof record.cleanup !== "string" || !cleanupStates.has(record.cleanup as CleanupPresentation)) {
    throw new Error(safeFailure);
  }
  const disconnection = disconnectionStatusSchema.safeParse(record.disconnection);
  return { cleanup: record.cleanup as CleanupPresentation, ...(disconnection.success ? { disconnection: disconnection.data } : {}) };
}

export async function refreshLineAccountFriendship(): Promise<Pick<InitialStatus, "reachability" | "cleanupState" | "menuState">> {
  const idToken = liff.getIDToken();
  const accessToken = liff.getAccessToken();
  if (!idToken || !accessToken) throw new Error(safeFailure);
  const response = await fetch("/api/line/account/reachability", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken, accessToken }),
  });
  if (!response.ok) throw new Error(safeFailure);
  const value = responseRecord(await response.json());
  const reachability = value.reachability;
  const cleanupState = value.cleanupState;
  const menuState = value.menuState;
  if (
    (reachability !== "FRIEND" && reachability !== "NOT_FRIEND" && reachability !== "UNKNOWN" && reachability !== null) ||
    (cleanupState !== null && (typeof cleanupState !== "string" || !cleanupStates.has(cleanupState as CleanupPresentation))) ||
    (menuState !== null && (typeof menuState !== "string" || !menuStates.has(menuState as MenuPresentation)))
  ) {
    throw new Error(safeFailure);
  }
  return {
    reachability,
    cleanupState: cleanupState as InitialStatus["cleanupState"],
    menuState: menuState as InitialStatus["menuState"],
  };
}

export async function requestLineFriendshipAndRefresh(): Promise<Pick<InitialStatus, "reachability" | "cleanupState" | "menuState">> {
  await liff.requestFriendship();
  return refreshLineAccountFriendship();
}

export function closeLineLiffWindow(isInClient: boolean): void {
  if (isInClient) liff.closeWindow();
}

type LineAccountScreenProps = {
  lifecycleReadiness: LineAccountLifecycleReadiness;
  notificationPreference?: AppointmentNotificationPreferenceView | null;
  preferenceUiGeneration: number;
  relinkEligibility: RelinkEligibility;
  recoveryContent?: React.ReactNode;
  initial: InitialStatus;
  accountStatus: InitialStatus["status"];
  canUnlink: boolean;
  liffState: LiffState;
  isInClient: boolean;
  friendshipSupported: boolean;
  canRefreshReachability: boolean;
  reachabilityBusy: boolean;
  friendshipBusy: boolean;
  friendshipWarning: boolean;
  view: ViewState;
  successAction: SuccessAction;
  message: string;
  providerWarning: boolean;
  confirmationRef: React.RefObject<HTMLButtonElement | null>;
  onStartLineLogin: () => void;
  onBeginLink: () => void;
  onBeginUnlink: () => void;
  onConfirmLink: () => void;
  onConfirmUnlink: () => void;
  onRequestFriendship: () => void;
  onRefreshReachability: () => void;
  onReturnToLine: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onReload: () => void;
};

export function LineAccountScreen({
  lifecycleReadiness,
  notificationPreference,
  preferenceUiGeneration,
  relinkEligibility,
  recoveryContent,
  initial,
  accountStatus,
  canUnlink,
  liffState,
  isInClient,
  friendshipSupported,
  canRefreshReachability,
  reachabilityBusy,
  friendshipBusy,
  friendshipWarning,
  view,
  successAction,
  message,
  providerWarning,
  confirmationRef,
  onStartLineLogin,
  onBeginLink,
  onBeginUnlink,
  onConfirmLink,
  onConfirmUnlink,
  onRequestFriendship,
  onRefreshReachability,
  onReturnToLine,
  onCancel,
  onRestart,
  onReload,
}: LineAccountScreenProps): React.JSX.Element {
  const busy = view === "BUSY";
  const linked = accountStatus === "LINKED" || (accountStatus === "INELIGIBLE" && canUnlink);
  const menuReady = accountStatus === "LINKED" && initial.reachability === "FRIEND" && initial.menuState === "APPLIED";
  const notFriend = accountStatus === "LINKED" && initial.reachability === "NOT_FRIEND";
  const hasFriendshipAction = notFriend && (
    (friendshipSupported && liffState === "READY") || liffState === "LOGIN_REQUIRED"
  );
  const showReachabilityRetry = accountStatus === "LINKED" && canRefreshReachability &&
    !menuReady && !hasFriendshipAction &&
    (initial.reachability === "UNKNOWN" || initial.reachability === null || friendshipWarning);

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
            DEMI
          </Link>
          <h1 className="mt-5 text-3xl">บัญชี LINE</h1>
          <p className="type-readable mt-3 text-base text-muted">จัดการการเชื่อมต่อระหว่าง LINE กับบัญชี DEMI ที่คุณลงชื่อเข้าใช้</p>
        </header>

        <section className="rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-7" aria-labelledby="line-account-status">
          {view === "SUCCESS" ? (
            <div className="space-y-4" role="status" aria-live="polite">
              <h2 id="line-account-status" className="text-2xl font-semibold text-success">
                {successAction === "LINK" ? "เชื่อมบัญชี LINE สำเร็จ" : "ยกเลิกการเชื่อมต่อ LINE แล้ว"}
              </h2>
              {successAction === "LINK" ? (
                <>
                  <p className="text-base text-ink">บัญชี LINE นี้เชื่อมกับ DEMI เรียบร้อยแล้ว</p>
                  {initial.reachability === "NOT_FRIEND" ? (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-ink">
                      เชื่อมบัญชีแล้ว แต่ต้องเพิ่ม DEMI เป็นเพื่อนก่อนจึงจะใช้เมนูส่วนตัวได้
                    </p>
                  ) : initial.reachability === "FRIEND" && initial.menuState === "APPLIED" ? (
                    <p className="rounded-control bg-success-soft px-4 py-3 text-base text-success">พร้อมใช้งานผ่าน LINE แล้ว</p>
                  ) : providerWarning ? (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                      ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่
                    </p>
                  ) : null}
                  {initial.reachability === "NOT_FRIEND" && friendshipSupported && liffState === "READY" ? (
                    <button type="button" disabled={friendshipBusy || reachabilityBusy} onClick={onRequestFriendship} className={primaryButtonClass}>
                      {friendshipBusy ? "กำลังเปิดหน้าเพิ่มเพื่อน..." : "เพิ่ม DEMI เป็นเพื่อน"}
                    </button>
                  ) : null}
                  {initial.reachability === "NOT_FRIEND" && !friendshipSupported && liffState !== "LOGIN_REQUIRED" ? (
                    <p className="text-sm text-muted">กลับไปที่แชท LINE แล้วเพิ่ม DEMI เป็นเพื่อน จากนั้นกลับมาตรวจสอบอีกครั้ง</p>
                  ) : null}
                  {initial.reachability === "NOT_FRIEND" && liffState === "LOGIN_REQUIRED" ? (
                    <button type="button" onClick={onStartLineLogin} className={primaryButtonClass}>เข้าสู่ระบบ LINE</button>
                  ) : null}
                  {showReachabilityRetry ? (
                    <button type="button" disabled={reachabilityBusy || friendshipBusy} onClick={onRefreshReachability} className={secondaryButtonClass}>
                      {reachabilityBusy ? "กำลังตรวจสอบ..." : "ตรวจสอบอีกครั้ง"}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-base text-ink">บัญชี LINE นี้ไม่ได้เชื่อมกับบัญชี DEMI แล้ว</p>
                  {lifecycleReadiness.state === "DEGRADED" || lifecycleReadiness.state === "STAGED" ? (
                    <div className="space-y-3 rounded-control bg-warning-soft px-4 py-3 text-sm text-warning">
                      <p>{lifecycleReadiness.state === "STAGED"
                        ? "หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว แต่การถอนสิทธิ์จาก LINE ยังไม่เปิดใช้ในสภาพแวดล้อมนี้"
                        : "หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว แต่ขณะนี้ยังยืนยันการถอนสิทธิ์จาก LINE ไม่ได้"}</p>
                      <button type="button" onClick={onReload} className={secondaryButtonClass}>ตรวจสอบสถานะอีกครั้ง</button>
                    </div>
                  ) : null}
                  {providerWarning ? (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                      เมนู LINE อาจใช้เวลาสักครู่ในการกลับสู่สถานะเริ่มต้น
                    </p>
                  ) : null}
                </>
              )}
              {isInClient ? (
                <button type="button" onClick={onReturnToLine} className={successAction === "LINK" && hasFriendshipAction ? secondaryButtonClass : primaryButtonClass}>
                  กลับไปที่ LINE
                </button>
              ) : (
                <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                  กลับไปที่แชท LINE เพื่อใช้งานต่อ
                </p>
              )}
            </div>
          ) : (
            <>
              {linked ? (
                <div className="space-y-4">
                  <div>
                    <h2 id="line-account-status" className="flex items-center gap-2 text-2xl font-semibold text-success">
                      <svg aria-hidden="true" className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path d="m7.5 12.5 3 3 6-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                      เชื่อมต่อแล้ว
                    </h2>
                    <p className="mt-2 text-base text-ink">บัญชี LINE นี้เชื่อมกับ DEMI แล้ว</p>
                  </div>
                  {accountStatus === "INELIGIBLE" ? (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                      บัญชี DEMI นี้ยังไม่มีเมนู LINE ให้ใช้งานในขณะนี้
                    </p>
                  ) : menuReady ? (
                    <p className="rounded-control bg-success-soft px-4 py-3 text-base font-semibold text-success">
                      พร้อมใช้งานผ่าน LINE แล้ว
                    </p>
                  ) : notFriend ? (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-ink">
                      เชื่อมบัญชีแล้ว แต่ต้องเพิ่ม DEMI เป็นเพื่อนก่อนจึงจะใช้เมนูส่วนตัวได้
                    </p>
                  ) : (
                    <p className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                      ระบบกำลังเตรียมเมนู LINE ตามสิทธิ์ของคุณ อาจใช้เวลาสักครู่
                    </p>
                  )}

                  {notFriend && friendshipSupported && liffState === "READY" ? (
                    <button type="button" disabled={friendshipBusy} onClick={onRequestFriendship} className={primaryButtonClass}>
                      {friendshipBusy ? "กำลังเปิดหน้าเพิ่มเพื่อน..." : "เพิ่ม DEMI เป็นเพื่อน"}
                    </button>
                  ) : notFriend && liffState === "LOGIN_REQUIRED" ? (
                    <button type="button" onClick={onStartLineLogin} className={primaryButtonClass}>เข้าสู่ระบบ LINE</button>
                  ) : null}

                  {notFriend && !friendshipSupported && liffState !== "LOGIN_REQUIRED" ? (
                    <p className="text-sm text-muted">กลับไปที่แชท LINE แล้วเพิ่ม DEMI เป็นเพื่อน จากนั้นกลับมาตรวจสอบอีกครั้ง</p>
                  ) : null}

                  {friendshipWarning ? (
                    <p role="status" className="text-sm text-muted">
                      ยังตรวจสอบไม่สำเร็จ บัญชีของคุณยังเชื่อมต่ออยู่ กรุณาลองอีกครั้ง
                    </p>
                  ) : null}

                  {isInClient ? (
                    <button
                      type="button"
                      onClick={onReturnToLine}
                      className={hasFriendshipAction ? secondaryButtonClass : primaryButtonClass}
                    >
                      กลับไปที่ LINE
                    </button>
                  ) : (
                    <p className="text-sm text-muted">กลับไปที่แชท LINE เพื่อใช้งานต่อ</p>
                  )}

                  {showReachabilityRetry ? (
                    <button type="button" disabled={reachabilityBusy || friendshipBusy} onClick={onRefreshReachability} className={secondaryButtonClass}>
                      {reachabilityBusy ? "กำลังตรวจสอบ..." : "ตรวจสอบอีกครั้ง"}
                    </button>
                  ) : null}

                  {liffState === "UNAVAILABLE" ? (
                    <div className="space-y-3">
                      <p role="status" className="text-sm text-muted">ยังเปิดข้อมูล LINE ไม่ได้</p>
                      <button type="button" onClick={onReload} className={secondaryButtonClass}>ลองอีกครั้ง</button>
                    </div>
                  ) : null}

                  {canUnlink && view === "READY" ? (
                    <button type="button" disabled={busy || reachabilityBusy || friendshipBusy} onClick={onBeginUnlink} className={secondaryButtonClass}>
                      ยกเลิกการเชื่อมต่อ LINE
                    </button>
                  ) : null}
                  {lifecycleReadiness.state === "DEGRADED" || lifecycleReadiness.state === "STAGED" ? (
                    <p className="rounded-control bg-warning-soft px-4 py-3 text-sm text-warning" role="status" aria-live="polite">
                      {lifecycleReadiness.state === "STAGED"
                        ? "การถอนสิทธิ์จาก LINE ยังไม่เปิดใช้ในสภาพแวดล้อมนี้ แต่คุณยังหยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมได้จากปุ่มยกเลิกด้านบน"
                        : "ขณะนี้ตรวจสอบการถอนสิทธิ์จาก LINE ไม่ได้ แต่คุณยังหยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมได้จากปุ่มยกเลิกด้านบน"}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <h2 id="line-account-status" className="text-xl">บัญชี LINE</h2>
                  <p className="mt-2 text-base text-muted" aria-live="polite">
                    {accountStatus === "UNAUTHENTICATED" && "กรุณาเข้าสู่ระบบ DEMI ก่อนจัดการบัญชี LINE"}
                    {accountStatus === "UNLINKED" && "ยังไม่ได้เชื่อมบัญชี LINE กับ DEMI"}
                    {accountStatus === "INELIGIBLE" && "บัญชี DEMI นี้ยังไม่สามารถจัดการการเชื่อมต่อ LINE ได้"}
                    {accountStatus === "UNAVAILABLE" && "ยังโหลดข้อมูลไม่ได้"}
                  </p>

                  {accountStatus === "UNAUTHENTICATED" ? (
                    <div className="mt-6">
                      <Link href="/login?returnTo=%2Fline%2Faccount" className={primaryButtonClass}>
                        เข้าสู่ระบบ DEMI
                      </Link>
                    </div>
                  ) : null}

                  {accountStatus === "UNAVAILABLE" ? (
                    <button type="button" onClick={onReload} className={secondaryButtonClass + " mt-6"}>ลองอีกครั้ง</button>
                  ) : null}

                  {accountStatus === "UNLINKED" ? (
                    <div className="mt-6 space-y-4">
                      {lifecycleReadiness.state === "DEGRADED" ? (
                        <div className="space-y-3 rounded-control bg-warning-soft px-4 py-3 text-sm text-warning" role="status" aria-live="polite">
                          <p>{lifecycleReadiness.history === "PRESENT"
                            ? "พบประวัติการถอนสิทธิ์เดิม แต่ขณะนี้ตรวจสอบเงื่อนไขการเชื่อมใหม่ไม่ได้"
                            : "ขณะนี้ตรวจสอบสถานะ LINE และเงื่อนไขการเชื่อมใหม่ไม่ได้"} คุณยังเข้าสู่ระบบ DEMI ตามปกติได้ การเชื่อมใหม่จะเปิดเมื่อระบบตรวจสอบสถานะได้อีกครั้ง</p>
                          <button type="button" onClick={onReload} className={secondaryButtonClass}>ตรวจสอบสถานะอีกครั้ง</button>
                        </div>
                      ) : null}
                      {initial.cleanupState && initial.cleanupState !== "CONFIRMED_CLEAN" ? (
                        <p role="status" className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">
                          เมนู LINE อาจใช้เวลาสักครู่ในการกลับสู่สถานะเริ่มต้น
                        </p>
                      ) : null}
                      {relinkEligibility === "ELIGIBLE" && liffState === "LOGIN_REQUIRED" ? (
                        <button type="button" onClick={onStartLineLogin} className={primaryButtonClass}>
                          เข้าสู่ระบบ LINE
                        </button>
                      ) : null}
                      {relinkEligibility === "ELIGIBLE" && liffState === "READY" ? (
                        <button type="button" disabled={busy} onClick={onBeginLink} className={primaryButtonClass}>
                          เชื่อมบัญชี LINE นี้
                        </button>
                      ) : null}
                      {relinkEligibility === "ELIGIBLE" && liffState === "LOADING" ? (
                        <p role="status" className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">กำลังเตรียมการเชื่อมต่อ LINE…</p>
                      ) : null}
                      {relinkEligibility === "ELIGIBLE" && liffState === "UNAVAILABLE" ? (
                        <div className="space-y-3">
                          <p role="status" className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">ยังเปิดการเชื่อมต่อ LINE ไม่ได้</p>
                          <button type="button" onClick={onReload} className={secondaryButtonClass}>ลองอีกครั้ง</button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}

              {view === "LINK_CONFIRM" ? (
                <div className="mt-6 rounded-control border border-line bg-surface-muted p-4" aria-labelledby="link-confirm-title">
                  <h3 id="link-confirm-title" className="text-base">ยืนยันบัญชีที่เปิดอยู่</h3>
                  <p className="mt-2 text-sm text-muted">เมื่อยืนยัน บัญชี LINE ที่กำลังเปิดอยู่นี้จะเชื่อมกับบัญชี DEMI ที่คุณลงชื่อเข้าใช้</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button ref={confirmationRef} type="button" disabled={busy} onClick={onConfirmLink} className={primaryButtonClass}>ยืนยันเชื่อมบัญชี</button>
                    <button type="button" disabled={busy} onClick={onCancel} className={secondaryButtonClass}>กลับ</button>
                  </div>
                </div>
              ) : null}

              {view === "UNLINK_CONFIRM" ? (
                <div className="mt-6 rounded-control border border-danger/40 bg-danger-soft p-4" aria-labelledby="unlink-confirm-title">
                  <h3 id="unlink-confirm-title" className="text-base">ยกเลิกการเชื่อมต่อบัญชี LINE?</h3>
                  <p className="mt-2 text-sm text-ink">{lifecycleReadiness.state === "READY"
                    ? "การเชื่อมต่อ LINE กับ DEMI จะหยุดทันที และระบบจะเริ่มดำเนินการถอนสิทธิ์ LINE ที่เกี่ยวข้อง บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่ครบ หาก LINE ยังไม่ยืนยันผล คุณตรวจสอบเพื่อเชื่อมใหม่ได้"
                    : lifecycleReadiness.state === "DEGRADED"
                      ? "การเชื่อมต่อเดิมจะหยุดและไม่สามารถใช้เข้าถึง DEMI ได้ทันที บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่ครบ ขณะนี้ระบบตรวจสอบหรือยืนยันการถอนสิทธิ์จาก LINE ไม่ได้"
                      : "การเข้าถึง DEMI ผ่านการเชื่อมต่อ LINE เดิมจะหยุดทันที แต่การถอนสิทธิ์ LINE จากภายนอกยังไม่เปิดใช้ในสภาพแวดล้อมนี้ บัญชี DEMI และข้อมูลผู้ป่วยยังอยู่ครบ"}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button ref={confirmationRef} type="button" disabled={busy} onClick={onConfirmUnlink} className="min-h-12 rounded-control bg-danger px-4 py-3 font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">ยืนยันยกเลิกการเชื่อมต่อ</button>
                    <button type="button" disabled={busy} onClick={onCancel} className={secondaryButtonClass}>กลับ</button>
                  </div>
                </div>
              ) : null}

              {busy ? <p className="mt-5 text-sm text-muted" role="status">กำลังดำเนินการ…</p> : null}
              {view === "FAILURE" ? (
                <div className="mt-5 space-y-3">
                  <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{message || safeFailure}</p>
                  <button type="button" onClick={onRestart} className={secondaryButtonClass}>ลองใหม่</button>
                </div>
              ) : null}
            </>
          )}
          {recoveryContent}
        </section>

        {notificationPreference ? <AppointmentNotificationPreference key={preferenceUiGeneration} initial={notificationPreference} /> : null}

        <p className="type-readable mt-5 text-sm text-muted">DEMI ใช้การยืนยันบัญชี LINE เพื่อเชื่อมบัญชีเท่านั้น การเชื่อมนี้ไม่เปลี่ยนสิทธิ์หรือพื้นที่ใช้งานใน DEMI</p>
      </div>
    </main>
  );
}

export function LineAccountClient({
  initial,
  liffId,
  publicOrigin,
  disconnection,
  lifecycleReadiness,
  notificationPreference,
}: {
  initial: InitialStatus;
  liffId: string | null;
  publicOrigin: string;
  disconnection?: LineDisconnectionStatus;
  lifecycleReadiness: LineAccountLifecycleReadiness;
  notificationPreference?: AppointmentNotificationPreferenceView | null;
}): React.JSX.Element {
  const [termination, setTermination] = useState(disconnection);
  const [liffState, setLiffState] = useState<LiffState>(liffId ? "LOADING" : "UNAVAILABLE");
  const [view, setView] = useState<ViewState>("READY");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState("");
  const [providerWarning, setProviderWarning] = useState(false);
  const [accountStatus, setAccountStatus] = useState(initial.status);
  const [canUnlink, setCanUnlink] = useState(initial.canUnlink);
  const [summary, setSummary] = useState(initial);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [friendshipBusy, setFriendshipBusy] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [friendshipSupported, setFriendshipSupported] = useState(false);
  const [canRefreshReachability, setCanRefreshReachability] = useState(false);
  const [successAction, setSuccessAction] = useState<SuccessAction>(null);
  const [appointmentPreference, setAppointmentPreference] = useState(notificationPreference);
  const [preferenceUiGeneration, setPreferenceUiGeneration] = useState(0);
  const refreshAttempted = useRef(false);
  const initialSummary = useRef(initial);
  const confirmationRef = useRef<HTMLButtonElement>(null);
  const privateRoot = useRef<HTMLDivElement>(null);
  const relinkEligibility: RelinkEligibility = lifecycleReadiness.state === "STAGED"
    ? "ELIGIBLE"
    : lifecycleReadiness.state === "READY"
      ? termination?.canRelink ? "ELIGIBLE" : "BLOCKED"
      : "UNVERIFIED";


  useEffect(() => {
    if (!liffId) return;
    if (disconnection && !disconnection.canRelink) return;
    let active = true;
    initializeLineAccountLiff(liffId).then(() => {
      if (!active) return;
      const loggedIn = liff.isLoggedIn();
      const inClient = liff.isInClient();
      setIsInClient(inClient);
      let supportsFriendship = false;
      try {
        supportsFriendship = inClient && liff.getContext()?.viewType === "full";
      } catch {
        supportsFriendship = false;
      }
      setFriendshipSupported(supportsFriendship);
      setCanRefreshReachability(loggedIn);
      setLiffState(loggedIn ? "READY" : "LOGIN_REQUIRED");
      const owned = initialSummary.current;
      const useful = (owned.canUnlink || (owned.status === "UNLINKED" && owned.cleanupState !== null && owned.cleanupState !== "CONFIRMED_CLEAN")) &&
        (owned.reachability === "UNKNOWN" || owned.reachability === "NOT_FRIEND");
      if (!loggedIn || !useful || refreshAttempted.current) return;
      refreshAttempted.current = true;
      setRefreshBusy(true);
      void refreshLineAccountFriendship().then((updated) => {
        if (active) {
          setSummary((current) => ({ ...current, ...updated }));
        }
      }).catch(() => {
        if (active) setRefreshFailed(true);
      }).finally(() => {
        if (active) setRefreshBusy(false);
      });
    }).catch(() => {
      if (active) {
        setLiffState("UNAVAILABLE");
        setCanRefreshReachability(false);
        setFriendshipSupported(false);
      }
    });
    return () => { active = false; };
  }, [liffId, disconnection]);

  useEffect(() => {
    const hide = (): void => { if (privateRoot.current) { privateRoot.current.hidden = true; privateRoot.current.inert = true; } };
    const restore = (event: PageTransitionEvent): void => { if (event.persisted) { hide(); window.location.reload(); } };
    const history = (): void => { hide(); window.location.reload(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", history);
    return () => { window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", restore); window.removeEventListener("popstate", history); };
  }, []);

  useEffect(() => {
    if (view === "LINK_CONFIRM" || view === "UNLINK_CONFIRM") confirmationRef.current?.focus();
  }, [view]);

  async function postJson<T>(path: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error(safeFailure); }
    if (!response.ok || !value || typeof value !== "object") {
      const error = value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : safeFailure;
      throw new Error(error);
    }
    return parse(value);
  }

  async function begin(action: "LINK" | "UNLINK"): Promise<void> {
    if (action === "LINK" && relinkEligibility !== "ELIGIBLE") return;
    setView("BUSY");
    setMessage("");
    try {
      const created = await postJson("/api/line/account/intents", { action }, parseIntent);
      setIntent(created);
      setView(action === "LINK" ? "LINK_CONFIRM" : "UNLINK_CONFIRM");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : safeFailure);
      setView("FAILURE");
    }
  }

  async function confirmLink(): Promise<void> {
    if (!intent) return;
    setView("BUSY");
    setMessage("");
    try {
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("กรุณาเปิดหน้านี้ผ่าน LINE แล้วลองใหม่");
      let accessToken: string | null = null;
      try { accessToken = liff.getAccessToken(); } catch { accessToken = null; }
      const result = await postJson("/api/line/account/link", {
        ...intent,
        idToken,
        ...(accessToken ? { accessToken } : {}),
      }, parseMenuResult);
      setProviderWarning(result.presentation !== "APPLIED");
      setSummary((current) => ({
        ...current,
        status: "LINKED",
        canUnlink: true,
        reachability: "UNKNOWN",
        menuState: result.presentation,
      }));
      setAccountStatus("LINKED");
      setCanUnlink(true);
      setSuccessAction("LINK");
      if (appointmentPreference) {
        setAppointmentPreference({ enabled: false, canEnable: true });
        setPreferenceUiGeneration((current) => current + 1);
      }
      setRefreshFailed(false);
      setView("SUCCESS");
      setIntent(null);
      if (accessToken && !refreshAttempted.current) {
        refreshAttempted.current = true;
        setRefreshBusy(true);
        void refreshLineAccountFriendship().then((updated) => {
          setSummary((current) => ({ ...current, ...updated }));
          if (updated.menuState !== null) setProviderWarning(updated.menuState !== "APPLIED");
        }).catch(() => {
          setRefreshFailed(true);
        }).finally(() => {
          setRefreshBusy(false);
        });
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : safeFailure);
      setView("FAILURE");
    }
  }

  async function confirmUnlink(): Promise<void> {
    if (!intent) return;
    setView("BUSY");
    setMessage("");
    try {
      let accessToken: string | null = null;
      try { if (liffState === "READY") accessToken = liff.getAccessToken(); } catch { /* local unlink remains independent */ }
      const result = await postJson("/api/line/account/unlink", { ...intent, ...(accessToken ? { accessToken } : {}) }, parseCleanupResult);
      if (disconnection) {
        if (result.disconnection) setTermination(result.disconnection);
        else { window.location.reload(); return; }
      }
      setProviderWarning(result.cleanup !== "CONFIRMED_CLEAN");
      setSummary((current) => ({ ...current, status: "UNLINKED", canUnlink: false, cleanupState: result.cleanup }));
      if (appointmentPreference) {
        setAppointmentPreference({ enabled: false, canEnable: false });
        setPreferenceUiGeneration((current) => current + 1);
      }
      setAccountStatus("UNLINKED");
      setCanUnlink(false);
      setSuccessAction("UNLINK");
      setView("SUCCESS");
      setIntent(null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : safeFailure);
      setView("FAILURE");
    }
  }

  async function refreshReachability(): Promise<void> {
    if (!canRefreshReachability || refreshBusy || friendshipBusy) return;
    setRefreshBusy(true);
    setRefreshFailed(false);
    try {
      const updated = await refreshLineAccountFriendship();
      setSummary((current) => ({ ...current, ...updated }));
      if (updated.menuState !== null) setProviderWarning(updated.menuState !== "APPLIED");
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshBusy(false);
    }
  }

  async function requestFriendship(): Promise<void> {
    if (!friendshipSupported || friendshipBusy || refreshBusy) return;
    setFriendshipBusy(true);
    setRefreshFailed(false);
    try {
      const updated = await requestLineFriendshipAndRefresh();
      setSummary((current) => ({ ...current, ...updated }));
      if (updated.menuState !== null) setProviderWarning(updated.menuState !== "APPLIED");
      if (successAction === "LINK") {
        setSuccessAction(null);
        setView("READY");
      }
    } catch {
      setRefreshFailed(true);
    } finally {
      setFriendshipBusy(false);
    }
  }

  async function startLineLogin(): Promise<void> {
    if (accountStatus === "UNLINKED" && relinkEligibility !== "ELIGIBLE") return;
    if (!liffId || !publicOrigin) {
      setLiffState("UNAVAILABLE");
      setCanRefreshReachability(false);
      setFriendshipSupported(false);
      return;
    }
    try {
      if (termination) await postJson("/api/line/account/intents", { action: "LINK" }, parseIntent);
      liff.login({ redirectUri: publicOrigin + "/line/account" });
    } catch {
      setLiffState("UNAVAILABLE");
      setCanRefreshReachability(false);
      setFriendshipSupported(false);
    }
  }

  function returnToLine(): void {
    closeLineLiffWindow(isInClient);
  }

  function reloadPage(): void {
    window.location.reload();
  }

  return (
    <div ref={privateRoot}>
    <LineAccountScreen
      lifecycleReadiness={lifecycleReadiness}
      notificationPreference={appointmentPreference}
      preferenceUiGeneration={preferenceUiGeneration}
      relinkEligibility={relinkEligibility}
      recoveryContent={lifecycleReadiness.state === "READY" && termination && termination.state !== "NONE" ? <LineRecoveryPanel status={termination} liffId={liffId} publicOrigin={publicOrigin} onReload={reloadPage} /> : undefined}
      initial={summary}
      accountStatus={accountStatus}
      canUnlink={canUnlink}
      liffState={liffState}
      isInClient={isInClient}
      friendshipSupported={friendshipSupported}
      canRefreshReachability={canRefreshReachability}
      reachabilityBusy={refreshBusy}
      friendshipBusy={friendshipBusy}
      friendshipWarning={refreshFailed}
      view={view}
      successAction={successAction}
      message={message}
      providerWarning={providerWarning}
      confirmationRef={confirmationRef}
      onStartLineLogin={() => void startLineLogin()}
      onBeginLink={() => void begin("LINK")}
      onBeginUnlink={() => void begin("UNLINK")}
      onConfirmLink={() => void confirmLink()}
      onConfirmUnlink={() => void confirmUnlink()}
      onRequestFriendship={() => void requestFriendship()}
      onRefreshReachability={() => void refreshReachability()}
      onReturnToLine={returnToLine}
      onCancel={() => { setView("READY"); setIntent(null); }}
      onRestart={() => { setIntent(null); setMessage(""); setView("READY"); }}
      onReload={reloadPage}
    />
    </div>
  );
}
