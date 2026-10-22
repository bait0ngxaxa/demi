"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";

import { thaiNationalIdFormatSchema } from "@/modules/identity/schemas/identity-schemas";

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
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function checkNationalId(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedNationalId = thaiNationalIdFormatSchema.safeParse(nationalId);
    if (!parsedNationalId.success) {
      setValidationMessage("กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง");
      return;
    }

    setBusy(true);
    setValidationMessage(null);
    setOutcome(null);
    setCompletionMessage(null);
    try {
      const response = await fetch("/api/v1/self-registration/lookup", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: parsedNationalId.data }),
      });
      const body: unknown = await response.json();
      if (response.status === 400) {
        const validationError = lookupValidationErrorSchema.safeParse(body);
        if (validationError.success) {
          setValidationMessage(validationError.data.message);
          setOutcome(null);
          return;
        }
      }

      const parsed = lookupResponseSchema.safeParse(body);
      if (!parsed.success) {
        setOutcome({ outcome: "RETRY", message: "ลองใหม่ภายหลัง" });
        return;
      }

      setOutcome(parsed.data);
      if (parsed.data.outcome === "FOUND") {
        setCapability(parsed.data.capability);
        setMaskedName(parsed.data.maskedName);
      } else {
        setCapability(null);
        setMaskedName(null);
      }
    } catch {
      setOutcome({ outcome: "RETRY", message: "ลองใหม่ภายหลัง" });
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!capability || !nameConfirmed) {
      setCompletionMessage("กรุณายืนยันชื่อที่แสดงก่อนตั้งรหัสผ่าน");
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setCompletionMessage("รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร");
      return;
    }
    if (password !== passwordConfirmation) {
      setCompletionMessage("กรุณายืนยันรหัสผ่านให้ตรงกัน");
      return;
    }

    setBusy(true);
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
      const body: unknown = await response.json();
      const parsed = completionResponseSchema.safeParse(body);
      if (parsed.success && parsed.data.status === "SUCCESS") {
        window.location.replace("/login?activated=1");
        return;
      }
      setCompletionMessage(
        parsed.success && parsed.data.message
          ? parsed.data.message
          : "ไม่สามารถลงทะเบียนได้ กรุณาเริ่มต้นใหม่หรือลองใหม่ภายหลัง",
      );
    } catch {
      setCompletionMessage("ไม่สามารถลงทะเบียนได้ กรุณาเริ่มต้นใหม่หรือลองใหม่ภายหลัง");
    } finally {
      setBusy(false);
    }
  }

  function startOver(): void {
    setNationalId("");
    setCapability(null);
    setMaskedName(null);
    setOutcome(null);
    setValidationMessage(null);
    setNameConfirmed(false);
    setPassword("");
    setPasswordConfirmation("");
    setCompletionMessage(null);
  }

  if (outcome?.outcome === "ALREADY_ACTIVE") {
    return (
      <section aria-labelledby="already-active-heading" className="mt-7 space-y-4" role="status">
        <div className="rounded-[14px] border border-line bg-surface px-4 py-4 text-sm leading-6 text-ink">
          <h3 className="font-semibold" id="already-active-heading">บัญชีนี้เปิดใช้งานแล้ว</h3>
          <p className="mt-1">หากไม่ใช่คุณ กรุณาติดต่อโรงพยาบาลทันที</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link className="text-brand-strong underline underline-offset-4" href="/login">เข้าสู่ระบบ</Link>
          <Link className="text-brand-strong underline underline-offset-4" href="/recover">ดูแนวทางกู้คืนบัญชี</Link>
        </div>
        <button className="min-h-11 text-sm font-semibold text-muted underline underline-offset-4" onClick={startOver} type="button">
          ตรวจสอบเลขบัตรอื่น
        </button>
      </section>
    );
  }

  if (!capability || !maskedName) {
    return (
      <form className="mt-7 space-y-5" onSubmit={checkNationalId}>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink" htmlFor="registration-national-id">
            เลขบัตรประชาชน 13 หลัก
          </label>
          <input
            autoComplete="off"
            autoCapitalize="off"
            className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
            disabled={busy}
            id="registration-national-id"
            inputMode="numeric"
            maxLength={13}
            onChange={(event) => {
              setNationalId(event.target.value.replace(/\D/g, "").slice(0, 13));
              setOutcome(null);
              setValidationMessage(null);
            }}
            pattern="[0-9]{13}"
            placeholder="กรอกเลขบัตรประชาชน"
            required
            value={nationalId}
          />
        </div>

        {validationMessage ? (
          <div aria-live="polite" className="rounded-[14px] border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink" role="alert">
            {validationMessage}
          </div>
        ) : null}
        {outcome ? (
          <div aria-live="polite" className="rounded-[14px] border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink" role="alert">
            {responseMessage(outcome)}
          </div>
        ) : null}

        <button
          aria-busy={busy || undefined}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
          disabled={busy}
          type="submit"
        >
          {busy ? "กำลังตรวจสอบข้อมูล..." : "ตรวจสอบข้อมูล"}
        </button>
      </form>
    );
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={completeRegistration}>
      <div className="rounded-[14px] bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-deep">
        <p>
          ชื่อที่พบ: <span className="font-semibold">{maskedName}</span>
        </p>
        <p className="mt-1">ตรวจสอบชื่อก่อนตั้งรหัสผ่าน</p>
      </div>

      <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink">
        <input
          checked={nameConfirmed}
          className="mt-1 h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          disabled={busy}
          onChange={(event) => setNameConfirmed(event.target.checked)}
          type="checkbox"
        />
        <span>ยืนยันว่าชื่อที่แสดงเป็นชื่อของฉัน</span>
      </label>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="registration-password">ตั้งรหัสผ่าน</label>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={busy}
          id="registration-password"
          maxLength={128}
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <p className="text-sm leading-6 text-muted">ใช้รหัสผ่าน 12–128 ตัวอักษร</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="registration-password-confirmation">ยืนยันรหัสผ่าน</label>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={busy}
          id="registration-password-confirmation"
          maxLength={128}
          minLength={12}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          required
          type="password"
          value={passwordConfirmation}
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {completionMessage ? <p className="text-sm leading-6 text-danger" role="alert">{completionMessage}</p> : null}
      </div>

      <button
        aria-busy={busy || undefined}
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
        disabled={busy || !nameConfirmed}
        type="submit"
      >
        {busy ? "กำลังลงทะเบียน..." : "ตั้งรหัสผ่านและลงทะเบียน"}
      </button>
      <button className="min-h-11 w-full text-sm font-semibold text-muted underline underline-offset-4" disabled={busy} onClick={startOver} type="button">
        เริ่มตรวจสอบใหม่
      </button>
    </form>
  );
}
