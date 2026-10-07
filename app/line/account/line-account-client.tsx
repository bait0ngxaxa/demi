"use client";

import liff from "@line/liff";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type InitialStatus = {
  status: "UNAUTHENTICATED" | "UNLINKED" | "LINKED" | "INELIGIBLE" | "UNAVAILABLE";
  canUnlink: boolean;
  reachability: "UNKNOWN" | "FRIEND" | "NOT_FRIEND" | null;
  menuState: "UNKNOWN" | "APPLIED" | "MISMATCH" | "UNAVAILABLE" | null;
  cleanupState: "PENDING" | "CONFIRMED_CLEAN" | "MISMATCH" | "UNAVAILABLE" | "UNKNOWN" | null;
};

type Intent = { intentId: string; challenge: string };
type LiffState = "LOADING" | "READY" | "LOGIN_REQUIRED" | "UNAVAILABLE";
type ViewState = "READY" | "LINK_CONFIRM" | "UNLINK_CONFIRM" | "BUSY" | "SUCCESS" | "FAILURE";

const safeFailure = "ทำรายการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่";
const menuStates = new Set(["UNKNOWN", "APPLIED", "MISMATCH", "UNAVAILABLE"]);
const cleanupStates = new Set(["PENDING", "CONFIRMED_CLEAN", "MISMATCH", "UNAVAILABLE", "UNKNOWN"]);

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

function parseMenuResult(value: unknown): { presentation: string } {
  const record = responseRecord(value);
  if (typeof record.presentation !== "string" || !menuStates.has(record.presentation)) throw new Error(safeFailure);
  return { presentation: record.presentation };
}

function parseCleanupResult(value: unknown): { cleanup: string } {
  const record = responseRecord(value);
  if (typeof record.cleanup !== "string" || !cleanupStates.has(record.cleanup)) throw new Error(safeFailure);
  return { cleanup: record.cleanup };
}

export async function refreshLineAccountFriendship(): Promise<Pick<InitialStatus, "reachability" | "cleanupState" | "menuState">> {
  const idToken = liff.getIDToken();
  const accessToken = liff.getAccessToken();
  if (!idToken || !accessToken) throw new Error(safeFailure);
  const response = await fetch("/api/line/account/reachability", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken, accessToken }),
  });
  if (!response.ok) throw new Error(safeFailure);
  const value = responseRecord(await response.json());
  const reachability = value.reachability;
  const cleanupState = value.cleanupState;
  const menuState = value.menuState;
  if ((reachability !== "FRIEND" && reachability !== "NOT_FRIEND" && reachability !== "UNKNOWN" && reachability !== null) ||
    (cleanupState !== null && (typeof cleanupState !== "string" || !cleanupStates.has(cleanupState))) ||
    (menuState !== null && (typeof menuState !== "string" || !menuStates.has(menuState)))) throw new Error(safeFailure);
  return { reachability, cleanupState: cleanupState as InitialStatus["cleanupState"], menuState: menuState as InitialStatus["menuState"] };
}

type LineAccountScreenProps = {
  initial: InitialStatus;
  accountStatus: InitialStatus["status"];
  canUnlink: boolean;
  liffState: LiffState;
  view: ViewState;
  message: string;
  providerWarning: boolean;
  friendshipWarning?: boolean;
  successMessage: string;
  confirmationRef: React.RefObject<HTMLButtonElement | null>;
  onStartLineLogin: () => void;
  onBeginLink: () => void;
  onBeginUnlink: () => void;
  onConfirmLink: () => void;
  onConfirmUnlink: () => void;
  onCancel: () => void;
  onRestart: () => void;
};

