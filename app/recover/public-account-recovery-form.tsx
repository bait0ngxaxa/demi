"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";

import { Panel } from "@/components/ui/panel";
import {
  checkPatientAccountRecoveryAction,
  completePatientAccountRecoveryAction,
} from "@/modules/account-security/transport/server-actions";
import {
  initialAccountRecoveryCompletionActionState,
  type AccountRecoveryAvailabilityActionState,
  type AccountRecoveryCompletionActionState,
} from "@/modules/account-security/transport/action-state";

type LinkState = "CHECKING" | "READY" | "INVALID";

export function PublicAccountRecoveryForm(): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<LinkState>("CHECKING");
  const [completionState, formAction, pending] = useActionState<
    AccountRecoveryCompletionActionState,
    FormData
  >(completePatientAccountRecoveryAction, initialAccountRecoveryCompletionActionState);

  useEffect(() => {
    let active = true;
    const candidate = window.location.hash.slice(1);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (!candidate) {
      const frame = window.requestAnimationFrame(() => {
        if (active) {
          setLinkState("INVALID");
        }
      });
      return () => {
        active = false;
        window.cancelAnimationFrame(frame);
      };
    }

    void checkPatientAccountRecoveryAction(candidate).then(
      (result: AccountRecoveryAvailabilityActionState) => {
        if (!active) {
          return;
        }

        if (result.status === "READY") {
          setToken(candidate);
          setLinkState("READY");
        } else {
          setLinkState("INVALID");
        }
      },
      () => {
        if (active) {
          setLinkState("INVALID");
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel>
      <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">
        ตั้งรหัสผ่านบัญชี DEMI ใหม่
      </h1>
      <p className="mt-3 break-words text-sm leading-6 text-text-muted">
        ลิงก์นี้เปลี่ยนรหัสผ่านของบัญชี DEMI เดียวที่ใช้ร่วมกันทุกบทบาทและทุกโรงพยาบาล
        โรงพยาบาลจะไม่เห็นรหัสผ่านใหม่ของคุณ
      </p>

      {linkState === "CHECKING" ? (
        <p aria-live="polite" className="mt-6 rounded-control bg-surface-muted px-4 py-3 text-sm text-text-muted">
          กำลังตรวจสอบลิงก์…
        </p>
      ) : null}

      {linkState === "INVALID" ? (
        <div className="mt-6 rounded-control border border-warning/20 bg-warning-soft px-4 py-3 text-sm leading-6 text-text">
          <p role="alert">ลิงก์นี้ใช้ไม่ได้ หมดอายุ หรือถูกใช้แล้ว กรุณาติดต่อโรงพยาบาลเพื่อขอลิงก์ใหม่</p>
        </div>
      ) : null}

      {linkState === "READY" && token ? (
        completionState.status === "COMPLETED" ? (
          <div className="mt-6 rounded-control border border-success/20 bg-success-soft px-4 py-4 text-sm leading-6 text-success">
            <p role="status">{completionState.message}</p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
              href="/login"
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <form action={formAction} className="mt-6 grid min-w-0 gap-5">
            <input name="token" type="hidden" value={token} />
            <div className="min-w-0">
              <label className="block text-sm font-semibold text-text" htmlFor="newPassword">
                รหัสผ่านใหม่
              </label>
              <input
                autoComplete="new-password"
                className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                id="newPassword"
                maxLength={128}
                minLength={12}
                name="newPassword"
                required
                type="password"
              />
              <p className="mt-1 text-xs leading-5 text-text-muted">ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร</p>
            </div>
            <div className="min-w-0">
              <label className="block text-sm font-semibold text-text" htmlFor="passwordConfirmation">
                ยืนยันรหัสผ่านใหม่
              </label>
              <input
                autoComplete="new-password"
                className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                id="passwordConfirmation"
                maxLength={128}
                minLength={12}
                name="passwordConfirmation"
                required
                type="password"
              />
            </div>
            {completionState.message ? (
              <p
                aria-live="polite"
                className="break-words rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
                role="alert"
              >
                {completionState.message}
              </p>
            ) : null}
            <button
              className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-fit"
              disabled={pending}
              type="submit"
            >
              {pending ? "กำลังตั้งรหัสผ่าน…" : "ยืนยันรหัสผ่านใหม่"}
            </button>
          </form>
        )
      ) : null}
    </Panel>
  );
}
