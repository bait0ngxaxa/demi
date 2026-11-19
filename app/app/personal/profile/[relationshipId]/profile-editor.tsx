"use client";

import Link from "next/link";
import { useRef } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useFormDirty } from "@/components/ui/use-form-dirty";
import type { PatientHospitalProfileDetail } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import {
  initialPatientHospitalProfileUpdateActionState,
  type PatientHospitalProfileUpdateActionState,
} from "@/modules/patient-hospital-profile/transport/action-state";
import { updateOwnPatientHospitalProfileAction } from "@/modules/patient-hospital-profile/transport/server-actions";

type EditableField = {
  name:
    | "gender"
    | "phoneNumber"
    | "addressText"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "occupation"
    | "educationLevel";
  label: string;
  value: string | null;
  maxLength: number;
  multiline?: boolean;
  inputMode?: "tel";
};

function displayValue(value: string | null): string {
  return value?.trim() || "ยังไม่ได้บันทึก";
}

function ProfileEditorForm({
  profile,
}: {
  profile: PatientHospitalProfileDetail;
}): React.JSX.Element {
  const action = updateOwnPatientHospitalProfileAction.bind(null, profile.relationshipId);
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<
    PatientHospitalProfileUpdateActionState,
    FormData
  >(action, initialPatientHospitalProfileUpdateActionState);
  // The saved values stay in the fields, so only an unsaved edit can be submitted (SAVE-STATE). Values shown
  // from the legacy profile are not saved for this hospital yet, so saving them unchanged is still a change.
  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useFormDirty(formRef, { savedKey: state.status === "SUCCESS" ? state : undefined });
  const canSave = dirty || profile.source === "LEGACY_FALLBACK";

  const fields: readonly EditableField[] = [
    { name: "gender", label: "เพศ", value: profile.profile.gender, maxLength: 64 },
    {
      name: "phoneNumber",
      label: "เบอร์โทรศัพท์ติดต่อปัจจุบัน",
      value: profile.profile.phoneNumber,
      maxLength: 32,
      inputMode: "tel",
    },
    {
      name: "addressText",
      label: "ที่อยู่ติดต่อปัจจุบัน",
      value: profile.profile.addressText,
      maxLength: 2000,
      multiline: true,
    },
    {
      name: "emergencyContactName",
      label: "ชื่อผู้ติดต่อกรณีฉุกเฉิน",
      value: profile.profile.emergencyContactName,
      maxLength: 200,
    },
    {
      name: "emergencyContactPhone",
      label: "เบอร์โทรศัพท์ผู้ติดต่อกรณีฉุกเฉิน",
      value: profile.profile.emergencyContactPhone,
      maxLength: 32,
      inputMode: "tel",
    },
    { name: "occupation", label: "อาชีพ", value: profile.profile.occupation, maxLength: 200 },
    {
      name: "educationLevel",
      label: "ระดับการศึกษา",
      value: profile.profile.educationLevel,
      maxLength: 200,
    },
  ];

  return (
    <form action={formAction} className="mt-7" onSubmit={submitPreservingInput(formAction)} ref={formRef}>
      <input name="expectedVersion" type="hidden" value={profile.version} />
      <div className="grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
        {fields.map((field) => (
          <div
            className={field.multiline ? "min-w-0 sm:col-span-2" : "min-w-0"}
            key={field.name}
          >
            <label className="block text-sm font-semibold text-text" htmlFor={field.name}>
              {field.label}
            </label>
            {field.multiline ? (
              <textarea
                autoComplete="street-address"
                className="mt-2 block min-h-28 w-full max-w-full resize-y rounded-control border border-border-strong bg-surface px-3 py-2 text-base leading-6 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                defaultValue={field.value ?? ""}
                id={field.name}
                maxLength={field.maxLength}
                name={field.name}
                rows={3}
              />
            ) : (
              <input
                autoComplete={field.name === "phoneNumber" ? "tel" : "off"}
                className="mt-2 block min-h-11 w-full max-w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                defaultValue={field.value ?? ""}
                id={field.name}
                inputMode={field.inputMode}
                maxLength={field.maxLength}
                name={field.name}
                type="text"
              />
            )}
            <p className="mt-1 break-words text-xs leading-5 text-text-muted">
              ค่าปัจจุบัน: {displayValue(field.value)}
            </p>
          </div>
        ))}
      </div>

      <dl className="mt-5">
        <dt className="text-sm font-semibold text-text-muted">ความสัมพันธ์ผู้ติดต่อฉุกเฉินกับผู้ป่วย</dt>
        <dd className="mt-1 break-words text-base text-text">{displayValue(profile.emergencyContactRelationship)}</dd>
      </dl>

      {state.message && !(state.status === "SUCCESS" && dirty) ? (
        <p
          aria-live="polite"
          className={`mt-5 break-words rounded-control border px-4 py-3 text-sm leading-6 ${
            state.status === "SUCCESS"
              ? "border-success/20 bg-success-soft text-success"
              : "border-danger/20 bg-danger-soft text-danger"
          }`}
          role={state.status === "ERROR" ? "alert" : "status"}
        >
          {state.message}
          {state.code === "CONFLICT" ? (
            <button
              className="ml-1 font-semibold underline underline-offset-4"
              onClick={() => window.location.reload()}
              type="button"
            >
              โหลดหน้าใหม่
            </button>
          ) : null}
        </p>
      ) : null}

      <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "reload" }} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="w-full sm:w-auto" disabled={!canSave || unknownOutcome} loading={pending} type="submit">
          {pending ? "กำลังบันทึก…" : "บันทึกข้อมูลสำหรับโรงพยาบาลนี้"}
        </Button>
        <Link
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:w-auto"
          href="/app/personal/profile"
        >
          กลับไปเลือกโรงพยาบาล
        </Link>
      </div>
    </form>
  );
}

