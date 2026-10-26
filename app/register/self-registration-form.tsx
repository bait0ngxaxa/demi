"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { thaiNationalIdFormatSchema } from "@/modules/identity/schemas/identity-schemas";
import { PasswordInput } from "@/components/ui/password-input";

const lookupValidationErrorSchema = z.object({
  message: z.literal("กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง"),
}).strict();

const lookupResponseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("FOUND"), capability: z.string().min(1), maskedName: z.string() }).strict(),
  z.object({ outcome: z.literal("NOT_FOUND"), message: z.string() }).strict(),
  z.object({ outcome: z.literal("ALREADY_ACTIVE"), message: z.string() }).strict(),
  z.object({ outcome: z.literal("RETRY"), message: z.string() }).strict(),
]);

const completionResponseSchema = z.object({
  status: z.enum(["SUCCESS", "ERROR"]),
  message: z.string().optional(),
}).strict();

type LookupOutcome = z.infer<typeof lookupResponseSchema>;
type RegistrationField = "nationalId" | "nameConfirmed" | "password" | "passwordConfirmation";
type CompletionStatus = "IDLE" | "SUCCESS" | "UNCONFIRMED" | "REJECTED";

const retryLookupOutcome: LookupOutcome = {
  outcome: "RETRY",
  message: "ระบบยังไม่พร้อมตรวจสอบข้อมูลในขณะนี้ กรุณารอสักครู่แล้วลองอีกครั้ง",
};

function responseMessage(outcome: LookupOutcome): string | null {
  switch (outcome.outcome) {
    case "NOT_FOUND":
    case "RETRY":
      return outcome.message;
    case "FOUND":
    case "ALREADY_ACTIVE":
      return null;
  }
}

