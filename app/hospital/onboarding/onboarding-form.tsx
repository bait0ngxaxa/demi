"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName, LoadingSpinner } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialHospitalOnboardingSubmitActionState,
  type HospitalOnboardingSubmitActionState,
} from "@/modules/hospital-onboarding/transport/action-state";
import { submitHospitalOnboardingAction } from "@/modules/hospital-onboarding/transport/server-actions";

import {
  groupOnboardingHospitals,
  hospitalRoleLabel,
  type OnboardingHospitalOption,
} from "./hospital-groups";

type HospitalOnboardingFormProps = {
  hospitals: readonly OnboardingHospitalOption[];
};

function normalizeSearchValue(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("th-TH").trim();
}

export function HospitalOnboardingForm({ hospitals }: HospitalOnboardingFormProps) {
  const [state, formAction, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<
    HospitalOnboardingSubmitActionState,
    FormData
  >(submitHospitalOnboardingAction, initialHospitalOnboardingSubmitActionState);
  const [hospitalQuery, setHospitalQuery] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const changeHospitalButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterSelectionRef = useRef<"search" | "change" | null>(null);
  const selectionGroups = useMemo(() => groupOnboardingHospitals(hospitals), [hospitals]);
  const selectedHospital = hospitals.find((hospital) => hospital.id === selectedHospitalId);
  const selectedHospitalContext = selectedHospital ? hospitalRoleLabel(selectedHospital) : null;
  const selectedHospitalStatus = selectedHospital
    ? `เลือกแล้ว: ${selectedHospital.name}${selectedHospitalContext ? ` ${selectedHospitalContext}` : ""}`
    : "กรุณาเลือกโรงพยาบาลจากรายการ";
  const visibleSelectionGroups = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(hospitalQuery);
    if (!normalizedQuery) return selectionGroups;

    return selectionGroups.flatMap((group) => {
      const hospitals = group.hospitals.filter((hospital) =>
        normalizeSearchValue(hospital.name).includes(normalizedQuery),
      );
      return hospitals.length > 0 ? [{ ...group, hospitals }] : [];
    });
  }, [hospitalQuery, selectionGroups]);
  const hasVisibleHospitals = visibleSelectionGroups.length > 0;
  const errorMessage = state.status === "ERROR" ? state.message : undefined;
  const fieldErrors = state.status === "ERROR" ? state.fieldErrors ?? {} : {};

  function selectHospital(hospitalId: string): void {
    focusAfterSelectionRef.current = "change";
    setSelectedHospitalId(hospitalId);
    setHospitalQuery("");
  }

  useEffect(() => {
    const focusTarget = focusAfterSelectionRef.current;
    focusAfterSelectionRef.current = null;

    if (focusTarget === "change") changeHospitalButtonRef.current?.focus();
    if (focusTarget === "search") searchInputRef.current?.focus();
  }, [selectedHospitalId]);

  useEffect(() => {
    if (state.status !== "ERROR" || !state.fieldErrors) {
      return;
    }

    if (state.fieldErrors.hospitalCode) {
      (selectedHospital ? changeHospitalButtonRef.current : searchInputRef.current)?.focus();
      return;
    }

    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [selectedHospital, state]);

  if (state.status === "SUCCESS") {
    return (
      <div className="space-y-6">
        <Alert variant="success">
          <h3 className="font-semibold">ส่งคำขอเรียบร้อยแล้ว</h3>
          <p className="mt-2">
            ระบบได้รับคำขอของคุณแล้ว กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติก่อนเข้าสู่ระบบ
          </p>
        </Alert>
        <Link
          className={buttonClassName({ variant: "secondary", className: "w-full sm:w-auto" })}
          href="/login"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-7" onSubmit={submitPreservingInput(formAction)} ref={formRef}>
      <div className="rounded-[12px] bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-deep">
        ข้อมูลที่ส่งจะใช้เพื่อจับคู่ตัวตนและตรวจสอบคำขอเท่านั้น
        ผู้ดูแลระบบจะเป็นผู้อนุมัติสิทธิ์ของโรงพยาบาลภายหลัง
      </div>

      <fieldset
        aria-invalid={fieldErrors.hospitalCode ? true : undefined}
        aria-describedby={fieldErrors.hospitalCode ? "hospitalCode-error" : undefined}
        className="space-y-4"
      >
        <legend className="text-lg font-semibold tracking-[-0.02em]">เลือกโรงพยาบาล</legend>
        {selectedHospital ? (
          <div className="flex items-start justify-between gap-4 rounded-[12px] border border-brand bg-brand-soft p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-strong">เลือกแล้ว</p>
              <p className="mt-1 break-words font-semibold text-ink">{selectedHospital.name}</p>
              {selectedHospitalContext ? (
                <p className="mt-1 break-words text-sm leading-6 text-muted">
                  {selectedHospitalContext}
                </p>
              ) : null}
            </div>
            <button
              className="min-h-11 shrink-0 rounded-[12px] border border-line bg-white px-3 text-sm font-semibold text-ink transition-[border-color,color,background-color] hover:border-brand hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              disabled={pending}
              ref={changeHospitalButtonRef}
              onClick={() => {
                focusAfterSelectionRef.current = "search";
                setSelectedHospitalId("");
                setHospitalQuery("");
              }}
              type="button"
            >
              เปลี่ยนโรงพยาบาล
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-ink" htmlFor="hospitalSearch">
                ค้นหาชื่อโรงพยาบาลหรือโรงพยาบาลแม่ข่าย
              </label>
              <input
                autoComplete="off"
                className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
                disabled={pending || hospitals.length === 0}
                id="hospitalSearch"
                onChange={(event) => setHospitalQuery(event.target.value)}
                placeholder="เช่น โรงพยาบาลแก่งคอย"
                ref={searchInputRef}
                type="search"
                value={hospitalQuery}
              />
            </div>

            <div
              aria-label="รายการโรงพยาบาลที่เลือกได้"
              aria-describedby={fieldErrors.hospitalCode ? "hospitalCode-error" : undefined}
              className="max-h-80 min-w-0 space-y-3 overflow-y-auto rounded-[12px] border border-line bg-canvas p-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              role="region"
              tabIndex={0}
            >
              {hospitals.length === 0 ? (
                <p className="px-3 py-4 text-sm leading-6 text-muted">
                  ยังไม่มีโรงพยาบาลที่เปิดรับคำขอในขณะนี้
                </p>
              ) : !hasVisibleHospitals ? (
                <p className="px-3 py-4 text-sm leading-6 text-muted">
                  ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา
                </p>
              ) : (
                <>
                  {visibleSelectionGroups.map((group) => {
                    const headingId = `hospital-group-${group.key}`;

                    return (
                      <section aria-labelledby={headingId} className="min-w-0" key={group.key}>
                        <h3
                          className="break-words px-3 py-2 text-sm font-semibold text-ink"
                          id={headingId}
                        >
                          {group.title}
                        </h3>
                        <ul className="space-y-2">
                          {group.hospitals.map((hospital) => (
                            <li key={hospital.id}>
                              <button
                                aria-label={`เลือกโรงพยาบาล ${hospital.name}`}
                                className="w-full rounded-[10px] border border-transparent bg-white/70 px-3 py-3 text-left transition-[border-color,background-color] hover:border-line hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                                disabled={pending}
                                onClick={() => selectHospital(hospital.id)}
                                type="button"
                              >
                                <span className="block break-words font-semibold text-ink">
                                  {hospital.name}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}

        <input name="hospitalCode" type="hidden" value={selectedHospital?.hospitalCode ?? ""} />
        <p className="min-h-6 text-sm leading-6 text-muted" aria-live="polite" role="status">
          {selectedHospitalStatus}
        </p>
        {fieldErrors.hospitalCode ? (
          <p className="text-sm leading-6 text-danger" id="hospitalCode-error">
            {fieldErrors.hospitalCode}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-7">
        <legend className="text-lg font-semibold tracking-[-0.02em]">ข้อมูลผู้สมัคร</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-ink" htmlFor="givenName">
              ชื่อ
            </label>
            <input
              aria-describedby={fieldErrors.givenName ? "givenName-error" : undefined}
              aria-invalid={fieldErrors.givenName ? true : undefined}
              autoComplete="given-name"
              className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
              disabled={pending}
              id="givenName"
              maxLength={120}
              name="givenName"
              required
              type="text"
            />
            {fieldErrors.givenName ? (
              <p className="text-sm leading-6 text-danger" id="givenName-error">
                {fieldErrors.givenName}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-ink" htmlFor="familyName">
              นามสกุล
            </label>
            <input
              aria-describedby={fieldErrors.familyName ? "familyName-error" : undefined}
              aria-invalid={fieldErrors.familyName ? true : undefined}
              autoComplete="family-name"
              className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
              disabled={pending}
              id="familyName"
              maxLength={120}
              name="familyName"
              required
              type="text"
            />
            {fieldErrors.familyName ? (
              <p className="text-sm leading-6 text-danger" id="familyName-error">
                {fieldErrors.familyName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink" htmlFor="nationalId">
            เลขบัตรประชาชน
          </label>
          <input
            aria-describedby={fieldErrors.nationalId ? "nationalId-error" : undefined}
            aria-invalid={fieldErrors.nationalId ? true : undefined}
            autoCapitalize="none"
            autoComplete="username"
            className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
            disabled={pending}
            id="nationalId"
            inputMode="numeric"
            maxLength={13}
            name="nationalId"
            pattern="[0-9]{13}"
            placeholder="เลข 13 หลัก"
            required
            spellCheck={false}
            type="text"
          />
          {fieldErrors.nationalId ? (
            <p className="text-sm leading-6 text-danger" id="nationalId-error">
              {fieldErrors.nationalId}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-7">
        <legend className="text-lg font-semibold tracking-[-0.02em]">สร้างรหัสผ่านของคุณ</legend>
        <p className="text-sm leading-6 text-muted">
          ใช้รหัสผ่านที่คุณเป็นเจ้าของเองอย่างน้อย 12 ตัวอักษร และอย่าใช้เลขบัตรประชาชนเป็นรหัสผ่าน
        </p>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink" htmlFor="password">
            รหัสผ่าน
          </label>
          <input
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            aria-invalid={fieldErrors.password ? true : undefined}
            autoComplete="new-password"
            className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
            disabled={pending}
            id="password"
            minLength={12}
            maxLength={128}
            name="password"
            required
            type="password"
          />
          {fieldErrors.password ? (
            <p className="text-sm leading-6 text-danger" id="password-error">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink" htmlFor="passwordConfirmation">
            ยืนยันรหัสผ่าน
          </label>
          <input
            aria-describedby={
              fieldErrors.passwordConfirmation ? "passwordConfirmation-error" : undefined
            }
            aria-invalid={fieldErrors.passwordConfirmation ? true : undefined}
            autoComplete="new-password"
            className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
            disabled={pending}
            id="passwordConfirmation"
            minLength={12}
            maxLength={128}
            name="passwordConfirmation"
            required
            type="password"
          />
          {fieldErrors.passwordConfirmation ? (
            <p
              className="text-sm leading-6 text-danger"
              id="passwordConfirmation-error"
            >
              {fieldErrors.passwordConfirmation}
            </p>
          ) : null}
        </div>
      </fieldset>

      {state.status === "ERROR" && errorMessage && !Object.keys(fieldErrors).length ? (
        <Alert role="alert" variant={state.code === "UNAVAILABLE" ? "warning" : "danger"}>
          {errorMessage}
        </Alert>
      ) : null}

      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />

      <button
        aria-busy={pending || undefined}
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] transition-[background-color,box-shadow,transform] hover:bg-brand-strong hover:shadow-[0_10px_26px_rgba(18,103,89,0.28)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
        disabled={pending || unknownOutcome || hospitals.length === 0 || !selectedHospital}
        type="submit"
      >
        {pending ? <LoadingSpinner className="mr-2" /> : null}
        {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอใช้งาน DEMI"}
      </button>
    </form>
  );
}
