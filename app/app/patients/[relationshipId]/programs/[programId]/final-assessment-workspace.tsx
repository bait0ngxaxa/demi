"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientFinalAssessmentProjection } from "@/modules/patient-final-assessment/services/patient-final-assessment-query-service";
import {
  createPatientFinalAssessmentAction,
} from "@/modules/patient-final-assessment/transport/server-actions";
import {
  initialPatientFinalAssessmentActionState,
  type PatientFinalAssessmentActionState,
} from "@/modules/patient-final-assessment/transport/action-state";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

type MeasurementKey = keyof NonNullable<PatientFinalAssessmentProjection["finalAssessment"]>["measurements"];

type MeasurementDefinition = {
  key: MeasurementKey;
  label: string;
  currentLabel: string;
};

const measurementDefinitions: readonly MeasurementDefinition[] = [
  { key: "weight", label: "น้ำหนัก", currentLabel: "kg" },
  { key: "waistCircumference", label: "รอบเอว", currentLabel: "cm" },
  { key: "systolicBloodPressure", label: "ความดันตัวบน", currentLabel: "mmHg" },
  { key: "diastolicBloodPressure", label: "ความดันตัวล่าง", currentLabel: "mmHg" },
  { key: "bloodSugar", label: "น้ำตาลในเลือด / DTX", currentLabel: "DTX / mg%" },
  { key: "hba1c", label: "HbA1c", currentLabel: "%" },
];

const structuralMaximum = 1_000_000;

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatServiceDate(value: Date | null): string {
  return value === null
    ? "ไม่ได้บันทึก (รายการก่อนมีช่องนี้)"
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(value);
}

function statusLabel(status: PatientFinalAssessmentProjection["programStatus"]): string {
  return status === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว";
}

function statusVariant(status: PatientFinalAssessmentProjection["programStatus"]): StatusVariant {
  return status === "ACTIVE" ? "success" : "neutral";
}

function measurementValueLabel(value: number | null): string {
  return value === null ? "ไม่ได้บันทึก" : String(value);
}

function ActionFeedback({
  state,
}: {
  state: PatientFinalAssessmentActionState;
}): React.JSX.Element | null {
  if (state.status === "IDLE") {
    return null;
  }

  if (state.status === "ERROR") {
    return (
      <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
        {state.message}
      </Alert>
    );
  }

  return (
    <Alert className="mt-5" variant="success">
      บันทึก Final Assessment แล้ว กำลังโหลดข้อมูลล่าสุด
    </Alert>
  );
}