export function LineAccountScreen({
  initial,
  accountStatus,
  canUnlink,
  liffState,
  view,
  message,
  providerWarning,
  friendshipWarning = false,
  successMessage,
  confirmationRef,
  onStartLineLogin,
  onBeginLink,
  onBeginUnlink,
  onConfirmLink,
  onConfirmUnlink,
  onCancel,
  onRestart,
}: LineAccountScreenProps): React.JSX.Element {
  const busy = view === "BUSY";
  const linked = accountStatus === "LINKED" || accountStatus === "INELIGIBLE";

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
          <h2 id="line-account-status" className="text-xl">สถานะบัญชี</h2>
          <p className="mt-2 text-base text-muted" aria-live="polite">
            {accountStatus === "UNAUTHENTICATED" && "กรุณาเข้าสู่ระบบ DEMI ก่อนจัดการบัญชี LINE"}
            {accountStatus === "UNLINKED" && "ยังไม่ได้เชื่อมบัญชี LINE กับ DEMI"}
            {accountStatus === "LINKED" && "บัญชี LINE เชื่อมกับบัญชี DEMI นี้แล้ว"}
            {accountStatus === "INELIGIBLE" && "บัญชี DEMI นี้ยังไม่พร้อมใช้งาน เมนู LINE จะแสดงเฉพาะการจัดการบัญชี"}
            {accountStatus === "UNAVAILABLE" && "ยังโหลดสถานะบัญชีไม่ได้ กรุณาลองใหม่ภายหลัง"}
          </p>

          {accountStatus === "UNAUTHENTICATED" && (
            <div className="mt-6">
              <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
                เข้าสู่ระบบ DEMI
              </Link>
            </div>
          )}

          {linked && (
            <div className="mt-6 space-y-4">
              <p className="rounded-control bg-brand-soft px-4 py-3 text-sm text-brand-deep">
                {initial.reachability === "FRIEND" ? "เพิ่ม DEMI เป็นเพื่อนแล้ว" : initial.reachability === "NOT_FRIEND"
                  ? "ยังไม่ได้เพิ่ม DEMI เป็นเพื่อน หรือบัญชีอาจบล็อก DEMI อยู่" : "ยังยืนยันสถานะ LINE ไม่ได้"}
              </p>
              {(initial.menuState !== "APPLIED" || initial.reachability !== "FRIEND") && (
                <p className="rounded-control bg-warning-soft px-4 py-3 text-sm text-ink" role="status">
                  เชื่อมบัญชีแล้ว แต่เมนู LINE อาจยังไม่พร้อม หากเพิ่ม DEMI เป็นเพื่อนแล้วให้รอสักครู่หรือลองเปิดหน้านี้อีกครั้ง
                </p>
              )}
              {canUnlink && (view === "READY" || view === "SUCCESS") && <button type="button" disabled={busy} onClick={onBeginUnlink} className="inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 text-center font-semibold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
                ยกเลิกการเชื่อมต่อ LINE
              </button>}
            </div>
          )}

          {accountStatus === "UNLINKED" && (
            <div className="mt-6 space-y-4">
              {initial.cleanupState && initial.cleanupState !== "CONFIRMED_CLEAN" && (
                <p role="status" className="rounded-control bg-warning-soft px-4 py-3 text-sm text-ink">
                  ยกเลิกการเชื่อมต่อแล้ว แต่ยังปรับปรุงเมนู LINE ไม่สำเร็จ หากเพิ่ม DEMI เป็นเพื่อนแล้ว สามารถลองเปิดหน้านี้อีกครั้งได้
                </p>
              )}
              {liffState === "LOGIN_REQUIRED" && (
                <button type="button" onClick={onStartLineLogin} className="inline-flex min-h-12 w-full items-center justify-center rounded-control border border-line-strong bg-surface px-5 py-3 font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
                  เข้าสู่ระบบ LINE
                </button>
              )}
              {liffState === "READY" && (view === "READY" || view === "SUCCESS") && (
                <button type="button" disabled={busy} onClick={onBeginLink} className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-5 py-3 text-center font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
                  เชื่อมบัญชี LINE นี้
                </button>
              )}
              {liffState === "LOADING" && <p role="status" className="rounded-control bg-surface-muted px-4 py-3 text-sm text-muted">กำลังเตรียมการเชื่อมต่อ LINE…</p>}
              {liffState === "UNAVAILABLE" && <p role="status" className="rounded-control bg-warning-soft px-4 py-3 text-sm text-ink">ยังเปิดการเชื่อมต่อ LINE ไม่ได้ กรุณาลองใหม่ภายหลัง</p>}
            </div>
          )}

          {view === "LINK_CONFIRM" && (
            <div className="mt-6 rounded-control border border-line bg-surface-muted p-4" aria-labelledby="link-confirm-title">
              <h3 id="link-confirm-title" className="text-base">ยืนยันบัญชีที่เปิดอยู่</h3>
              <p className="mt-2 text-sm text-muted">เมื่อยืนยัน บัญชี LINE ที่กำลังเปิดอยู่นี้จะเชื่อมกับบัญชี DEMI ที่คุณลงชื่อเข้าใช้</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button ref={confirmationRef} type="button" disabled={busy} onClick={onConfirmLink} className="min-h-12 rounded-control bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">ยืนยันเชื่อมบัญชี</button>
                <button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-control border border-line-strong bg-surface px-4 py-3 font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">กลับ</button>
              </div>
            </div>
          )}

          {view === "UNLINK_CONFIRM" && (
            <div className="mt-6 rounded-control border border-danger/40 bg-danger-soft p-4" aria-labelledby="unlink-confirm-title">
              <h3 id="unlink-confirm-title" className="text-base">ยกเลิกการเชื่อมต่อบัญชี LINE?</h3>
              <p className="mt-2 text-sm text-ink">เมนู LINE จะหยุดใช้กับบัญชี DEMI นี้ทันที การยกเลิกไม่ลบบัญชี DEMI ของคุณ</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button ref={confirmationRef} type="button" disabled={busy} onClick={onConfirmUnlink} className="min-h-12 rounded-control bg-danger px-4 py-3 font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">ยืนยันยกเลิกการเชื่อมต่อ</button>
                <button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-control border border-line-strong bg-surface px-4 py-3 font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">กลับ</button>
              </div>
            </div>
          )}

          {busy && <p className="mt-5 text-sm text-muted" role="status">กำลังดำเนินการ…</p>}
          {friendshipWarning && <p role="status" className="mt-5 text-sm text-muted">ยังตรวจสอบสถานะ LINE ไม่สำเร็จ กรุณาลองเปิดหน้านี้อีกครั้งภายหลัง</p>}
          {view === "SUCCESS" && (
            <p className="mt-5 rounded-control bg-success-soft px-4 py-3 text-sm text-success" role="status">
              {successMessage}
              {providerWarning && " การปรับปรุงเมนู LINE อาจใช้เวลา หากยังเห็นเมนูเดิมให้เปิดหน้านี้อีกครั้ง"}
            </p>
          )}
          {view === "FAILURE" && <div className="mt-5 space-y-3">
            <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{message || safeFailure}</p>
            <button type="button" onClick={onRestart} className="min-h-12 w-full rounded-control border border-line-strong bg-surface px-5 py-3 font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">เริ่มรายการใหม่</button>
          </div>}
        </section>

        <p className="type-readable mt-5 text-sm text-muted">DEMI ใช้การยืนยันบัญชี LINE เพื่อเชื่อมบัญชีเท่านั้น การเชื่อมนี้ไม่เปลี่ยนสิทธิ์หรือพื้นที่ใช้งานใน DEMI</p>
      </div>
    </main>
  );
}

