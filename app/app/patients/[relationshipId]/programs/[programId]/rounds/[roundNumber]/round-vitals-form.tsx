"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { calculateBodyMassIndex } from "@/modules/patient-program-rounds/domain/body-mass-index";
import type { VitalsMeasurement } from "@/modules/patient-program-rounds/domain/round-steps";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import { recordPatientProgramRoundVitalsAction } from "@/modules/patient-program-rounds/transport/server-actions";

const STRUCTURAL_MAXIMUM = 1_000_000;

type FieldDefinition = {
  name: VitalsMeasurement;
  label: string;
  unit: string;
};

const fieldDefinitions: readonly FieldDefinition[] = [
  { name: "weight", label: "น้ำหนัก", unit: "kg" },
  { name: "heightCm", label: "ส่วนสูง", unit: "cm" },
  { name: "waistCircumference", label: "รอบเอว", unit: "cm" },
  { name: "bloodSugar", label: "น้ำตาลในเลือด / DTX", unit: "mg/dL" },
  { name: "systolicBloodPressure", label: "ความดันตัวบน", unit: "mmHg" },
  { name: "diastolicBloodPressure", label: "ความดันตัวล่าง", unit: "mmHg" },
];

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** SR-D12: round 1 also captures the preferred name and an empty occupation of the hospital profile. */
export type RoundVitalsProfileFields = {
  preferredName: string | null;
  occupation: string | null;
  profileVersion: number | null;
};

/** Adds the missing values to the round's existing record; recorded values stay as they are. */
export type RoundVitalsSupplement = {
  serviceDate: string;
  missing: readonly VitalsMeasurement[];
};