export function PatientHospitalProfileEditor({
  profile,
}: {
  profile: PatientHospitalProfileDetail;
}): React.JSX.Element {
  return (
    <div className="max-w-3xl">
      <PageHeader
        breadcrumbs={[
          { href: "/app/personal/profile", label: "ข้อมูลของฉัน" },
          { label: "ข้อมูลสำหรับโรงพยาบาล" },
        ]}
        title={`ข้อมูลสำหรับ${profile.hospitalName}`}
        description={`${profile.person.givenName ?? ""} ${profile.person.familyName ?? ""}`.trim()}
      />

      <Panel className="mt-6">
        {profile.source === "LEGACY_FALLBACK" ? (
          <p className="mb-6 break-words text-sm leading-6 text-text-muted">
            ข้อมูลนี้มาจากโปรไฟล์เดิม กดบันทึกเพื่อใช้กับโรงพยาบาลนี้
          </p>
        ) : null}

        <section aria-labelledby="hospital-local-profile-identity">
          <h2 className="text-lg font-semibold text-text" id="hospital-local-profile-identity">
            ข้อมูลระบุตัวตนที่แก้ไขไม่ได้
          </h2>
          <dl className="mt-3 grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm text-text-muted">ชื่อ</dt>
              <dd className="mt-1 break-words font-medium text-text">
                {displayValue(profile.person.givenName)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-text-muted">นามสกุล</dt>
              <dd className="mt-1 break-words font-medium text-text">
                {displayValue(profile.person.familyName)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="hospital-local-profile-edit" className="mt-6 border-t border-border pt-5">
          <h2 className="text-lg font-semibold text-text" id="hospital-local-profile-edit">
            ข้อมูลทั่วไปและข้อมูลติดต่อ
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-text-muted">
            เว้นว่างเพื่อล้างค่า
          </p>
          <ProfileEditorForm profile={profile} />
        </section>
      </Panel>

      <div className="mt-5">
        <Link className="text-sm font-semibold text-brand-strong underline underline-offset-4" href="/app/personal/password">
          เปลี่ยนรหัสผ่านของบัญชี DEMI
        </Link>
      </div>
    </div>
  );
}