export function SelfRegistrationForm(): React.JSX.Element {
  const [nationalId, setNationalId] = useState("");
  const [capability, setCapability] = useState<string | null>(null);
  const [maskedName, setMaskedName] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>("IDLE");
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const lookupInputRef = useRef<HTMLInputElement>(null);
  const completionFormRef = useRef<HTMLFormElement>(null);
  const terminalStatusRef = useRef<HTMLDivElement>(null);
  const completionErrorRef = useRef<HTMLDivElement>(null);
  const focusErrorsRef = useRef(false);

  useEffect(() => {
    if (!focusErrorsRef.current) {
      return;
    }
    focusErrorsRef.current = false;

    if (fieldErrors.nationalId) {
      lookupInputRef.current?.focus();
      return;
    }

    completionFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  useEffect(() => {
    if (
      completionStatus === "SUCCESS" ||
      completionStatus === "REJECTED" ||
      (completionStatus === "IDLE" && outcome?.outcome === "ALREADY_ACTIVE")
    ) {
      terminalStatusRef.current?.focus();
    }
  }, [completionStatus, outcome]);

  useEffect(() => {
    if (completionStatus === "IDLE" && completionMessage) {
      completionErrorRef.current?.focus();
    }
  }, [completionMessage, completionStatus]);

  function clearCompletionData(): void {
    setNationalId("");
    setCapability(null);
    setMaskedName(null);
    setOutcome(null);
    setNameConfirmed(false);
    setPassword("");
    setPasswordConfirmation("");
    setFieldErrors({});
  }

  async function lookupNationalId(): Promise<void> {
    const parsedNationalId = thaiNationalIdFormatSchema.safeParse(nationalId);
    if (!parsedNationalId.success) {
      focusErrorsRef.current = true;
      setFieldErrors({ nationalId: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" });
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setOutcome(null);
    setCapability(null);
    setMaskedName(null);
    setNameConfirmed(false);
    setPassword("");
    setPasswordConfirmation("");
    setCompletionMessage(null);
    setCompletionStatus("IDLE");
    try {
      const response = await fetch("/api/v1/self-registration/lookup", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: parsedNationalId.data }),
      });

      if (response.status === 429 || response.status >= 500 || !response.ok) {
        if (response.status === 400) {
          const body: unknown = await response.json();
          const validationError = lookupValidationErrorSchema.safeParse(body);
          if (validationError.success) {
            focusErrorsRef.current = true;
            setFieldErrors({ nationalId: validationError.data.message });
            return;
          }
        }
        setOutcome(retryLookupOutcome);
        return;
      }

      const body: unknown = await response.json();
      const parsed = lookupResponseSchema.safeParse(body);
      if (!parsed.success) {
        setOutcome(retryLookupOutcome);
        return;
      }

      if (parsed.data.outcome === "RETRY") {
        setOutcome(retryLookupOutcome);
        return;
      }

      setOutcome(parsed.data);
      if (parsed.data.outcome === "FOUND") {
        setCapability(parsed.data.capability);
        setMaskedName(parsed.data.maskedName);
      }
    } catch {
      setOutcome(retryLookupOutcome);
    } finally {
      setBusy(false);
    }
  }

  async function checkNationalId(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await lookupNationalId();
  }

  async function completeRegistration(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors: Partial<Record<RegistrationField, string>> = {};

    if (!capability || !maskedName || !nameConfirmed) {
      nextErrors.nameConfirmed = "กรุณายืนยันว่าชื่อที่แสดงเป็นชื่อของคุณ";
    }
    if (password.length < 12 || password.length > 128) {
      nextErrors.password = "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร";
    }
    if (password !== passwordConfirmation) {
      nextErrors.passwordConfirmation = "รหัสผ่านไม่ตรงกัน กรุณากรอกให้ตรงกัน";
    }
    if (Object.keys(nextErrors).length > 0) {
      focusErrorsRef.current = true;
      setFieldErrors(nextErrors);
      setCompletionMessage(null);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setCompletionMessage(null);
    try {
      const response = await fetch("/api/v1/self-registration/complete", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: capability,
          nationalId,
          password,
          passwordConfirmation,
          nameConfirmed,
        }),
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        clearCompletionData();
        setCompletionStatus("UNCONFIRMED");
        return;
      }

      const parsed = completionResponseSchema.safeParse(body);
      if (response.ok && parsed.success && parsed.data.status === "SUCCESS") {
        clearCompletionData();
        setCompletionStatus("SUCCESS");
        return;
      }

      if (response.status >= 500 || !parsed.success || response.ok) {
        clearCompletionData();
        setCompletionStatus("UNCONFIRMED");
        return;
      }

      if (parsed.data.status === "ERROR" && response.status === 400) {
        setCompletionMessage("ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบข้อมูลที่กรอกแล้วลองอีกครั้ง");
        return;
      }

      if (response.status === 400) {
        clearCompletionData();
        setCompletionStatus("UNCONFIRMED");
        return;
      }

      clearCompletionData();
      setCompletionMessage(
        "ไม่สามารถลงทะเบียนได้ กรุณาเริ่มตรวจสอบใหม่ หรือเข้าสู่ระบบหากบัญชีเปิดใช้งานแล้ว",
      );
      setCompletionStatus("REJECTED");
    } catch {
      clearCompletionData();
      setCompletionStatus("UNCONFIRMED");
    } finally {
      setBusy(false);
    }
  }

  function startOver(): void {
    clearCompletionData();
    setCompletionStatus("IDLE");
    setCompletionMessage(null);
  }

  if (completionStatus === "SUCCESS") {
    return (
      <section className="mt-7 space-y-4">
        <div
          aria-describedby="registration-success-description"
          aria-live="off"
          aria-labelledby="registration-success-title"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={terminalStatusRef}
          role="status"
          tabIndex={-1}
        >
          <Alert role="none" variant="success">
            <h3 className="font-semibold" id="registration-success-title">ตั้งรหัสผ่านสำเร็จแล้ว</h3>
            <p className="mt-1" id="registration-success-description">
              บัญชีของคุณพร้อมใช้งานแล้ว สามารถเข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้
            </p>
          </Alert>
        </div>
        <Link className={buttonClassName({ className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (completionStatus === "UNCONFIRMED") {
    return (
      <section className="mt-7 space-y-4">
        <Alert role="alert" variant="warning">
          <h3 className="font-semibold">ยังยืนยันผลการลงทะเบียนไม่ได้</h3>
          <p className="mt-1">
            คำขออาจดำเนินการแล้วหรือยังไม่เสร็จ กรุณาอย่าส่งคำขอเดิมซ้ำ หากคิดว่าตั้งรหัสผ่านสำเร็จ ให้ลองเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้
          </p>
          <p className="mt-1">
            หากเข้าสู่ระบบไม่ได้ กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอคำแนะนำ
          </p>
        </Alert>
        <Link className={buttonClassName({ className: "w-full" })} href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
        <p className="text-center text-sm leading-6 text-muted">
          <Link className="font-semibold text-brand-strong underline underline-offset-4" href="/recover">
            ดูแนวทางกู้คืนบัญชี
          </Link>
        </p>
      </section>
    );
  }

  if (completionStatus === "REJECTED") {
    return (
      <section className="mt-7 space-y-4">
        <div
          aria-describedby="registration-rejected-description"
          aria-live="off"
          aria-labelledby="registration-rejected-title"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={terminalStatusRef}
          role="alert"
          tabIndex={-1}
        >
          <Alert role="none" variant="danger">
            <h3 className="font-semibold" id="registration-rejected-title">ไม่สามารถลงทะเบียนได้</h3>
            <p className="mt-1" id="registration-rejected-description">{completionMessage}</p>
          </Alert>
        </div>
        <button
          className={buttonClassName({ variant: "secondary", className: "w-full" })}
          onClick={startOver}
          type="button"
        >
          เริ่มตรวจสอบใหม่
        </button>
        <Link className="block text-center text-sm font-semibold text-brand-strong underline underline-offset-4" href="/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </section>
    );
  }

  if (outcome?.outcome === "ALREADY_ACTIVE") {
    return (
      <section aria-labelledby="already-active-heading" className="mt-7 space-y-4">
        <div
          aria-describedby="already-active-description"
          aria-live="off"
          aria-labelledby="already-active-heading"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={terminalStatusRef}
          role="status"
          tabIndex={-1}
        >
          <Alert role="none" variant="info">
            <h3 className="font-semibold" id="already-active-heading">บัญชีนี้เปิดใช้งานแล้ว</h3>
            <p className="mt-1" id="already-active-description">
              กรุณาเข้าสู่ระบบ หากลืมรหัสผ่านหรือต้องการตรวจสอบบัญชี ให้ติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน
            </p>
          </Alert>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold">
          <Link className="min-h-11 inline-flex items-center text-brand-strong underline underline-offset-4" href="/login">
            เข้าสู่ระบบ
          </Link>
          <Link className="min-h-11 inline-flex items-center text-brand-strong underline underline-offset-4" href="/recover">
            ดูแนวทางกู้คืนบัญชี
          </Link>
        </div>
        <button className="min-h-11 text-sm font-semibold text-muted underline underline-offset-4" onClick={startOver} type="button">
          ตรวจสอบเลขบัตรอื่น
        </button>
      </section>
    );
  }

  if (!capability || !maskedName) {
    return (
      <form className="mt-7 space-y-5" noValidate onSubmit={checkNationalId}>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink" htmlFor="registration-national-id">
            เลขบัตรประชาชน 13 หลัก
          </label>
          <input
            aria-describedby={fieldErrors.nationalId ? "registration-national-id-error" : "registration-national-id-hint"}
            aria-invalid={fieldErrors.nationalId ? true : undefined}
            autoComplete="off"
            autoCapitalize="off"
            className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger aria-invalid:ring-danger"
            disabled={busy}
            id="registration-national-id"
            inputMode="numeric"
            maxLength={13}
            onChange={(event) => {
              setNationalId(event.target.value.replace(/\D/g, "").slice(0, 13));
              setOutcome(null);
              setFieldErrors({});
              setCompletionMessage(null);
            }}
            pattern="[0-9]{13}"
            placeholder="กรอกเลขบัตรประชาชน"
            ref={lookupInputRef}
            required
            value={nationalId}
          />
          {fieldErrors.nationalId ? (
            <p className="text-sm leading-6 text-danger" id="registration-national-id-error">
              {fieldErrors.nationalId}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted" id="registration-national-id-hint">
              กรอกตัวเลข 13 หลักที่โรงพยาบาลใช้จัดเตรียมบัญชีของคุณ
            </p>
          )}
        </div>

        {outcome?.outcome === "NOT_FOUND" ? (
          <Alert variant="info">
            <p className="font-semibold">ยังไม่พบข้อมูลสำหรับลงทะเบียน</p>
            <p className="mt-1">{responseMessage(outcome)}</p>
            <p className="mt-1">หากคิดว่าควรลงทะเบียนได้ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ</p>
          </Alert>
        ) : null}
        {outcome?.outcome === "RETRY" ? (
          <Alert variant="warning">
            <p>{responseMessage(outcome)}</p>
            <button
              className={buttonClassName({ variant: "secondary", size: "compact", className: "mt-3" })}
              disabled={busy}
              onClick={() => void lookupNationalId()}
              type="button"
            >
              ลองตรวจสอบอีกครั้ง
            </button>
          </Alert>
        ) : null}

        <button
          aria-busy={busy || undefined}
          className={buttonClassName({ className: "w-full" })}
          disabled={busy}
          type="submit"
        >
          {busy ? "กำลังตรวจสอบข้อมูล..." : "ตรวจสอบข้อมูล"}
        </button>
      </form>
    );
  }

  return (
    <form className="mt-7 space-y-5" noValidate onSubmit={completeRegistration} ref={completionFormRef}>
      <Alert variant="info">
        <p>
          ชื่อที่พบ: <span className="font-semibold">{maskedName}</span>
        </p>
        <p className="mt-1">ตรวจสอบชื่อก่อนตั้งรหัสผ่าน</p>
      </Alert>

      <div className="space-y-2">
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink" htmlFor="registration-name-confirmed">
          <input
            aria-describedby={fieldErrors.nameConfirmed ? "registration-name-confirmed-error" : undefined}
            aria-invalid={fieldErrors.nameConfirmed ? true : undefined}
            checked={nameConfirmed}
            className="mt-1 h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            disabled={busy}
            id="registration-name-confirmed"
            onChange={(event) => {
              setNameConfirmed(event.target.checked);
              setFieldErrors((errors) => ({ ...errors, nameConfirmed: undefined }));
              setCompletionMessage(null);
            }}
            required
            type="checkbox"
          />
          <span>ยืนยันว่าชื่อที่แสดงเป็นชื่อของฉัน</span>
        </label>
        {fieldErrors.nameConfirmed ? (
          <p className="text-sm leading-6 text-danger" id="registration-name-confirmed-error">
            {fieldErrors.nameConfirmed}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="registration-password">ตั้งรหัสผ่าน</label>
        <PasswordInput
          aria-describedby={fieldErrors.password ? "registration-password-error" : "registration-password-hint"}
          aria-invalid={fieldErrors.password ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger aria-invalid:ring-danger"
          disabled={busy}
          id="registration-password"
          maxLength={128}
          minLength={12}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((errors) => ({ ...errors, password: undefined }));
            setCompletionMessage(null);
          }}
          required
          value={password}
        />
        {fieldErrors.password ? (
          <p className="text-sm leading-6 text-danger" id="registration-password-error">
            {fieldErrors.password}
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted" id="registration-password-hint">
            ใช้รหัสผ่าน 12–128 ตัวอักษร
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="registration-password-confirmation">ยืนยันรหัสผ่าน</label>
        <PasswordInput
          aria-describedby={fieldErrors.passwordConfirmation ? "registration-password-confirmation-error" : undefined}
          aria-invalid={fieldErrors.passwordConfirmation ? true : undefined}
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger aria-invalid:ring-danger"
          disabled={busy}
          id="registration-password-confirmation"
          maxLength={128}
          minLength={12}
          onChange={(event) => {
            setPasswordConfirmation(event.target.value);
            setFieldErrors((errors) => ({ ...errors, passwordConfirmation: undefined }));
            setCompletionMessage(null);
          }}
          required
          value={passwordConfirmation}
        />
        {fieldErrors.passwordConfirmation ? (
          <p className="text-sm leading-6 text-danger" id="registration-password-confirmation-error">
            {fieldErrors.passwordConfirmation}
          </p>
        ) : null}
      </div>

      {completionMessage ? (
        <div
          aria-describedby="registration-completion-error-description"
          aria-live="off"
          aria-labelledby="registration-completion-error-title"
          className="rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          ref={completionErrorRef}
          role="alert"
          tabIndex={-1}
        >
          <Alert role="none" variant="danger">
            <h3 className="font-semibold" id="registration-completion-error-title">
              ตรวจสอบข้อมูลก่อนส่งอีกครั้ง
            </h3>
            <p className="mt-1" id="registration-completion-error-description">
              {completionMessage}
            </p>
          </Alert>
        </div>
      ) : null}

      <button
        aria-busy={busy || undefined}
        className={buttonClassName({ className: "w-full" })}
        disabled={busy}
        type="submit"
      >
        {busy ? "กำลังลงทะเบียน..." : "ตั้งรหัสผ่านและลงทะเบียน"}
      </button>
      <button
        className="min-h-11 w-full text-sm font-semibold text-muted underline underline-offset-4"
        disabled={busy}
        onClick={startOver}
        type="button"
      >
        เริ่มตรวจสอบใหม่
      </button>
    </form>
  );
}
