"use client";

import { useId, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitPreservingInput } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { useFormDirty } from "@/components/ui/use-form-dirty";
import { correctPatientNameAction } from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions";
import { correctWorkforcePersonNameAction } from "@/modules/user-management/transport/server-actions";

import { usePatientEditAction } from "./use-patient-edit-action";

const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

/**
 * Customer decision E3 (ก-19): correct the Person name; the server decides OWNER vs ADMIN authority. UM-1 reuses it
 * for a staff or OSM relationship (`workforceKind`) under the same rule.
 */
export function PatientNameCorrectionForm({ relationshipId, version, givenName, familyName, workforceKind }: {
  relationshipId: string;
  version: number;
  givenName: string | null;
  familyName: string | null;
  workforceKind?: "staff" | "osm";
}): React.JSX.Element {
  const id = useId();
  const { state, dispatch: formAction, pending, unknownOutcome } = usePatientEditAction(
    relationshipId,
    workforceKind
      ? correctWorkforcePersonNameAction.bind(null, workforceKind, relationshipId)
      : correctPatientNameAction.bind(null, relationshipId),
    {
      success: "แก้ไขชื่อ-สกุลแล้ว",
      conflict: "ไม่สามารถแก้ไขชื่อ-สกุลได้ กรุณาตรวจสอบข้อมูลล่าสุด",
      forbidden: workforceKind ? "ไม่มีสิทธิ์แก้ไขชื่อ-สกุลของรายการนี้" : "ไม่มีสิทธิ์แก้ไขชื่อ-สกุลผู้ป่วยรายนี้",
    },
  );
  // The saved name stays in the fields, so only an unsaved edit can be submitted (SAVE-STATE).
  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useFormDirty(formRef, { savedKey: state.status === "SUCCESS" ? state : undefined });

  return <form action={formAction} className="space-y-4" onSubmit={submitPreservingInput(formAction)} ref={formRef}>
    <input type="hidden" name="expectedVersion" value={version} />
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-given`} className="text-sm font-semibold text-text">ชื่อ</label>
        <input id={`${id}-given`} name="givenName" className={control} defaultValue={givenName ?? ""} maxLength={120} required disabled={pending || unknownOutcome} />
      </div>
      <div>
        <label htmlFor={`${id}-family`} className="text-sm font-semibold text-text">นามสกุล</label>
        <input id={`${id}-family`} name="familyName" className={control} defaultValue={familyName ?? ""} maxLength={120} required disabled={pending || unknownOutcome} />
      </div>
    </div>
    {state.status === "ERROR" ? <Alert role="alert" variant="warning">{state.message}</Alert> : null}
    {/* Announced by the success Toast. */}
    {state.status === "SUCCESS" && !dirty ? <Alert role="none" variant="success">{state.message}</Alert> : null}
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
    <Button disabled={!dirty || unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
      {pending ? "กำลังบันทึก…" : "บันทึกชื่อ-สกุล"}
    </Button>
  </form>;
}
