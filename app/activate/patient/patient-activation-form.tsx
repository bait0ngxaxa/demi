"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName, LoadingSpinner } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
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
  clear: () => void;
};

function createActivationTokenStore(): ActivationTokenStore {
  let token: string | null = null;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => token,
    getServerSnapshot: () => null,
    clear() {
      token = null;
      listeners.forEach((listener) => listener());
    },
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
  const [detailsFailedToken, setDetailsFailedToken] = useState<string | null>(null);
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<
    PatientActivationCompletionActionState,
    FormData
  >(
    completePatientActivationAction.bind(null, token ?? ""),
    initialPatientActivationCompletionActionState,
  );
  const outcomeUnconfirmed =
    unknownOutcome || (state.status === "ERROR" && state.code === "UNAVAILABLE");

  useEffect(() => {
    store.hydrate();
  }, [store]);

  useEffect(() => {
    if (
      state.status === "SUCCESS" ||
      outcomeUnconfirmed ||
      (state.status === "ERROR" && state.code === "CONFLICT")
    ) {
      store.clear();
    }
  }, [outcomeUnconfirmed, state, store]);

  useEffect(() => {
    if (state.status !== "ERROR" || !state.fieldErrors) {
      return;
    }

    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    getPatientActivationDetailsAction(token).then(
      (result) => {
        if (active) {
          setDetails(result);
          setDetailsToken(token);
        }
      },
      () => {
        if (active) {
          setDetailsFailedToken(token);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [token, detailsAttempt]);

  const fieldErrors = state.status === "ERROR" ? state.fieldErrors : undefined;
  const errorMessage = state.status === "ERROR" ? state.message : undefined;

  if (state.status === "SUCCESS") {
    return (
      <section className="mt-8 space-y-4" aria-labelledby="patient-activation-success-title">
        <Alert variant="success">
          <h3 className="font-semibold" id="patient-activation-success-title">ตั้งรหัสผ่านสำเร็จแล้ว</h3>
          <p className="mt-1">
            บัญชีของคุณพร้อมใช้งานแล้ว สามารถเข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้
          </p>
        </Alert>
        <Link className={buttonClassName({ className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (outcomeUnconfirmed) {
    return (
      <section className="mt-8 space-y-4">
        <UnknownOutcomeAlert
          active
          recovery={{
            kind: "note",
            message: "ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่",
            note:
              "หากตั้งรหัสผ่านสำเร็จ ให้ลองเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ หากเข้าไม่ได้ กรุณาติดต่อโรงพยาบาลเพื่อขอลิงก์ใหม่",
          }}
        />
        <Link className={buttonClassName({ variant: "secondary", className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (state.status === "ERROR" && state.code === "CONFLICT") {
    return (
      <section className="mt-8 space-y-4">
        <Alert variant="warning">
          <p className="font-semibold">ลิงก์นี้ใช้ไม่ได้แล้ว</p>
          <p className="mt-1">ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว กรุณาติดต่อโรงพยาบาลเพื่อขอลิงก์ใหม่</p>
        </Alert>
        <Link className={buttonClassName({ variant: "secondary", className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (!token) {
    return (
      <div className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">ไม่พบลิงก์เปิดใช้งาน</p>
        <p className="mt-1">ขอลิงก์ใหม่จากโรงพยาบาล แล้วเปิดลิงก์อีกครั้ง</p>
      </div>
    );
  }

  const visibleDetails = detailsToken === token ? details : null;

  if (!visibleDetails && detailsFailedToken === token) {
    return (
      <div className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="alert">
        <p className="font-semibold">ตรวจสอบลิงก์เปิดใช้งานไม่สำเร็จ</p>
        <p className="mt-1">เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p>
        <Button
          className="mt-3"
          onClick={() => {
            setDetailsFailedToken(null);
            setDetailsAttempt((attempt) => attempt + 1);
          }}
          size="compact"
          variant="secondary"
        >
          ลองอีกครั้ง
        </Button>
      </div>
    );
  }

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
    <form action={formAction} className="mt-8 space-y-5" onSubmit={submitPreservingInput(formAction)} ref={formRef}>
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
          <p className="text-sm leading-6 text-danger" id="patient-password-error">
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
          >
            {fieldErrors.passwordConfirmation}
          </p>
        ) : null}
      </div>

      {errorMessage && !fieldErrors ? <Alert variant="danger">{errorMessage}</Alert> : null}

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
