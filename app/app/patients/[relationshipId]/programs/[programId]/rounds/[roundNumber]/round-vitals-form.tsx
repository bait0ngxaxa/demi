"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { calculateBodyMassIndex } from "@/modules/patient-program-rounds/domain/body-mass-index";
import {
  initialPatientProgramRoundActionState,
  type PatientProgramRoundActionState,
} from "@/modules/patient-program-rounds/transport/action-state";
import { recordPatientProgramRoundVitalsAction } from "@/modules/patient-program-rounds/transport/server-actions";

const STRUCTURAL_MAXIMUM = 1_000_000;

type FieldDefinition = {
  name: "weight" | "heightCm" | "waistCircumference" | "bloodSugar" | "systolicBloodPressure" | "diastolicBloodPressure";
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

export function RoundVitalsForm({
  heightEditable,
  latestHeightCm,
  occupation,
  patientDisplayName,
  patientHospitalRelationshipId,
  patientProgramId,
  roundNumber,
  submissionNonce,
  todayServiceDate,
}: {
  heightEditable: boolean;
  latestHeightCm: number | null;
  occupation: string | null;
  patientDisplayName: string;
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  roundNumber: number;
  submissionNonce: string;
  todayServiceDate: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramRoundActionState, FormData>(
    recordPatientProgramRoundVitalsAction,
    initialPatientProgramRoundActionState,
  );
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(latestHeightCm === null ? "" : String(latestHeightCm));
  const bmi = calculateBodyMassIndex(parseOptionalNumber(weight), parseOptionalNumber(height));

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "SUCCESS") {
      formRef.current?.reset();
    }
  }, [state]);

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={action} onSubmit={submitPreservingInput(action)} ref={formRef}>
      <input name="patientHospitalRelationshipId" type="hidden" value={patientHospitalRelationshipId} />
      <input name="patientProgramId" type="hidden" value={patientProgramId} />
      <input name="roundNumber" type="hidden" value={roundNumber} />
      <input name="submissionNonce" type="hidden" value={submissionNonce} />

      <fieldset disabled={pending || unknownOutcome}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-text-muted">ชื่อ-สกุล</dt>
            <dd className="mt-1 font-semibold text-text">{patientDisplayName}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text-muted">อาชีพ</dt>
            <dd className="mt-1 font-semibold text-text">{occupation ?? "ไม่ได้บันทึก"}</dd>
          </div>
        </dl>

        <label className="mt-5 block max-w-sm space-y-2 text-sm font-semibold text-text" htmlFor={`round-${roundNumber}-service-date`}>
          <span>วันที่ให้บริการ</span>
          <input
            className={inputClassName}
            defaultValue={todayServiceDate}
            id={`round-${roundNumber}-service-date`}
            max={todayServiceDate}
            name="serviceDate"
            required
            type="date"
          />
        </label>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {fieldDefinitions.map((field) => {
            const inputId = `round-${roundNumber}-${field.name}`;
            const isHeight = field.name === "heightCm";
            const controlled =
              field.name === "weight"
                ? { onChange: (event: React.ChangeEvent<HTMLInputElement>) => setWeight(event.target.value), value: weight }
                : isHeight
                  ? { onChange: (event: React.ChangeEvent<HTMLInputElement>) => setHeight(event.target.value), value: height }
                  : {};

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

        <p aria-live="polite" className="mt-5 text-sm text-text-muted">
          BMI (kg/m²):{" "}
          <span className="font-semibold text-text">
            {bmi === null ? "คำนวณได้เมื่อมีน้ำหนักและส่วนสูง" : bmi}
          </span>{" "}
          · แสดงค่าเท่านั้น ไม่แปลผล
        </p>
      </fieldset>

      {state.status === "ERROR" ? (
        <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
          {state.message}
        </Alert>
      ) : null}
      {state.status === "SUCCESS" ? (
        <Alert className="mt-5" variant="success">
          บันทึกสัญญาณชีพแล้ว กำลังโหลดข้อมูลล่าสุด
        </Alert>
      ) : null}

      <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      <div className="mt-6">
        <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
          {pending ? "กำลังบันทึก…" : "บันทึกสัญญาณชีพ"}
        </Button>
      </div>
    </form>
  );
}
