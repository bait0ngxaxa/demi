"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import type { LineRecoveryReadiness } from "@/modules/line/domain/line-recovery-readiness";

function subscribeToHydration(callback: () => void): () => void {
  const timer = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timer);
}

function getHydratedSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

function readDismissed(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(storageKey) === "1"; } catch { return false; }
}

function getReadinessMessage(readiness: LineRecoveryReadiness): string {
  switch (readiness.status) {
    case "UNLINKED":
      return "ยังไม่ได้ผูก LINE กับบัญชี DEMI การผูก LINE เป็นทางเลือกเพื่อใช้ช่องทางกู้คืนด้วยตนเอง";
    case "READY":
      return "บัญชีนี้ผูก LINE แล้ว และระบบยืนยันสถานะเพื่อนล่าสุดภายใน 24 ชั่วโมง จึงพร้อมสำหรับการขอลิงก์กู้คืนตามสถานะที่ตรวจพบ";
    case "UNCONFIRMED":
      if (readiness.reason === "STALE_OBSERVATION") return "บัญชีนี้ผูก LINE แล้ว แต่ผลตรวจสถานะเพื่อนเก่ากว่า 24 ชั่วโมง จึงยังไม่แสดงว่าพร้อมรับลิงก์กู้คืน";
      if (readiness.reason === "FRIENDSHIP_UNCONFIRMED" && readiness.reachability === "NOT_FRIEND") return "บัญชีนี้ผูก LINE แล้ว แต่ผลตรวจล่าสุดยังไม่ยืนยันว่าเป็นเพื่อนกับ DEMI จึงยังไม่แสดงว่าพร้อมรับลิงก์กู้คืน";
      return "บัญชีนี้ผูก LINE แล้ว แต่ยังไม่มีผลตรวจสถานะเพื่อนที่ยืนยันได้ จึงยังไม่แสดงว่าพร้อมรับลิงก์กู้คืน";
    case "UNAVAILABLE":
      return "ขณะนี้ระบบยังตั้งค่าช่องทางกู้คืนผ่าน LINE ไม่ครบ จึงยังยืนยันความพร้อมในการส่งลิงก์ไม่ได้";
  }
}

function getReadinessTitle(readiness: LineRecoveryReadiness): string {
  switch (readiness.status) {
    case "UNLINKED": return "การกู้คืนผ่าน LINE ยังไม่พร้อม";
    case "READY": return "สถานะกู้คืนผ่าน LINE";
    case "UNCONFIRMED": return "ยังยืนยันความพร้อมของ LINE ไม่ได้";
    case "UNAVAILABLE": return "ช่องทางกู้คืนผ่าน LINE ยังไม่พร้อม";
  }
}

export function LinePasswordRecoveryNudge({
  userId,
  href = "#line-account-status",
  readiness,
  soleOwnerHospitalCount = null,
}: {
  userId: string;
  href?: string;
  readiness?: LineRecoveryReadiness;
  soleOwnerHospitalCount?: number | null;
}): React.JSX.Element | null {
  const storageKey = readiness
    ? `demi-hospital-owner-recovery-readiness-dismissed:${userId}:${readiness.status}`
    : `demi-line-password-recovery-nudge-dismissed:${userId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));
  const loaded = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerHydrationSnapshot);

  if (!loaded || dismissed) return null;
  if (readiness) {
    return (
      <aside className="mt-5 rounded-control border border-border bg-surface-muted p-4" aria-labelledby="owner-line-recovery-readiness-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-text" id="owner-line-recovery-readiness-title">{getReadinessTitle(readiness)}</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">{getReadinessMessage(readiness)}</p>
            {readiness.status === "READY" ? (
              <p className="mt-1 text-xs leading-5 text-text-muted">
                ยืนยันล่าสุด <time dateTime={readiness.observedAt}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(readiness.observedAt))}</time>
              </p>
            ) : null}
            {readiness.status === "UNLINKED" && !readiness.recoveryConfigured ? (
              <p className="mt-1 text-sm leading-6 text-text-muted">แม้ผูก LINE แล้ว ระบบยังต้องพร้อมก่อนจึงจะส่งลิงก์กู้คืนได้</p>
            ) : null}
            {soleOwnerHospitalCount !== null && soleOwnerHospitalCount > 0 ? (
              <p className="mt-2 text-sm leading-6 text-text-muted">คุณเป็น OWNER ที่ใช้งานได้เพียงคนเดียวใน {soleOwnerHospitalCount} โรงพยาบาล หากใช้ LINE ไม่ได้ ยังติดต่อ Platform ADMIN เพื่อขอความช่วยเหลือได้</p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-text-muted">การผูก LINE เป็นทางเลือก หากใช้ LINE ไม่ได้ ขอ OWNER คนอื่นหรือ Platform ADMIN ช่วยกู้คืนบัญชีได้</p>
            )}
            <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={href}>
              {readiness.status === "UNLINKED" ? "ดูวิธีเชื่อม LINE (ทางเลือก)" : "ตรวจสอบหรือจัดการสถานะ LINE"}
            </Link>
          </div>
          <button
            aria-label="ปิดคำแนะนำความพร้อมกู้คืนผ่าน LINE"
            className="min-h-11 shrink-0 rounded-control px-2 text-sm font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus-ring"
            onClick={() => {
              setDismissed(true);
              try { window.localStorage.setItem(storageKey, "1"); } catch { /* This suggestion can be dismissed for this visit. */ }
            }}
            type="button"
          >
            ปิด
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="mt-5 rounded-control border border-border bg-surface-muted p-4" aria-labelledby="line-recovery-nudge-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="line-recovery-nudge-title" className="font-semibold text-text">ผูก LINE เพื่อรีเซ็ตรหัสผ่านเองได้เมื่อลืม</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">ใช้ LINE ที่ผูกไว้รับลิงก์ตั้งรหัสผ่านใหม่ โดยยืนยันบัญชี LINE เดิมก่อนเปลี่ยนรหัสผ่าน</p>
          <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={href}>ไปจัดการการเชื่อมต่อ LINE</Link>
        </div>
        <button
          aria-label="ปิดคำแนะนำการผูก LINE"
          className="min-h-11 shrink-0 rounded-control px-2 text-sm font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus-ring"
          onClick={() => {
            setDismissed(true);
            try { window.localStorage.setItem(storageKey, "1"); } catch { /* This suggestion can be dismissed for this visit. */ }
          }}
          type="button"
        >
          ปิด
        </button>
      </div>
    </aside>
  );
}