export function LineAccountClient({
  initial,
  liffId,
  publicOrigin,
}: {
  initial: InitialStatus;
  liffId: string | null;
  publicOrigin: string;
}): React.JSX.Element {
  const [liffState, setLiffState] = useState<LiffState>(liffId ? "LOADING" : "UNAVAILABLE");
  const [view, setView] = useState<ViewState>("READY");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState("");
  const [providerWarning, setProviderWarning] = useState(false);
  const [accountStatus, setAccountStatus] = useState(initial.status);
  const [canUnlink, setCanUnlink] = useState(initial.canUnlink);
  const [successMessage, setSuccessMessage] = useState("");
  const [summary, setSummary] = useState(initial);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const refreshAttempted = useRef(false);
  const initialSummary = useRef(initial);
  const confirmationRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!liffId) return;
    let active = true;
    liff.init({ liffId }).then(() => {
      if (!active) return;
      const loggedIn = liff.isLoggedIn();
      setLiffState(loggedIn ? "READY" : "LOGIN_REQUIRED");
      const owned = initialSummary.current;
      const useful = (owned.canUnlink || (owned.status === "UNLINKED" && owned.cleanupState !== null && owned.cleanupState !== "CONFIRMED_CLEAN")) &&
        (owned.reachability === "UNKNOWN" || owned.reachability === "NOT_FRIEND");
      if (!loggedIn || !useful || refreshAttempted.current) return;
      refreshAttempted.current = true;
      void refreshLineAccountFriendship().then((updated) => {
        if (active) setSummary((current) => ({ ...current, ...updated }));
      }).catch(() => {
        if (active) setRefreshFailed(true);
      });
    }).catch(() => {
      if (active) setLiffState("UNAVAILABLE");
    });
    return () => { active = false; };
  }, [liffId]);

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
      setAccountStatus("LINKED");
      setCanUnlink(true);
      setSuccessMessage("เชื่อมบัญชี LINE สำเร็จ");
      setView("SUCCESS");
      setIntent(null);
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
      const result = await postJson("/api/line/account/unlink", intent, parseCleanupResult);
      setProviderWarning(result.cleanup !== "CONFIRMED_CLEAN");
      setAccountStatus("UNLINKED");
      setCanUnlink(false);
      setSuccessMessage("ยกเลิกการเชื่อมต่อบัญชี LINE แล้ว");
      setView("SUCCESS");
      setIntent(null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : safeFailure);
      setView("FAILURE");
    }
  }

  function startLineLogin(): void {
    if (!liffId || !publicOrigin) return;
    liff.login({ redirectUri: `${publicOrigin}/line/account` });
  }

  return (
    <LineAccountScreen
      initial={summary}
      accountStatus={accountStatus}
      canUnlink={canUnlink}
      liffState={liffState}
      view={view}
      message={message}
      providerWarning={providerWarning}
      friendshipWarning={refreshFailed}
      successMessage={successMessage}
      confirmationRef={confirmationRef}
      onStartLineLogin={startLineLogin}
      onBeginLink={() => void begin("LINK")}
      onBeginUnlink={() => void begin("UNLINK")}
      onConfirmLink={() => void confirmLink()}
      onConfirmUnlink={() => void confirmUnlink()}
      onCancel={() => { setView("READY"); setIntent(null); }}
      onRestart={() => { setIntent(null); setMessage(""); setView("READY"); }}
    />
  );
}
