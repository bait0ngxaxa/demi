"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FAMILY_APPOINTMENT_ACCEPTANCE_TEXT } from "@/modules/family/domain/appointment-grant-contract";
import { formatFamilyManagementDate, formatFamilyParticipantName } from "@/modules/family/presentation/caregiver-relationship-presentation";
import type { AppointmentGrantManagement, AppointmentGrantManagementItem } from "@/modules/family/services/appointment-grant-management-query-service";
import type { FamilyRelationshipManagementItem } from "@/modules/family/services/caregiver-relationship-query-service";
import { acceptAppointmentGrantAction, proposeAppointmentGrantAction, revokeAppointmentGrantAction } from "@/modules/family/transport/appointment-grant-actions";
import { initialFamilyMutationActionState, type FamilyMutationActionState } from "@/modules/family/transport/action-state";

function Feedback({ state }: { state: FamilyMutationActionState }): React.JSX.Element | null {
  if (state.status === "IDLE") return null;
  return <p className={state.status === "ERROR" ? "mt-3 text-sm text-danger" : "mt-3 text-sm text-success"} role={state.status === "ERROR" ? "alert" : "status"}>{state.message}</p>;
}

function ProposeForm({ relationships, hospitals }: { relationships: readonly FamilyRelationshipManagementItem[]; hospitals: NonNullable<AppointmentGrantManagement["patient"]>["hospitals"] }): React.JSX.Element {
  const [state, action, pending] = useActionState(proposeAppointmentGrantAction, initialFamilyMutationActionState);
  const active = relationships.filter((row) => row.status === "ACTIVE");
  if (!active.length || !hospitals.length) return <p className="mt-3 text-sm text-text-muted">ต้องมีความสัมพันธ์ผู้ดูแลที่ใช้งานอยู่และหน่วยบริการของคุณที่พร้อมใช้งาน จึงจะเสนอสิทธิ์ได้</p>;
  return <form action={action} className="mt-4 space-y-4">
    <div className="space-y-2"><label htmlFor="appointment-caregiver" className="block text-sm font-semibold">ผู้ดูแลที่คุณอนุญาต</label>
      <Select id="appointment-caregiver" name="caregiverRelationshipId" required disabled={pending} defaultValue="">
        <option value="" disabled>เลือกผู้ดูแล</option>
        {active.map((row) => <option key={row.relationshipId} value={row.relationshipId}>{formatFamilyParticipantName(row.participant, "ไม่ระบุชื่อผู้ดูแล")}</option>)}
      </Select></div>
    <div className="space-y-2"><label htmlFor="appointment-hospital" className="block text-sm font-semibold">หน่วยบริการสำหรับนัดหมายที่จะแชร์</label>
      <Select id="appointment-hospital" name="patientHospitalRelationshipId" required disabled={pending} defaultValue="">
        <option value="" disabled>เลือกหนึ่งหน่วยบริการ</option>
        {hospitals.map((row) => <option key={row.relationshipId} value={row.relationshipId}>{row.hospitalName}</option>)}
      </Select></div>
    <Button disabled={pending} loading={pending} type="submit">{pending ? "กำลังเสนอสิทธิ์..." : "เสนอสิทธิ์ดูนัดหมาย"}</Button>
    <Feedback state={state} />
  </form>;
}