function FinalAssessmentForm({
  patientHospitalRelationshipId,
  patientProgramId,
  todayServiceDate,
}: {
  patientHospitalRelationshipId: string;
  patientProgramId: string;
  todayServiceDate: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome] = useMutationActionState<
    PatientFinalAssessmentActionState,
    FormData
  >(createPatientFinalAssessmentAction, initialPatientFinalAssessmentActionState);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "SUCCESS") {
      formRef.current?.reset();
    }
  }, [state]);

  useEffect(() => {
    if (
      state.status === "SUCCESS" ||
      (state.status === "ERROR" && state.code === "CONFLICT")
    ) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <Panel className="mt-5">
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
          บันทึกค่าดิบของ Final Assessment
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
          กรอกเฉพาะค่าที่มีอยู่สำหรับโปรแกรมนี้ อย่างน้อย 1 รายการ ข้อมูลนี้จะถูกบันทึกเป็นข้อมูลอ่านอย่างเดียว
        </p>
      </div>

      <Alert className="mt-5" variant="info">
        ค่าที่แสดงเป็นค่าดิบที่บันทึกไว้สำหรับโปรแกรมนี้ ระบบยังไม่แปลผลทางคลินิกหรือคำนวณผลลัพธ์อัตโนมัติ
        หน่วยที่แสดงเป็นป้ายกำกับปัจจุบันของต้นแบบเท่านั้น
      </Alert>

      <form action={action} className="mt-6" onSubmit={submitPreservingInput(action)} ref={formRef}>
        <input
          name="patientHospitalRelationshipId"
          type="hidden"
          value={patientHospitalRelationshipId}
        />
        <input name="patientProgramId" type="hidden" value={patientProgramId} />

        <fieldset disabled={pending || unknownOutcome}>
          <label className="block max-w-sm space-y-2 text-sm font-semibold text-text" htmlFor="final-assessment-service-date">
            <span>วันที่ประเมิน</span>
            <input
              aria-describedby="final-assessment-service-date-help"
              className={inputClassName}
              defaultValue={todayServiceDate}
              id="final-assessment-service-date"
              max={todayServiceDate}
              name="serviceDate"
              required
              type="date"
            />
            <span className="block text-xs font-normal leading-5 text-text-subtle" id="final-assessment-service-date-help">
              วันที่ประเมินจริง เลือกย้อนหลังได้แต่เลือกวันในอนาคตไม่ได้
            </span>
          </label>
        </fieldset>

        <fieldset className="mt-6" disabled={pending || unknownOutcome}>
          <legend className="text-sm font-semibold text-text">ค่าที่ต้องการบันทึก</legend>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {measurementDefinitions.map((measurement) => {
              const inputId = `final-assessment-${measurement.key}`;

              return (
                <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={inputId} key={measurement.key}>
                  <span>{measurement.label}</span>
                  <span className="block text-xs font-normal leading-5 text-text-muted">
                    ค่าดิบ · ป้ายกำกับปัจจุบัน: {measurement.currentLabel}
                  </span>
                  <input
                    aria-describedby={`${inputId}-help`}
                    className={inputClassName}
                    id={inputId}
                    inputMode="decimal"
                    max={structuralMaximum}
                    min="0"
                    name={measurement.key}
                    step="any"
                    type="number"
                  />
                  <span className="block text-xs font-normal leading-5 text-text-subtle" id={`${inputId}-help`}>
                    เว้นว่างได้ หากไม่มีค่ารายการนี้
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {pending ? <Alert className="mt-5" variant="info">กำลังบันทึก Final Assessment…</Alert> : null}
        <ActionFeedback state={state} />

        <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" />
        <div className="mt-6">
          <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึก Final Assessment"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function FinalAssessmentReadOnlyView({
  assessment,
  programStatus,
}: {
  assessment: NonNullable<PatientFinalAssessmentProjection["finalAssessment"]>;
  programStatus: PatientFinalAssessmentProjection["programStatus"];
}): React.JSX.Element {
  return (
    <Panel className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
            ข้อมูล Final Assessment ที่บันทึกไว้
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            รายการนี้เป็นข้อมูลอ่านอย่างเดียวและผูกกับโปรแกรมนี้โดยตรง
          </p>
        </div>
        <StatusBadge variant={programStatus === "COMPLETED" ? "neutral" : "info"}>
          {programStatus === "COMPLETED" ? "ประวัติอ่านอย่างเดียว" : "บันทึกแล้ว · อ่านอย่างเดียว"}
        </StatusBadge>
      </div>

      <Alert className="mt-5" variant="info">
        ค่าที่แสดงเป็นค่าดิบที่บันทึกไว้สำหรับโปรแกรมนี้ ระบบยังไม่แปลผลทางคลินิกหรือคำนวณผลลัพธ์อัตโนมัติ
        หน่วยที่แสดงเป็นป้ายกำกับปัจจุบันของต้นแบบเท่านั้น
      </Alert>

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        {measurementDefinitions.map((measurement) => (
          <div key={measurement.key}>
            <dt className="text-sm text-text-muted">
              {measurement.label} · {measurement.currentLabel}
            </dt>
            <dd className="mt-1 font-semibold text-text">
              {measurementValueLabel(assessment.measurements[measurement.key])}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-text-muted">วันที่ประเมิน</dt>
          <dd className="mt-1 font-semibold text-text">{formatServiceDate(assessment.serviceDate)}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">ผู้บันทึก</dt>
          <dd className="mt-1 font-semibold text-text">{assessment.recordedBy.displayName}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">บันทึกในระบบเมื่อ</dt>
          <dd className="mt-1 font-semibold text-text">{formatDateTime(assessment.recordedAt)}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">สถานะโปรแกรม</dt>
          <dd className="mt-1 font-semibold text-text">{statusLabel(programStatus)}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">สิทธิ์การแก้ไข</dt>
          <dd className="mt-1 font-semibold text-text">อ่านอย่างเดียว</dd>
        </div>
      </dl>
    </Panel>
  );
}

function FinalAssessmentAbsenceView({
  canManage,
  programStatus,
}: {
  canManage: boolean;
  programStatus: PatientFinalAssessmentProjection["programStatus"];
}): React.JSX.Element {
  return (
    <Panel className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">
            ยังไม่มีการบันทึกข้อมูล Final Assessment สำหรับโปรแกรมนี้
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            รายการนี้แสดงเฉพาะข้อมูลที่มีการบันทึกไว้ และไม่มีการสรุปผลจากการไม่มีข้อมูล
          </p>
        </div>
        <StatusBadge variant={programStatus === "COMPLETED" ? "neutral" : "info"}>
          {programStatus === "COMPLETED" ? "ประวัติอ่านอย่างเดียว" : "ยังไม่มีข้อมูล"}
        </StatusBadge>
      </div>

      {programStatus === "COMPLETED" ? (
        <Alert className="mt-5" variant="neutral">
          โปรแกรมนี้เสร็จสิ้นแล้ว จึงไม่สามารถสร้าง Final Assessment เพิ่มได้
        </Alert>
      ) : canManage ? (
        <p className="mt-5 text-sm leading-6 text-text-muted">
          โปรแกรมยังอยู่ระหว่างดำเนินการ สามารถบันทึกข้อมูลได้ด้านล่าง
        </p>
      ) : (
        <Alert className="mt-5" variant="info">
          บัญชีนี้มีสิทธิ์อ่านข้อมูลในโปรแกรมนี้ แต่ไม่มีสิทธิ์บันทึก Final Assessment ใหม่
        </Alert>
      )}
    </Panel>
  );
}

export function PatientProgramFinalAssessmentWorkspace({
  detail,
  finalAssessment,
  todayServiceDate,
}: {
  detail: PatientProgramDetail;
  finalAssessment: PatientFinalAssessmentProjection;
  todayServiceDate: string;
}): React.JSX.Element {
  const programStatus = finalAssessment.programStatus;
  const assessment = finalAssessment.finalAssessment;
  const canManage = programStatus === "ACTIVE" && detail.canManage;

  return (
    <section aria-labelledby="patient-program-final-assessment-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            className="text-xl font-semibold tracking-[-0.02em] text-text"
            id="patient-program-final-assessment-heading"
          >
            Final Assessment
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            พื้นที่สำหรับบันทึกหรืออ่านค่าดิบของโปรแกรมนี้โดยตรง โดยไม่แปลผลหรือเปรียบเทียบกับข้อมูลจากช่วงอื่น
          </p>
        </div>
        <StatusBadge variant={statusVariant(programStatus)}>
          สถานะโปรแกรม: {statusLabel(programStatus)}
        </StatusBadge>
      </div>

      {assessment ? (
        <FinalAssessmentReadOnlyView
          assessment={assessment}
          programStatus={programStatus}
        />
      ) : (
        <FinalAssessmentAbsenceView canManage={canManage} programStatus={programStatus} />
      )}

      {!assessment && canManage ? (
        <FinalAssessmentForm
          patientHospitalRelationshipId={finalAssessment.patientHospitalRelationshipId}
          patientProgramId={finalAssessment.patientProgramId}
          todayServiceDate={todayServiceDate}
        />
      ) : null}
    </section>
  );
}

export const patientFinalAssessmentWorkspaceInternals = {
  formatDateTime,
  formatServiceDate,
  measurementValueLabel,
  statusLabel,
};
