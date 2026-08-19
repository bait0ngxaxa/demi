"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { LoadingSpinner } from "@/components/ui/button";
import {
  initialHospitalOnboardingSubmitActionState,
  type HospitalOnboardingSubmitActionState,
} from "@/modules/hospital-onboarding/transport/action-state";
import { submitHospitalOnboardingAction } from "@/modules/hospital-onboarding/transport/server-actions";

type HospitalOption = {
  id: string;
  hospitalCode: string;
  name: string;
  parentHospitalCode: string | null;
};

type HospitalOnboardingFormProps = {
  hospitals: readonly HospitalOption[];
};

export function HospitalOnboardingForm({ hospitals }: HospitalOnboardingFormProps) {
  const [state, formAction, pending] = useActionState<
    HospitalOnboardingSubmitActionState,
    FormData
  >(submitHospitalOnboardingAction, initialHospitalOnboardingSubmitActionState);
  const [hospitalQuery, setHospitalQuery] = useState("");
  const [selectedHospitalCode, setSelectedHospitalCode] = useState("");
  const selectedHospital = hospitals.find(
    (hospital) => hospital.hospitalCode === selectedHospitalCode,
  );
  const filteredHospitals = useMemo(() => {
    const normalizedQuery = hospitalQuery.trim().toLocaleLowerCase("th-TH");

    if (!normalizedQuery) {
      return hospitals;
    }

    return hospitals.filter((hospital) =>
      `${hospital.name} ${hospital.hospitalCode}`.toLocaleLowerCase("th-TH").includes(normalizedQuery),
    );
  }, [hospitalQuery, hospitals]);
  const errorMessage = state.status === "ERROR" ? state.message : undefined;
  const fieldErrors = state.status === "ERROR" ? state.fieldErrors ?? {} : {};

  if (state.status === "SUCCESS") {
    return (
      <div className="space-y-6" role="status">
        <div className="rounded-[12px] bg-success-soft px-4 py-4 text-success">
          <p className="font-semibold">ส่งคำขอเรียบร้อยแล้ว</p>
          <p className="mt-2 text-sm leading-6">
            DEMI ได้สร้างบัญชีผู้สมัครและส่งคำขอให้ผู้ดูแลระบบตรวจสอบแล้ว
            คุณจะยังไม่สามารถเข้าสู่พื้นที่ทำงานได้จนกว่าคำขอจะได้รับการอนุมัติ
          </p>
        </div>
        <a
          className="inline-flex h-12 w-full items-center justify-center rounded-[12px] border border-line bg-white px-5 text-base font-semibold text-ink transition-[border-color,color,background-color] hover:border-brand hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:w-auto"
          href="/login"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-7">
      <div className="rounded-[12px] bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-deep">
        ข้อมูลที่ส่งจะใช้เพื่อจับคู่ตัวตนและตรวจสอบคำขอเท่านั้น
        ผู้ดูแลระบบจะเป็นผู้อนุมัติสิทธิ์ของโรงพยาบาลภายหลัง
      </div>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold tracking-[-0.02em]">เลือกโรงพยาบาล</legend>
        {selectedHospital ? (
          <div
            aria-label="โรงพยาบาลที่เลือก"
            className="flex items-start justify-between gap-4 rounded-[12px] border border-brand bg-brand-soft p-4"
            role="status"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-strong">เลือกแล้ว</p>
              <p className="mt-1 font-semibold text-ink">{selectedHospital.name}</p>
              <p className="mt-1 text-sm text-brand-deep">
                รหัส {selectedHospital.hospitalCode}
                {selectedHospital.parentHospitalCode
                  ? ` · หน่วยบริการในเครือ ${selectedHospital.parentHospitalCode}`
                  : ""}
              </p>
            </div>
            <button
              className="min-h-11 shrink-0 rounded-[12px] border border-line bg-white px-3 text-sm font-semibold text-ink transition-[border-color,color,background-color] hover:border-brand hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              disabled={pending}
              onClick={() => {
                setSelectedHospitalCode("");
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
                ค้นหาจากชื่อหรือรหัสโรงพยาบาล
              </label>
              <input
                autoComplete="off"
                className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
                disabled={pending || hospitals.length === 0}
                id="hospitalSearch"
                onChange={(event) => setHospitalQuery(event.target.value)}
                placeholder="เช่น โรงพยาบาลแก่งคอย หรือ KANG"
                type="search"
                value={hospitalQuery}
              />
            </div>

            <div
              aria-label="รายการโรงพยาบาลที่เลือกได้"
              aria-describedby={fieldErrors.hospitalCode ? "hospitalCode-error" : undefined}
              aria-invalid={fieldErrors.hospitalCode ? true : undefined}
              className="max-h-64 space-y-2 overflow-y-auto rounded-[12px] border border-line bg-canvas p-2"
              role="listbox"
            >
              {hospitals.length === 0 ? (
                <p className="px-3 py-4 text-sm leading-6 text-muted">
                  ยังไม่มีโรงพยาบาลที่เปิดรับคำขอในขณะนี้
                </p>
              ) : filteredHospitals.length === 0 ? (
                <p className="px-3 py-4 text-sm leading-6 text-muted">ไม่พบโรงพยาบาลที่ค้นหา</p>
              ) : (
                filteredHospitals.map((hospital) => (
                  <button
                    aria-selected={false}
                    className="w-full rounded-[10px] border border-transparent bg-white/70 px-3 py-3 text-left transition-[border-color,background-color] hover:border-line hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                    disabled={pending}
                    key={hospital.id}
                    onClick={() => {
                      setSelectedHospitalCode(hospital.hospitalCode);
                      setHospitalQuery("");
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="block font-semibold text-ink">{hospital.name}</span>
                    <span className="mt-1 block text-sm text-muted">
                      รหัส {hospital.hospitalCode}
                      {hospital.parentHospitalCode
                        ? ` · หน่วยบริการในเครือ ${hospital.parentHospitalCode}`
                        : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        <input name="hospitalCode" type="hidden" value={selectedHospitalCode} />
        <p className="min-h-6 text-sm leading-6 text-muted" aria-live="polite">
          {selectedHospital ? `เลือกแล้ว: ${selectedHospital.name}` : "กรุณาเลือกโรงพยาบาลจากรายการ"}
        </p>
        {fieldErrors.hospitalCode ? (
          <p className="text-sm leading-6 text-danger" id="hospitalCode-error" role="alert">
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
              <p className="text-sm leading-6 text-danger" id="givenName-error" role="alert">
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
              <p className="text-sm leading-6 text-danger" id="familyName-error" role="alert">
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
            <p className="text-sm leading-6 text-danger" id="nationalId-error" role="alert">
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
            <p className="text-sm leading-6 text-danger" id="password-error" role="alert">
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
              role="alert"
            >
              {fieldErrors.passwordConfirmation}
            </p>
          ) : null}
        </div>
      </fieldset>

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
        disabled={pending || hospitals.length === 0 || !selectedHospitalCode}
        type="submit"
      >
        {pending ? <LoadingSpinner className="mr-2" /> : null}
        {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอลงทะเบียน"}
      </button>
    </form>
  );
}
