"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { LoadingSpinner } from "@/components/ui/button";
import {
  getPatientActivationDetailsAction,
  completePatientActivationAction,
} from "@/modules/patient-activation/transport/server-actions";
import {
  initialPatientActivationCompletionActionState,
  type PatientActivationDetailsActionState,
  type PatientActivationCompletionActionState,
} from "@/modules/patient-activation/transport/action-state";

type ActivationTokenStore = {
  getSnapshot: () => string | null;
  getServerSnapshot: () => null;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => void;
};

function createActivationTokenStore(): ActivationTokenStore {
  let token: string | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => token,
    getServerSnapshot: () => null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate() {
      const hash = window.location.hash;

      if (!hash) {
        return;
      }

      const rawToken = hash.slice(1);
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );

      try {
        token = decodeURIComponent(rawToken) || null;
      } catch {
        token = null;
      }

      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function PatientActivationForm(): React.JSX.Element {
  const store = useMemo(() => createActivationTokenStore(), []);
  const token = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [details, setDetails] = useState<PatientActivationDetailsActionState | null>(null);
  const [detailsToken, setDetailsToken] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<
    PatientActivationCompletionActionState,
    FormData
  >(
    completePatientActivationAction.bind(null, token ?? ""),
    initialPatientActivationCompletionActionState,
  );

  useEffect(() => {
    store.hydrate();
  }, [store]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    void getPatientActivationDetailsAction(token).then((result) => {
      if (active) {
        setDetails(result);
        setDetailsToken(token);
      }
    });

    return () => {
      active = false;
    };
  }, [token]);

  const fieldErrors = state.status === "ERROR" ? state.fieldErrors : undefined;
  const errorMessage = state.status === "ERROR" ? state.message : undefined;

  if (!token) {
    return (
      <div className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">ไม่พบลิงก์เปิดใช้งาน</p>
        <p className="mt-1">ขอลิงก์ใหม่จากโรงพยาบาล แล้วเปิดลิงก์อีกครั้ง</p>
      </div>
    );
  }

  const visibleDetails = detailsToken === token ? details : null;

  if (!visibleDetails) {
    return (
      <div className="mt-8 rounded-[14px] border border-line bg-white px-4 py-4 text-sm leading-6 text-muted" role="status">
        กำลังตรวจสอบลิงก์เปิดใช้งาน...
      </div>
    );
  }

  if (visibleDetails.status === "INVALID") {
    return (
      <div className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="alert">
        <p className="font-semibold">{visibleDetails.message}</p>
        <p className="mt-1">ขอลิงก์ใหม่จากโรงพยาบาล แล้วเปิดลิงก์อีกครั้ง</p>
        <Link
          className="mt-3 inline-flex font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          href="/login"
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="rounded-[14px] border border-line bg-white px-4 py-4 text-sm leading-6 text-ink">
        <p className="font-semibold">บัญชีสำหรับ {visibleDetails.displayName}</p>
        <p className="mt-1 text-muted">โรงพยาบาล: {visibleDetails.hospitalName}</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          ลิงก์หมดอายุ: {formatDate(visibleDetails.activationExpiresAt)}
        </p>
      </div>

      <div className="rounded-[14px] bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-deep">
        ลิงก์นี้ใช้ได้ครั้งเดียว กรุณาตั้งรหัสผ่านด้วยตนเองและอย่าบอกให้ผู้อื่นทราบ
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="patient-password">
          รหัสผ่านใหม่
        </label>
        <input
          aria-describedby={fieldErrors?.password ? "patient-password-error" : undefined}
          aria-invalid={fieldErrors?.password ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="patient-password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
        {fieldErrors?.password ? (
          <p className="text-sm leading-6 text-danger" id="patient-password-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="patient-password-confirmation">
          ยืนยันรหัสผ่านใหม่
        </label>
        <input
          aria-describedby={
            fieldErrors?.passwordConfirmation
              ? "patient-password-confirmation-error"
              : undefined
          }
          aria-invalid={fieldErrors?.passwordConfirmation ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="patient-password-confirmation"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
        {fieldErrors?.passwordConfirmation ? (
          <p
            className="text-sm leading-6 text-danger"
            id="patient-password-confirmation-error"
            role="alert"
          >
            {fieldErrors.passwordConfirmation}
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p className="text-sm leading-6 text-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <button
        aria-busy={pending || undefined}
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] transition-[background-color,box-shadow,transform] hover:bg-brand-strong hover:shadow-[0_10px_26px_rgba(18,103,89,0.28)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
        disabled={pending}
        type="submit"
      >
        {pending ? <LoadingSpinner className="mr-2" /> : null}
        {pending ? "กำลังเปิดใช้งาน..." : "เปิดใช้งานบัญชี"}
      </button>

      <p className="text-center text-sm leading-6 text-muted">
        มีบัญชีที่เปิดใช้งานแล้ว?{" "}
        <Link
          className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          href="/login"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
