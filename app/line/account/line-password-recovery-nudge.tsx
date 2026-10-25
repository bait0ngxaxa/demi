"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

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

export function LinePasswordRecoveryNudge({
  userId,
  href = "#line-account-status",
}: {
  userId: string;
  href?: string;
}): React.JSX.Element | null {
  const storageKey = `demi-line-password-recovery-nudge-dismissed:${userId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));
  const loaded = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerHydrationSnapshot);

  if (!loaded || dismissed) return null;
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
