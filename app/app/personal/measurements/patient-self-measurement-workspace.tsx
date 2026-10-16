"use client";

import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Input, inputClassName } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PATIENT_SELF_MEASUREMENT_LABEL } from "@/modules/patient-self-measurements/domain/patient-self-measurement";
import type { OwnPatientSelfMeasurement } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import {
  createOwnPatientSelfMeasurementAction,
  deleteOwnPatientSelfMeasurementAction,
  type PatientSelfMeasurementActionState,
} from "@/modules/patient-self-measurements/transport/server-actions";

import { PatientSelfMeasurementValues } from "./patient-self-measurement-values";

const idle: PatientSelfMeasurementActionState = { status: "IDLE" };

const NUMBER_FIELDS = [
  { name: "weight", label: "น้ำหนัก (กก.)", step: "0.1" },
  { name: "bloodSugar", label: "ระดับน้ำตาลในเลือด (mg/dL)", step: "1" },
  { name: "systolicBloodPressure", label: "ความดันตัวบน (mmHg)", step: "1" },
  { name: "diastolicBloodPressure", label: "ความดันตัวล่าง (mmHg)", step: "1" },
] as const;

function CreateForm({ nonce, defaultMeasuredAt }: { nonce: string; defaultMeasuredAt: string }): React.JSX.Element {
  const prefix = useId();
  const [state, action, pending, unknownOutcome] = useMutationActionState(createOwnPatientSelfMeasurementAction, idle);
  return (
    <form action={action} className="space-y-4" onSubmit={submitPreservingInput(action)}>
      <input name="submissionNonce" type="hidden" value={nonce} />
      <fieldset className="space-y-4" disabled={pending || unknownOutcome}>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={`${prefix}-time`}>วันและเวลาที่วัด</label>
          <Input defaultValue={defaultMeasuredAt} id={`${prefix}-time`} name="measuredAt" required type="datetime-local" />
          <p className="text-sm text-text-muted">เวลาประเทศไทย ไม่เป็นเวลาในอนาคต</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.map((field) => (
            <div className="space-y-2" key={field.name}>
              <label className="block text-sm font-medium" htmlFor={`${prefix}-${field.name}`}>{field.label}</label>
              <Input id={`${prefix}-${field.name}`} inputMode="decimal" max={1000000} min={0} name={field.name} step={field.step} type="number" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor={`${prefix}-note`}>บันทึกเพิ่มเติม (ไม่บังคับ)</label>
          <textarea className={`${inputClassName} py-3`} id={`${prefix}-note`} maxLength={1000} name="note" rows={3} />
        </div>
      </fieldset>
      <p className="text-sm text-text-muted">กรอกอย่างน้อยหนึ่งค่า ข้อมูลนี้ไม่แทนการวัดโดย อสม. หรือเจ้าหน้าที่</p>
      {state.status === "ERROR" ? <Alert role="alert" variant="danger">{state.message}</Alert> : null}
      {state.status === "SUCCESS" ? <Alert variant="success">{state.message}</Alert> : null}
      <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
      <Button disabled={unknownOutcome} loading={pending} type="submit">{pending ? "กำลังบันทึก..." : "บันทึก"}</Button>
    </form>
  );
}

function DeleteForm({ measurementId }: { measurementId: string }): React.JSX.Element {
  const [state, action, pending] = useMutationActionState(deleteOwnPatientSelfMeasurementAction, idle);
  return (
    <ConfirmableActionForm
      action={action}
      confirmation={{
        title: "ลบรายการที่บันทึกเองนี้หรือไม่",
        description: "ลบได้ภายใน 24 ชั่วโมงหลังบันทึก รายการที่ลบจะไม่แสดงต่อ อสม. และเจ้าหน้าที่",
        confirmLabel: "ลบรายการ",
      }}
      outcome={state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle"}
      pending={pending}
      resultKey={state}
    >
      <input name="measurementId" type="hidden" value={measurementId} />
      <Button loading={pending} size="compact" type="submit" variant="danger">{pending ? "กำลังลบ..." : "ลบ"}</Button>
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
    </ConfirmableActionForm>
  );
}

export function PatientSelfMeasurementWorkspace({ items, nonce, defaultMeasuredAt }: {
  items: readonly OwnPatientSelfMeasurement[];
  nonce: string;
  defaultMeasuredAt: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ตัวฉันในตอนนี้" }]}
        description="บันทึกน้ำหนัก น้ำตาลในเลือด และความดันที่คุณวัดเอง อสม. และเจ้าหน้าที่ที่ดูแลคุณเห็นรายการนี้พร้อมป้ายผู้ป่วยบันทึกเอง"
        title="ตัวฉันในตอนนี้"
      />
      <Panel>
        <h2 className="mb-4 text-lg font-semibold">บันทึกค่าใหม่</h2>
        <CreateForm defaultMeasuredAt={defaultMeasuredAt} key={nonce} nonce={nonce} />
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold">รายการที่บันทึกไว้</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">ยังไม่มีรายการที่บันทึกเอง</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {items.map((item) => (
              <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between" key={item.measurementId}>
                <div className="min-w-0">
                  <StatusBadge variant="info">{PATIENT_SELF_MEASUREMENT_LABEL}</StatusBadge>
                  <PatientSelfMeasurementValues item={item} />
                </div>
                {item.canDelete ? <DeleteForm measurementId={item.measurementId} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
