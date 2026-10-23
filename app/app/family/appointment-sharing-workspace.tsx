"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS, FAMILY_APPOINTMENT_READ_CONTRACT } from "@/modules/family/domain/appointment-grant-contract";
import { CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS, CAREGIVER_RESOURCE_LABELS } from "@/modules/family/domain/caregiver-sharing-contract";
import type { ResourceGrantManagement, ResourceGrantManagementItem } from "@/modules/family/services/caregiver-resource-grant-service";
import { formatFamilyManagementDate, formatFamilyParticipantName } from "@/modules/family/presentation/caregiver-relationship-presentation";
import type { AppointmentGrantManagement, AppointmentGrantManagementItem } from "@/modules/family/services/appointment-grant-management-query-service";
import type { FamilyRelationshipManagementItem } from "@/modules/family/services/caregiver-relationship-query-service";
import {
  acceptAppointmentGrantAction,
  acceptResourceGrantAction,
  proposeAppointmentGrantAction,
  proposeResourceGrantAction,
  revokeAppointmentGrantAction,
  revokeResourceGrantAction,
} from "@/modules/family/transport/appointment-grant-actions";
import { initialFamilyMutationActionState, type FamilyMutationActionState } from "@/modules/family/transport/action-state";
import { personalAppointmentHubHref } from "../personal/appointments/personal-appointment-hub-href";

function Feedback({ state }: { state: FamilyMutationActionState }): React.JSX.Element | null {
  if (state.status === "IDLE") return null;
  return <p className={state.status === "ERROR" ? "mt-3 text-sm text-danger" : "mt-3 text-sm text-success"} role={state.status === "ERROR" ? "alert" : "status"}>{state.message}</p>;
}

function ProposeForm({ relationships, hospitals }: { relationships: readonly FamilyRelationshipManagementItem[]; hospitals: NonNullable<AppointmentGrantManagement["patient"]>["hospitals"] }): React.JSX.Element {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState(proposeAppointmentGrantAction, initialFamilyMutationActionState);
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
    <Button disabled={pending || unknownOutcome} loading={pending} type="submit">{pending ? "กำลังเสนอสิทธิ์..." : "เสนอสิทธิ์ดูนัดหมาย"}</Button>
    <Feedback state={state} />
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
  </form>;
}