function GrantRow({ grant, perspective }: { grant: AppointmentGrantManagementItem; perspective: "patient" | "caregiver" }): React.JSX.Element {
  const [state, action, pending] = useActionState(perspective === "patient" ? revokeAppointmentGrantAction : acceptAppointmentGrantAction, initialFamilyMutationActionState);
  const label = grant.status === "PENDING" ? "รอผู้ดูแลยอมรับ" : grant.status === "ACTIVE" ? "ยอมรับสิทธิ์แล้ว" : "ยกเลิกสิทธิ์แล้ว";
  return <li className="space-y-3 py-5 first:pt-0">
    <p className="break-words font-semibold text-text">{formatFamilyParticipantName(grant.participant, perspective === "patient" ? "ไม่ระบุชื่อผู้ดูแล" : "ไม่ระบุชื่อผู้ป่วย")}</p>
    <p className="break-words text-sm text-text">{grant.hospitalName}</p>
    <StatusBadge variant={grant.status === "ACTIVE" ? "success" : grant.status === "PENDING" ? "warning" : "neutral"}>{label}</StatusBadge>
    <p className="text-sm text-text-muted">เสนอเมื่อ {formatFamilyManagementDate(grant.proposedAt)}</p>
    {grant.acceptedAt ? <p className="text-sm text-text-muted">ยอมรับเมื่อ {formatFamilyManagementDate(grant.acceptedAt)}</p> : null}
    {grant.revokedAt ? <p className="text-sm text-text-muted">ยกเลิกเมื่อ {formatFamilyManagementDate(grant.revokedAt)}</p> : null}
    {perspective === "caregiver" && grant.status === "PENDING" ? <p className="type-readable text-sm leading-7 text-text-muted">{FAMILY_APPOINTMENT_ACCEPTANCE_TEXT}</p> : null}
    {grant.status !== "REVOKED" && (perspective === "patient" || grant.status === "PENDING") ? <form action={action}>
      <input type="hidden" name="grantId" value={grant.grantId} />
      <Button type="submit" disabled={pending} loading={pending} variant={perspective === "patient" ? "danger" : "primary"} aria-label={`${perspective === "patient" ? "ยกเลิกสิทธิ์ดูนัดหมาย" : "ยอมรับสิทธิ์ดูนัดหมาย"}: ${formatFamilyParticipantName(grant.participant, "ไม่ระบุชื่อ")} ${grant.hospitalName}`}>
        {pending ? "กำลังบันทึก..." : perspective === "caregiver" ? "ยอมรับสิทธิ์ดูนัดหมาย" : grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์ดูนัดหมาย"}
      </Button>
    </form> : null}
    {perspective === "caregiver" && grant.status === "ACTIVE" ? <Link prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/family/grants/${grant.grantId}/appointments`}>ดูนัดหมายที่ได้รับสิทธิ์</Link> : null}
    <Feedback state={state} />
  </li>;
}

function Next({ cursor, name }: { cursor: string | null; name: string }): React.JSX.Element | null {
  return cursor ? <Link prefetch={false} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={`/app/family?${name}=${cursor}`}>ดูรายการถัดไป</Link> : null;
}

export function AppointmentSharingWorkspace({ management, relationships }: { management: AppointmentGrantManagement; relationships: readonly FamilyRelationshipManagementItem[] }): React.JSX.Element {
  return <section className="mt-8 max-w-4xl" aria-labelledby="appointment-sharing-heading">
    <h2 id="appointment-sharing-heading" className="text-xl font-semibold text-text">แชร์นัดหมายให้ผู้ดูแล</h2>
    <p className="type-readable mt-2 text-sm leading-7 text-text-muted">แชร์เฉพาะข้อมูลนัดหมายแบบอ่านอย่างเดียวในหนึ่งหน่วยบริการ ไม่เปิดข้อมูลอื่นของผู้ป่วย ผู้ดูแลต้องยอมรับสิทธิ์แยกจากการเชื่อมความสัมพันธ์</p>
    {management.patient ? <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text">สิทธิ์ดูนัดหมายที่คุณเสนอ</h3>
      <ProposeForm relationships={relationships} hospitals={management.patient.hospitals} />
      <Next name="hospitalsCursor" cursor={management.patient.nextHospitalsCursor} />
      {management.patient.grants.length ? <ul className="mt-6 divide-y divide-border">{management.patient.grants.map((grant) => <GrantRow key={grant.grantId} grant={grant} perspective="patient" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่มีข้อเสนอสิทธิ์ดูนัดหมาย</p>}
      <Next name="patientGrantsCursor" cursor={management.patient.nextCursor} />
    </Panel> : null}
    <Panel className="mt-4"><h3 className="text-lg font-semibold text-text">สิทธิ์ดูนัดหมายถึงบัญชีของคุณ</h3>
      {management.caregiver.grants.length ? <ul className="mt-4 divide-y divide-border">{management.caregiver.grants.map((grant) => <GrantRow key={grant.grantId} grant={grant} perspective="caregiver" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่มีสิทธิ์ดูนัดหมายที่พร้อมใช้งาน</p>}
      <Next name="caregiverGrantsCursor" cursor={management.caregiver.nextCursor} />
    </Panel>
  </section>;
}
