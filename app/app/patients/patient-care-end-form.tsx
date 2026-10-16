"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PATIENT_HOSPITAL_RELATIONSHIP_END_REASON_MAX_LENGTH } from "@/modules/patient-hospital-relationship/schemas/patient-hospital-relationship-end-schemas";
import {
  endPatientHospitalRelationshipAction,
  verifyPatientHospitalRelationshipEndAction,
  type PatientHospitalRelationshipEndActionState,
  type PatientHospitalRelationshipEndVerification,
} from "@/modules/patient-hospital-relationship/transport/server-actions";

/** Phase F (ก-18) "ลบผู้ใช้งานทั่วไป": the OWNER ends care with this Hospital; the server re-checks OWNER authority. */
export function PatientCareEndForm({ relationshipId, hospitalId, hospitalName }: {
  relationshipId: string;
  hospitalId: string;
  hospitalName: string;
}): React.JSX.Element {
  const id = useId();
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<PatientHospitalRelationshipEndActionState, FormData>(
    endPatientHospitalRelationshipAction.bind(null, relationshipId),
    { status: "IDLE", message: "" },
  );
  const [verification, setVerification] = useState<PatientHospitalRelationshipEndVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const unresolvedOutcome = unknownOutcome && verification !== "ACTIVE";

  async function verifyStatus(): Promise<void> {
    setVerifying(true);
    try {
      setVerification(await verifyPatientHospitalRelationshipEndAction(relationshipId));
    } catch {
      setVerification("UNRESOLVED");
    } finally {
      setVerifying(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (verification === "ACTIVE") {
      setVerification(null);
    }
    submitPreservingInput(formAction)(event);
  }

  return <form action={formAction} className="space-y-4" onSubmit={handleSubmit}>
    <div className="space-y-2 text-sm leading-6 text-text-muted">
      <p>ผู้ป่วยจะไม่อยู่ในการดูแลของ{hospitalName}อีกต่อไป เจ้าหน้าที่และ อสม. ของโรงพยาบาลนี้จะเปิดดูหรือบันทึกข้อมูลผู้ป่วยรายนี้ไม่ได้ ผู้ดูแลในครอบครัวจะไม่เห็นนัดหมายของโรงพยาบาลนี้ และระบบจะหยุดส่งแจ้งเตือนทาง LINE ของโรงพยาบาลนี้</p>
      <p>นัดหมายที่ยังไม่ถึงกำหนดจะถูกยกเลิก การมอบหมาย อสม. คำขอที่ค้างอยู่ และการเปิดใช้งานบัญชีที่ยังไม่เสร็จของโรงพยาบาลนี้จะสิ้นสุด</p>
      <p>ระบบไม่ลบข้อมูล: ประวัติ Program การติดตาม นัดหมาย หลักฐาน และบันทึกการใช้งานยังเก็บไว้ ผู้ป่วยยังดูประวัติเดิมได้ และการดูแลที่โรงพยาบาลอื่นไม่เปลี่ยนแปลง การสิ้นสุดการดูแลย้อนกลับไม่ได้ หากต้องรับกลับเข้าดูแล ต้องติดต่อผู้ดูแลระบบ</p>
    </div>
    {verification === "ENDED" ? (
      <>
        <Alert role="status" variant="success">ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว ไม่ต้องส่งคำขอนี้ซ้ำ</Alert>
        <Link
          className={buttonClassName({ variant: "secondary" })}
          href={`/app/patients?hospitalId=${encodeURIComponent(hospitalId)}`}
        >
          กลับไปรายชื่อผู้ป่วย
        </Link>
      </>
    ) : (
      <>
        <div>
          <label htmlFor={`${id}-reason`} className="text-sm font-semibold text-text">เหตุผลที่สิ้นสุดการดูแล</label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            disabled={pending || unresolvedOutcome}
            id={`${id}-reason`}
            maxLength={PATIENT_HOSPITAL_RELATIONSHIP_END_REASON_MAX_LENGTH}
            name="endReason"
            required
          />
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-text">
          <input
            className="mt-1 h-4 w-4 shrink-0 accent-action-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            disabled={pending || unresolvedOutcome}
            name="confirmRetention"
            required
            type="checkbox"
            value="true"
          />
          <span>ข้าพเจ้าเข้าใจว่าการสิ้นสุดการดูแลย้อนกลับไม่ได้ และประวัติการดูแลยังถูกเก็บไว้</span>
        </label>
        {state.status === "ERROR" ? <Alert role="alert" variant="warning">{state.message}</Alert> : null}
        {verification === "ACTIVE" ? (
          <Alert role="status" variant="warning">ขณะตรวจสอบยังพบว่าการดูแลดำเนินอยู่ ตรวจสอบเหตุผลและการยืนยัน แล้วกด “สิ้นสุดการดูแลผู้ป่วยรายนี้” เพื่อดำเนินการต่อ การตรวจสอบนี้ไม่ได้ส่งคำขอซ้ำ</Alert>
        ) : null}
        {verification === "UNRESOLVED" ? (
          <Alert role="status" variant="warning">ยังยืนยันสถานะไม่ได้ โปรดลองตรวจสอบอีกครั้ง</Alert>
        ) : null}
        <UnknownOutcomeAlert
          active={unresolvedOutcome}
          recovery={{
            kind: "verify",
            label: "ตรวจสอบสถานะการสิ้นสุดการดูแล",
            message: "ระบบยังยืนยันผลไม่ได้ กดตรวจสอบสถานะจากข้อมูลของโรงพยาบาลนี้ได้ โดยระบบจะไม่ส่งคำขอสิ้นสุดการดูแลซ้ำ",
            onVerify: () => { void verifyStatus(); },
            verifying,
          }}
        />
        <Button disabled={pending || unresolvedOutcome} loading={pending} size="compact" type="submit" variant="danger">
          {pending ? "กำลังบันทึก…" : "สิ้นสุดการดูแลผู้ป่วยรายนี้"}
        </Button>
      </>
    )}
  </form>;
}