function GrantRow({ grant, perspective }: { grant: AppointmentGrantManagementItem; perspective: "patient" | "caregiver" }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(perspective === "patient" ? revokeAppointmentGrantAction : acceptAppointmentGrantAction, initialFamilyMutationActionState);
  const careEnded = grant.careEnded === true && grant.status !== "REVOKED";
  const label = careEnded ? "สิ้นสุดการดูแลแล้ว" : grant.status === "PENDING" ? "รอผู้ดูแลยอมรับ" : grant.status === "ACTIVE" ? "ยอมรับสิทธิ์แล้ว" : "ยกเลิกสิทธิ์แล้ว";
  return <li className="space-y-3 py-5 first:pt-0">
    <p className="break-words font-semibold text-text">{formatFamilyParticipantName(grant.participant, perspective === "patient" ? "ไม่ระบุชื่อผู้ดูแล" : "ไม่ระบุชื่อผู้ป่วย")}</p>
    <p className="break-words text-sm text-text">{grant.hospitalName}</p>
    <StatusBadge variant={careEnded ? "neutral" : grant.status === "ACTIVE" ? "success" : grant.status === "PENDING" ? "warning" : "neutral"}>{label}</StatusBadge>
    {careEnded ? <p className="type-readable text-sm leading-7 text-text-muted">โรงพยาบาลสิ้นสุดการดูแลแล้ว ผู้ดูแลจึงไม่เห็นนัดหมายของโรงพยาบาลนี้</p> : null}
    <p className="text-sm text-text-muted">เสนอเมื่อ {formatFamilyManagementDate(grant.proposedAt)}</p>
    {grant.acceptedAt ? <p className="text-sm text-text-muted">ยอมรับเมื่อ {formatFamilyManagementDate(grant.acceptedAt)}</p> : null}
    {grant.revokedAt ? <p className="text-sm text-text-muted">ยกเลิกเมื่อ {formatFamilyManagementDate(grant.revokedAt)}</p> : null}
    {grant.contractVersion === FAMILY_APPOINTMENT_READ_CONTRACT && grant.status === "ACTIVE" ? <p className="type-readable text-sm leading-7 text-text-muted">สิทธิ์แบบเดิม: ผู้ดูแลเห็นเฉพาะนัดที่จะถึง ไม่เห็นรายละเอียดสถานที่ ผู้รับผิดชอบ หรือประวัตินัด จนกว่าจะยอมรับสิทธิ์แบบใหม่</p> : null}
    {perspective === "caregiver" && grant.status === "PENDING" ? <p className="type-readable text-sm leading-7 text-text-muted">{FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS[grant.contractVersion]}</p> : null}
    {grant.status !== "REVOKED" && (perspective === "patient" || grant.status === "PENDING") ? <form action={action}>
      <input type="hidden" name="grantId" value={grant.grantId} />
      <Button type="submit" disabled={pending || unknownOutcome} loading={pending} variant={perspective === "patient" ? "danger" : "primary"} aria-label={`${perspective === "patient" ? "ยกเลิกสิทธิ์ดูนัดหมาย" : "ยอมรับสิทธิ์ดูนัดหมาย"}: ${formatFamilyParticipantName(grant.participant, "ไม่ระบุชื่อ")} ${grant.hospitalName}`}>
        {pending ? "กำลังบันทึก..." : perspective === "caregiver" ? "ยอมรับสิทธิ์ดูนัดหมาย" : grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์ดูนัดหมาย"}
      </Button>
    </form> : null}
    {perspective === "patient" && grant.scope && grant.status === "ACTIVE" && grant.contractVersion === FAMILY_APPOINTMENT_READ_CONTRACT ? <UpgradeGrant grant={grant} scope={grant.scope} /> : null}
    {perspective === "caregiver" && grant.status === "ACTIVE" ? <Link prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={personalAppointmentHubHref({ subject: grant.grantId, tab: "upcoming" })}>ดูนัดหมายที่ได้รับสิทธิ์</Link> : null}
    <Feedback state={state} />
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
  </li>;
}

/** AF-5: proposes the v2 contract for the same scope; the v1 grant keeps working until the caregiver accepts. */
function UpgradeGrant({ grant, scope }: { grant: AppointmentGrantManagementItem; scope: NonNullable<AppointmentGrantManagementItem["scope"]> }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(proposeAppointmentGrantAction, initialFamilyMutationActionState);
  return <form action={action}>
    <input type="hidden" name="caregiverRelationshipId" value={scope.caregiverRelationshipId} />
    <input type="hidden" name="patientHospitalRelationshipId" value={scope.patientHospitalRelationshipId} />
    <Button type="submit" size="compact" variant="secondary" disabled={pending || unknownOutcome || state.status === "SUCCESS"} loading={pending}
      aria-label={`เสนอสิทธิ์ดูนัดหมายแบบใหม่: ${formatFamilyParticipantName(grant.participant, "ไม่ระบุชื่อ")} ${grant.hospitalName}`}>
      {pending ? "กำลังเสนอ..." : "เสนอสิทธิ์แบบใหม่ (รายละเอียดมากขึ้น)"}
    </Button>
    <Feedback state={state} />
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
  </form>;
}

function ProposeResourceForm({ relationships, resources }: { relationships: readonly FamilyRelationshipManagementItem[]; resources: ResourceGrantManagement["availableResources"] }): React.JSX.Element | null {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState(proposeResourceGrantAction, initialFamilyMutationActionState);
  const active = relationships.filter((row) => row.status === "ACTIVE");
  if (!active.length || !resources.length) return null;
  return <form action={action} className="mt-4 space-y-4">
    <div className="space-y-2"><label htmlFor="resource-caregiver" className="block text-sm font-semibold">ผู้ดูแล</label>
      <Select id="resource-caregiver" name="caregiverRelationshipId" required disabled={pending} defaultValue="">
        <option value="" disabled>เลือกผู้ดูแล</option>
        {active.map((row) => <option key={row.relationshipId} value={row.relationshipId}>{formatFamilyParticipantName(row.participant, "ไม่ระบุชื่อผู้ดูแล")}</option>)}
      </Select></div>
    <div className="space-y-2"><label htmlFor="resource-kind" className="block text-sm font-semibold">ข้อมูลที่จะแชร์</label>
      <Select id="resource-kind" name="resource" required disabled={pending} defaultValue="">
        <option value="" disabled>เลือกข้อมูล</option>
        {resources.map((resource) => <option key={resource} value={resource}>{CAREGIVER_RESOURCE_LABELS[resource]}</option>)}
      </Select></div>
    <Button disabled={pending || unknownOutcome} loading={pending} type="submit">{pending ? "กำลังเสนอสิทธิ์..." : "เสนอสิทธิ์"}</Button>
    <Feedback state={state} />
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
  </form>;
}

function ResourceGrantRow({ grant, perspective }: { grant: ResourceGrantManagementItem; perspective: "patient" | "caregiver" }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(perspective === "patient" ? revokeResourceGrantAction : acceptResourceGrantAction, initialFamilyMutationActionState);
  const name = formatFamilyParticipantName(grant.participant, perspective === "patient" ? "ไม่ระบุชื่อผู้ดูแล" : "ไม่ระบุชื่อผู้ป่วย");
  const resourceLabel = CAREGIVER_RESOURCE_LABELS[grant.resource];
  return <li className="space-y-3 py-5 first:pt-0">
    <p className="break-words font-semibold text-text">{name}</p>
    <p className="text-sm text-text">{resourceLabel}</p>
    <StatusBadge variant={!grant.available ? "neutral" : grant.status === "ACTIVE" ? "success" : "warning"}>
      {!grant.available ? "ปิดการแชร์ชั่วคราว" : grant.status === "ACTIVE" ? "ยอมรับสิทธิ์แล้ว" : "รอผู้ดูแลยอมรับ"}
    </StatusBadge>
    {!grant.available ? <p className="type-readable text-sm leading-7 text-text-muted">ระบบยังไม่เปิดการแชร์ข้อมูลประเภทนี้ ผู้ดูแลจึงไม่เห็นข้อมูลนี้ สิทธิ์ยังถูกบันทึกไว้และคุณยกเลิกได้</p> : null}
    <p className="text-sm text-text-muted">เสนอเมื่อ {formatFamilyManagementDate(grant.proposedAt)}</p>
    {grant.acceptedAt ? <p className="text-sm text-text-muted">ยอมรับเมื่อ {formatFamilyManagementDate(grant.acceptedAt)}</p> : null}
    {perspective === "caregiver" && grant.status === "PENDING" ? <p className="type-readable text-sm leading-7 text-text-muted">{CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS[grant.resource]}</p> : null}
    {perspective === "patient" || grant.status === "PENDING" ? <form action={action}>
      <input type="hidden" name="grantId" value={grant.grantId} />
      <Button type="submit" disabled={pending || unknownOutcome} loading={pending} variant={perspective === "patient" ? "danger" : "primary"} aria-label={`${perspective === "patient" ? "ยกเลิกสิทธิ์" : "ยอมรับสิทธิ์"}${resourceLabel}: ${name}`}>
        {pending ? "กำลังบันทึก..." : perspective === "caregiver" ? `ยอมรับสิทธิ์ดู${resourceLabel}` : grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์"}
      </Button>
    </form> : null}
    <Feedback state={state} />
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
  </li>;
}

function ResourceSharing({ resources, relationships }: { resources: ResourceGrantManagement; relationships: readonly FamilyRelationshipManagementItem[] }): React.JSX.Element {
  return <section className="mt-8" aria-labelledby="resource-sharing-heading">
    <h2 id="resource-sharing-heading" className="text-xl font-semibold text-text">แชร์ข้อมูลสุขภาพอื่นให้ผู้ดูแล</h2>
    <p className="type-readable mt-2 text-sm leading-7 text-text-muted">แต่ละรายการแชร์แยกกัน ผู้ดูแลต้องยอมรับก่อนจึงจะเห็น และคุณยกเลิกได้ทีละรายการ</p>
    {resources.patient ? <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text">ข้อมูลที่คุณแชร์</h3>
      <ProposeResourceForm relationships={relationships} resources={resources.availableResources} />
      {resources.patient.length ? <ul className="mt-6 divide-y divide-border">{resources.patient.map((grant) => <ResourceGrantRow key={grant.grantId} grant={grant} perspective="patient" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่ได้แชร์ข้อมูลอื่น</p>}
    </Panel> : null}
    <Panel className="mt-4"><h3 className="text-lg font-semibold text-text">ข้อมูลที่แชร์ถึงบัญชีของคุณ</h3>
      {resources.caregiver.length ? <ul className="mt-4 divide-y divide-border">{resources.caregiver.map((grant) => <ResourceGrantRow key={grant.grantId} grant={grant} perspective="caregiver" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่มีข้อมูลที่แชร์ถึงบัญชีนี้</p>}
    </Panel>
  </section>;
}

function Next({ cursor, name }: { cursor: string | null; name: string }): React.JSX.Element | null {
  return cursor ? <Link prefetch={false} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={`/app/family?${name}=${cursor}`}>ดูรายการถัดไป</Link> : null;
}

export function AppointmentSharingWorkspace({ management, relationships, resources = null }: {
  management: AppointmentGrantManagement; relationships: readonly FamilyRelationshipManagementItem[]; resources?: ResourceGrantManagement | null;
}): React.JSX.Element {
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
    {resources ? <ResourceSharing resources={resources} relationships={relationships} /> : null}
  </section>;
}
