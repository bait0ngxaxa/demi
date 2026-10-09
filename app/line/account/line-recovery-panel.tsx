"use client";

import liff from "@line/liff";
import { useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import type { LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";

const preparedSchema = z.object({ intentId: z.string().uuid(), challenge: z.string().min(40).max(128), expiresAt: z.iso.datetime(), reviews: z.array(z.object({ id: z.string().uuid(), appName: z.string() })).min(1) });
const reviewSchema = z.enum(["REMOVED", "NOT_LISTED", "UNDETERMINED"]);
const handoffSchema = preparedSchema.extend({ manualReviews: z.record(z.string().uuid(), reviewSchema), riskAcknowledged: z.literal(true) });
type Prepared = z.infer<typeof preparedSchema>;
type Review = z.infer<typeof reviewSchema>;
const storageKey = "demi-line-recovery-intent-v1";
function subscribeHandoff(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("pageshow", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("pageshow", callback); };
}
function handoffSnapshot(): string | null {
  try { return sessionStorage.getItem(storageKey); } catch { return null; }
}
function readHandoff(value: string | null): z.infer<typeof handoffSchema> | null {
  try {
    const result = handoffSchema.safeParse(JSON.parse(value ?? "null"));
    return result.success && Date.parse(result.data.expiresAt) > Date.now() ? result.data : null;
  } catch { return null; }
}
export const disconnectionStatusSchema = z.object({
  state: z.enum(["NONE", "PENDING", "RECOVERY_REQUIRED", "REMOTE_CONFIRMED", "RECOVERY_RELEASED_UNVERIFIED"]),
  canRelink: z.boolean(), obligations: z.array(z.object({ id: z.string().uuid(), appName: z.string(), status: z.enum(["REMOTE_CONFIRMED", "RECOVERY_RELEASED_UNVERIFIED", "REMOTE_UNCONFIRMED", "PENDING", "OBSERVED", "PROVEN_ABSENT"]) })),
});
const buttonClass = "min-h-12 w-full rounded-control bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring";
const failure = "ยังยืนยันไม่ได้ กรุณาลองใหม่ คุณยังใช้ DEMI ด้วยการเข้าสู่ระบบตามปกติได้";
const statusCopy = {
  NONE: "ยังไม่มีรายการถอนสิทธิ์ LINE",
  PENDING: "หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว กำลังรอผลการถอนสิทธิ์จาก LINE",
  RECOVERY_REQUIRED: "หยุดการเข้าถึง DEMI ผ่านการเชื่อมต่อเดิมแล้ว แต่ยังยืนยันการถอนสิทธิ์ LINE ไม่ได้",
  REMOTE_CONFIRMED: "LINE ยืนยันการถอนสิทธิ์ของแอปที่เกี่ยวข้องแล้ว",
  RECOVERY_RELEASED_UNVERIFIED: "ตรวจสอบเพื่อเชื่อมใหม่แล้ว การถอนสิทธิ์เดิมจาก LINE ยังไม่ยืนยัน คุณเลือกเริ่มเชื่อมบัญชีใหม่ได้",
};

export async function initializeLineAccountLiff(liffId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([liff.init({ liffId }), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(failure)), 10_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(failure);
  return value;
}

export function LineDisconnectionNotice({ status }: { status: LineDisconnectionStatus }): React.JSX.Element {
  return <div className="space-y-3" role="status" aria-live="polite">
    <p className="type-readable text-ink">{statusCopy[status.state]}</p>
    {status.obligations.length ? <ul className="space-y-2 text-sm text-muted">{status.obligations.map((row) => <li key={row.id}>{row.appName}: {row.status === "REMOTE_CONFIRMED" ? "LINE ยืนยันถอนสิทธิ์แล้ว" : row.status === "PROVEN_ABSENT" ? "ไม่ต้องถอนสิทธิ์" : row.status === "RECOVERY_RELEASED_UNVERIFIED" ? "ผ่านการตรวจสอบเพื่อเชื่อมใหม่ · ยังไม่ยืนยันถอนสิทธิ์" : "ยังไม่ยืนยันถอนสิทธิ์"}</li>)}</ul> : null}
  </div>;
}

export function LineRecoveryPanel({ status, liffId, publicOrigin, onReload }: {
  status: LineDisconnectionStatus; liffId: string | null; publicOrigin: string; onReload: () => void;
}): React.JSX.Element {
  // SSR renders no browser evidence. Hydration reads transport state through
  // React's external-store boundary; SQL/Auth remain the sole authority.
  const resumed = readHandoff(useSyncExternalStore(subscribeHandoff, handoffSnapshot, () => null));
  const [localPrepared, setPrepared] = useState<Prepared | null>(null);
  const [localReviews, setReviews] = useState<Record<string, Review>>({});
  const [localAcknowledged, setAcknowledged] = useState(false);
  const prepared = localPrepared ?? resumed;
  const reviews = localPrepared ? localReviews : resumed?.manualReviews ?? {};
  const acknowledged = localPrepared ? localAcknowledged : resumed !== null;
  const identityReady = !localPrepared && resumed !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const running = useRef(false);

  async function begin(): Promise<void> {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      sessionStorage.removeItem(storageKey);
      const result = preparedSchema.parse(await post("/api/line/account/recovery/prepare", {}));
      setPrepared(result); setReviews({}); setAcknowledged(false);
      heading.current?.focus();
    } catch { setError(failure); } finally { running.current = false; setBusy(false); }
  }

  async function verifyIdentity(): Promise<void> {
    if (!prepared || !acknowledged || !liffId || !publicOrigin || running.current) return;
    if (!prepared.reviews.every((row) => reviews[row.id])) return;
    running.current = true; setBusy(true); setError("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...prepared, manualReviews: reviews, riskAcknowledged: true }));
      // Explicit recovery-only restart; no binding is created by this step.
      await initializeLineAccountLiff(liffId);
      if (liff.isInClient()) {
        window.location.assign(`https://liff.line.me/${liffId}?recovery=1`);
      } else {
        if (liff.isLoggedIn()) liff.logout();
        liff.login({ redirectUri: `${publicOrigin}/line/account?recovery=1` });
      }
    } catch { setError(failure); } finally { running.current = false; setBusy(false); }
  }

  async function complete(): Promise<void> {
    if (!prepared || !acknowledged || !liffId || running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      await initializeLineAccountLiff(liffId);
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error();
      await post("/api/line/account/recovery", { intentId: prepared.intentId, challenge: prepared.challenge, idToken, riskAcknowledged: true, manualReviews: reviews });
      sessionStorage.removeItem(storageKey);
      onReload();
    } catch { setError(failure); } finally { running.current = false; setBusy(false); }
  }

  return <section className="mt-6 space-y-4 border-t border-line pt-5" aria-labelledby="recovery-title" aria-busy={busy}>
    <h2 id="recovery-title" ref={heading} tabIndex={-1} className="text-xl">ตรวจสอบสิทธิ์ LINE</h2>
    <LineDisconnectionNotice status={status} />
    {status.state === "PENDING" ? <><p className="text-sm text-muted">หากยังไม่มีผล ให้ตรวจสอบสถานะอีกครั้ง แล้วดำเนินการต่อได้</p><button type="button" onClick={onReload} className={buttonClass}>ตรวจสอบสถานะอีกครั้ง</button></> : null}
    {status.state === "RECOVERY_REQUIRED" && !prepared ? <button type="button" disabled={busy} onClick={() => void begin()} className={buttonClass}>ตรวจสอบเพื่อเชื่อมใหม่</button> : null}
    {prepared ? <>
      <p className="type-readable text-sm text-ink">เปิด LINE → ตั้งค่า → บัญชี → แอปที่ได้รับอนุญาต ตรวจสอบแอปด้านล่างและถอนสิทธิ์หากมี ไม่ต้องเปิดหรืออนุญาตแอปที่ไม่เคยใช้</p>
      <a className="inline-flex min-h-12 items-center text-brand underline focus-visible:outline-2" href="https://line.me/R/nv/connectedApps" target="_blank" rel="noreferrer">เปิดแอปที่ได้รับอนุญาตใน LINE</a>
      {prepared.reviews.map((row) => <label className="block space-y-2" key={row.id}>
        <span className="font-semibold">{row.appName}</span>
        <select value={reviews[row.id] ?? ""} disabled={busy || identityReady} onChange={(event) => { const value = reviewSchema.safeParse(event.target.value); if (value.success) setReviews((current) => ({ ...current, [row.id]: value.data })); }} className="min-h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-focus-ring">
          <option value="">เลือกผลการตรวจสอบ</option><option value="REMOVED">ถอนสิทธิ์แล้ว</option><option value="NOT_LISTED">ไม่พบในรายการ</option><option value="UNDETERMINED">ตรวจแล้ว แต่ยังไม่แน่ใจ</option>
        </select>
      </label>)}
      <p className="type-readable text-sm text-ink">ขั้นต่อไปจะยืนยันบัญชี LINE เดิมอีกครั้ง และอาจขอสิทธิ์ LINE ใหม่ การยืนยันนี้ยังไม่เชื่อมบัญชี DEMI</p>
      <label className="flex items-start gap-3 text-sm text-ink"><input className="mt-1 size-5 shrink-0 accent-brand" type="checkbox" checked={acknowledged} disabled={busy || identityReady} onChange={(event) => setAcknowledged(event.target.checked)} /><span>ฉันยอมรับว่าคำขอถอนสิทธิ์เดิมอาจเสร็จภายหลัง และทำให้การเชื่อมต่อ LINE ใหม่หยุดชั่วคราว หากเกิดขึ้น ฉันจะยืนยันตัวตนและเชื่อมใหม่ด้วยตนเอง</span></label>
      <button type="button" className={buttonClass} disabled={busy || !acknowledged || !prepared.reviews.every((row) => reviews[row.id]) || !liffId} onClick={() => void (identityReady ? complete() : verifyIdentity())}>{identityReady ? "ยืนยันผลการตรวจสอบ" : "ยืนยันตัวตนกับ LINE ใหม่"}</button>
      <button type="button" disabled={busy} onClick={() => void begin()} className="min-h-12 w-full text-brand underline focus-visible:outline-2">เริ่มการตรวจสอบใหม่</button>
    </> : null}
    {busy ? <p role="status" className="text-sm text-muted">กำลังตรวจสอบ…</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </section>;
}
