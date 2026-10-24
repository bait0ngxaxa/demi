"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName, LoadingSpinner } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialWorkforceCompletionActionState,
  type WorkforceActivationPreviewState,
  type WorkforceCompletionActionState,
} from "@/modules/workforce/transport/action-state";
import {
  completeWorkforceActivationAction,
  previewWorkforceActivationAction,
} from "@/modules/workforce/transport/server-actions";

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

export function WorkforceActivationForm(): React.JSX.Element {
  const store = useMemo(() => createActivationTokenStore(), []);
  const token = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [preview, setPreview] = useState<WorkforceActivationPreviewState | null>(null);
  const [previewFailedToken, setPreviewFailedToken] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const terminalStatusRef = useRef<HTMLDivElement>(null);
  const purpose = preview?.status === "SUCCESS" ? preview.purpose : "ACTIVATION";
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<
    WorkforceCompletionActionState,
    FormData
  >(
    completeWorkforceActivationAction.bind(null, token ?? "", purpose),
    initialWorkforceCompletionActionState,
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
      (state.status === "ERROR" && (state.code === "CONFLICT" || state.code === "FORBIDDEN"))
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
    if (
      state.status === "SUCCESS" ||
      (state.status === "ERROR" && (state.code === "CONFLICT" || state.code === "FORBIDDEN"))
    ) {
      terminalStatusRef.current?.focus();
    }
  }, [state]);

  useEffect(() => {
    if (preview?.status === "ERROR") {
      terminalStatusRef.current?.focus();
    }
  }, [preview]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    previewWorkforceActivationAction(token).then(
      (result) => {
        if (active) {
          setPreview(result);
        }
      },
      () => {
        if (active) {
          setPreviewFailedToken(token);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [token, previewAttempt]);

  const fieldErrors = state.status === "ERROR" ? state.fieldErrors : undefined;
  const errorMessage = state.status === "ERROR" ? state.message : undefined;

  if (state.status === "SUCCESS") {
    const isReset = purpose === "RESET";
    const isChildOwner = purpose === "CHILD_OWNER_ONBOARDING";
    const title = isReset
      ? "ตั้งรหัสผ่านใหม่สำเร็จแล้ว"
      : isChildOwner
        ? "เปิดใช้งานบัญชีผู้ดูแลหน่วยบริการสำเร็จแล้ว"
        : "ตั้งรหัสผ่านสำเร็จแล้ว";
    const body = isReset
      ? "กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ของคุณ"
      : isChildOwner
        ? "บัญชีผู้ดูแลหน่วยบริการของคุณพร้อมใช้งานแล้ว สามารถเข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้"
        : "บัญชีของคุณพร้อมใช้งานแล้ว สามารถเข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้";

    return (
      <section className="mt-8 space-y-4">
        <div
          aria-describedby="workforce-activation-success-description"
          aria-live="off"
          aria-labelledby="workforce-activation-success-title"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={terminalStatusRef}
          role="status"
          tabIndex={-1}
        >
          <Alert role="none" variant="success">
            <h3 className="font-semibold" id="workforce-activation-success-title">{title}</h3>
            <p className="mt-1" id="workforce-activation-success-description">{body}</p>
          </Alert>
        </div>
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
            message:
              purpose === "RESET"
                ? "ระบบยังยืนยันไม่ได้ว่าการเปลี่ยนรหัสผ่านสำเร็จหรือไม่"
                : "ระบบยังยืนยันไม่ได้ว่าการเปิดใช้งานสำเร็จหรือไม่",
            note:
              purpose === "RESET"
                ? "หากเปลี่ยนรหัสผ่านสำเร็จ ให้ลองเข้าสู่ระบบด้วยรหัสผ่านใหม่ หากเข้าไม่ได้ กรุณาติดต่อโรงพยาบาลเพื่อขอความช่วยเหลือ"
                : "หากตั้งรหัสผ่านสำเร็จ ให้ลองเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ หากเข้าไม่ได้ กรุณาติดต่อโรงพยาบาลเพื่อขอลิงก์ใหม่",
          }}
        />
        <Link className={buttonClassName({ variant: "secondary", className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (
    state.status === "ERROR" &&
    (state.code === "CONFLICT" || state.code === "FORBIDDEN")
  ) {
    const message = state.code === "CONFLICT"
      ? "ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว กรุณาติดต่อโรงพยาบาลเพื่อขอลิงก์ใหม่"
      : "ไม่สามารถดำเนินการผ่านลิงก์นี้ได้ กรุณาติดต่อโรงพยาบาลเพื่อขอความช่วยเหลือ";

    return (
      <section className="mt-8 space-y-4">
        <div
          aria-describedby="workforce-activation-terminal-description"
          aria-live="off"
          aria-labelledby="workforce-activation-terminal-title"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={terminalStatusRef}
          role="status"
          tabIndex={-1}
        >
          <Alert role="none" variant="warning">
            <p className="font-semibold" id="workforce-activation-terminal-title">
              {state.code === "CONFLICT" ? "ลิงก์นี้ใช้ไม่ได้แล้ว" : "ไม่สามารถใช้ลิงก์นี้ได้"}
            </p>
            <p className="mt-1" id="workforce-activation-terminal-description">{message}</p>
          </Alert>
        </div>
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
        <p className="mt-1">
          ลิงก์เปิดใช้งานใช้ได้ครั้งเดียวต่อการเปิดลิงก์ หากกลับมาหน้านี้ให้เปิดลิงก์ต้นฉบับจากข้อความหรือสแกน QR อีกครั้ง หรือขอลิงก์ใหม่จากโรงพยาบาล
        </p>
      </div>
    );
  }

  if (!preview && previewFailedToken === token) {
    return (
      <div className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="alert">
        <p className="font-semibold">ตรวจสอบลิงก์ไม่สำเร็จ</p>
        <p className="mt-1">เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p>
        <Button
          className="mt-3"
          onClick={() => {
            setPreviewFailedToken(null);
            setPreviewAttempt((attempt) => attempt + 1);
          }}
          size="compact"
          variant="secondary"
        >
          ลองอีกครั้ง
        </Button>
      </div>
    );
  }

  if (!preview) {
    return (
      <p className="mt-8 text-sm leading-6 text-muted" role="status">
        กำลังตรวจสอบลิงก์...
      </p>
    );
  }

  if (preview.status === "ERROR") {
    return (
      <div
        aria-describedby="workforce-link-error-description"
        aria-live="off"
        aria-labelledby="workforce-link-error-title"
        className="mt-8 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        ref={terminalStatusRef}
        role="alert"
        tabIndex={-1}
      >
        <p className="font-semibold" id="workforce-link-error-title">ไม่สามารถใช้ลิงก์นี้ได้</p>
        <p className="mt-1" id="workforce-link-error-description">{preview.message}</p>
        <p className="mt-1">ขอลิงก์ใหม่จากผู้ดูแลโรงพยาบาล แล้วเปิดลิงก์อีกครั้ง</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5" onSubmit={submitPreservingInput(formAction)} ref={formRef}>
      <div className="rounded-[14px] bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-deep">
        <p>
          {purpose === "RESET"
            ? "รีเซ็ตรหัสผ่านของ"
            : purpose === "CHILD_OWNER_ONBOARDING"
              ? "เปิดใช้งานบัญชีผู้ดูแลหน่วยบริการของ"
              : "เปิดใช้งานบัญชีของ"}{" "}
          <span className="font-semibold">{preview.maskedName}</span>
        </p>
        <p className="mt-1">
          ลิงก์นี้ใช้ได้ครั้งเดียว กรุณากรอกเลขบัตรประชาชนของคุณเองและตั้งรหัสผ่านด้วยตนเอง
          อย่าบอกให้ผู้อื่นทราบ
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="nationalId">
          เลขบัตรประชาชน 13 หลัก
        </label>
        <input
          aria-describedby={fieldErrors?.nationalId ? "nationalId-error" : undefined}
          aria-invalid={fieldErrors?.nationalId ? true : undefined}
          autoComplete="off"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="nationalId"
          inputMode="numeric"
          maxLength={13}
          name="nationalId"
          pattern="[0-9]{13}"
          required
          type="text"
        />
        {fieldErrors?.nationalId ? (
          <p className="text-sm leading-6 text-danger" id="nationalId-error">
            {fieldErrors.nationalId}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="password">
          รหัสผ่านใหม่
        </label>
        <input
          aria-describedby={fieldErrors?.password ? "password-error" : undefined}
          aria-invalid={fieldErrors?.password ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
        {fieldErrors?.password ? (
          <p className="text-sm leading-6 text-danger" id="password-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="passwordConfirmation">
          ยืนยันรหัสผ่านใหม่
        </label>
        <input
          aria-describedby={
            fieldErrors?.passwordConfirmation ? "passwordConfirmation-error" : undefined
          }
          aria-invalid={fieldErrors?.passwordConfirmation ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="passwordConfirmation"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
        {fieldErrors?.passwordConfirmation ? (
          <p className="text-sm leading-6 text-danger" id="passwordConfirmation-error">
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
        {pending
          ? purpose === "RESET"
            ? "กำลังตั้งรหัสผ่าน..."
            : "กำลังเปิดใช้งานบัญชี..."
          : purpose === "RESET"
            ? "ตั้งรหัสผ่านใหม่"
            : "เปิดใช้งานบัญชี"}
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