export function RoundVitalsForm({
  patientMode = false,
  initialValues,
  defaultServiceDate,
  heightEditable,
  latestHeightCm,
  nextHref,
  occupation,
  patientDisplayName,
  patientHospitalRelationshipId,
  patientProgramId,
  profile,
  roundNumber,
  submissionNonce,
  supplement = null,
  todayServiceDate,
}: {
  patientMode?: boolean;
  initialValues?: Partial<Record<VitalsMeasurement, number | null>>;
  defaultServiceDate?: string;
  heightEditable: boolean;
  latestHeightCm: number | null;
  /** SR-D7: the next step after a successful save. */
  nextHref: string;
  occupation: string | null;
  patientDisplayName: string;
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  /** Round 1 only. */
  profile: RoundVitalsProfileFields | null;
  roundNumber: number;
  submissionNonce: string;
  supplement?: RoundVitalsSupplement | null;
  todayServiceDate: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    recordPatientProgramRoundVitalsAction,
    initialPatientProgramRoundActionState,
  );
  const [weight, setWeight] = useState(initialValues?.weight == null ? "" : String(initialValues.weight));
  const [height, setHeight] = useState(initialValues?.heightCm != null ? String(initialValues.heightCm) : latestHeightCm === null ? "" : String(latestHeightCm));
  const bmi = calculateBodyMassIndex(parseOptionalNumber(weight), parseOptionalNumber(height));

  const formRef = useRef<HTMLFormElement>(null);
  const fields = supplement
    ? fieldDefinitions.filter((field) => supplement.missing.includes(field.name))
    : fieldDefinitions;

  useEffect(() => {
    if (state.status === "SUCCESS") {
      formRef.current?.reset();
      router.push(nextHref);
      return;
    }

    if (state.status === "ERROR" && state.code === "CONFLICT") {
      router.refresh();
    }
  }, [nextHref, router, state]);

  return (
    <form action={action} onSubmit={submitPreservingInput(action)} ref={formRef}>
      <input name="patientHospitalRelationshipId" type="hidden" value={patientHospitalRelationshipId} />
      <input name="patientProgramId" type="hidden" value={patientProgramId} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="submissionNonce" type="hidden" value={submissionNonce} />
      {profile ? <input name="profileVersion" type="hidden" value={profile.profileVersion ?? ""} /> : null}

      <fieldset disabled={pending || unknownOutcome}>
        {patientMode ? <p className="mb-4 text-sm text-text-muted">บันทึกสัญญาณชีพที่คุณวัดเอง กรอกเฉพาะค่าที่วัดได้</p> : null}
        {!patientMode ? <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-text-muted">ชื่อ-สกุล</dt>
            <dd className="mt-1 font-semibold text-text">{patientDisplayName}</dd>
          </div>
          {profile && !occupation ? null : (
            <div>
              <dt className="text-sm font-semibold text-text-muted">อาชีพ</dt>
              <dd className="mt-1 font-semibold text-text">{occupation ?? "ไม่ได้บันทึก"}</dd>
            </div>
          )}
        </dl> : null}

        {profile && !supplement && !patientMode ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {occupation ? null : (
              <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="round-1-occupation">
                <span>อาชีพ (ยังไม่ได้บันทึก)</span>
                <input className={inputClassName} id="round-1-occupation" maxLength={200} name="occupation" type="text" />
              </label>
            )}
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="round-1-preferred-name">
              <span>รู้จักตัวฉันเอง · ชื่อที่อยากให้เรียก</span>
              <input
                className={inputClassName}
                defaultValue={profile.preferredName ?? ""}
                id="round-1-preferred-name"
                maxLength={100}
                name="preferredName"
                type="text"
              />
            </label>
          </div>
        ) : null}

        {supplement ? (
          <input name="serviceDate" type="hidden" value={supplement.serviceDate} />
        ) : (
          <label className="mt-5 block max-w-sm space-y-2 text-sm font-semibold text-text" htmlFor={`round-${roundNumber}-service-date`}>
            <span>{patientMode ? "วันที่วัด" : "วันที่ให้บริการ"}</span>
            <input
              className={inputClassName}
              defaultValue={defaultServiceDate ?? todayServiceDate}
              id={`round-${roundNumber}-service-date`}
              max={todayServiceDate}
              name="serviceDate"
              required
              type="date"
            />
          </label>
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {fields.map((field) => {
            const inputId = `round-${roundNumber}-${field.name}`;
            const isHeight = field.name === "heightCm";
            const controlled =
              field.name === "weight"
                ? { onChange: (event: React.ChangeEvent<HTMLInputElement>) => setWeight(event.target.value), value: weight }
                : isHeight
                  ? { onChange: (event: React.ChangeEvent<HTMLInputElement>) => setHeight(event.target.value), value: height }
                  : { defaultValue: initialValues?.[field.name] ?? "" };

            return (
              <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={inputId} key={field.name}>
                <span>
                  {field.label} ({field.unit})
                </span>
                <input
                  className={inputClassName}
                  id={inputId}
                  inputMode="decimal"
                  max={STRUCTURAL_MAXIMUM}
                  min="0"
                  name={field.name}
                  readOnly={isHeight && !heightEditable}
                  step="any"
                  type="number"
                  {...controlled}
                />
                {isHeight ? (
                  <span className="block text-xs font-normal leading-5 text-text-subtle">
                    {heightEditable
                      ? "แสดงค่าล่าสุดที่บันทึกไว้ แก้ไขได้ในครั้งที่ 1–2"
                      : "แสดงค่าล่าสุดเท่านั้น แก้ไขได้ในครั้งที่ 1–2"}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>

        {supplement ? null : (
          <p aria-live="polite" className="mt-5 text-sm text-text-muted">
            BMI (kg/m²):{" "}
            <span className="font-semibold text-text">
              {bmi === null ? "คำนวณได้เมื่อมีน้ำหนักและส่วนสูง" : bmi}
            </span>{" "}
            · แสดงค่าเท่านั้น ไม่แปลผล
          </p>
        )}
      </fieldset>

      {state.status === "ERROR" ? (
        <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
          {state.message}
        </Alert>
      ) : null}
      {state.status === "SUCCESS" ? (
        <Alert className="mt-5" variant="success">
          บันทึกสัญญาณชีพแล้ว กำลังไปขั้นตอนถัดไป
        </Alert>
      ) : null}

      <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      <div className="mt-6">
        <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
          {pending ? "กำลังบันทึก…" : supplement ? "บันทึกค่าที่ยังขาด" : "บันทึกสัญญาณชีพ"}
        </Button>
      </div>
    </form>
  );
}
