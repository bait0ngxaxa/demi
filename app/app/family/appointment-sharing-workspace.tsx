"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { SavedRecordActions, SavedRecordCard } from "../personal/saved-record-card";
import {
  FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS,
  FAMILY_APPOINTMENT_LATEST_READ_CONTRACT,
  FAMILY_APPOINTMENT_WINDOW_MS,
  familyAppointmentContractIncludesDetail,
  familyAppointmentContractIncludesServiceSource,
  type FamilyAppointmentReadContract,
} from "@/modules/family/domain/appointment-grant-contract";
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
  if (!active.length || !hospitals.length) return <p className="mt-3 text-sm text-text-muted">ต้องมีผู้ดูแลที่เชื่อมแล้วก่อน จึงจะแชร์นัดหมายได้</p>;
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

const FAMILY_APPOINTMENT_WINDOW_DAYS = FAMILY_APPOINTMENT_WINDOW_MS / (24 * 60 * 60 * 1000);

/** The appointment fields a grant shows, as a plain list; version names never reach the UI (COPY-DISTILL R2). */
function appointmentGrantVisibleFields(contractVersion: FamilyAppointmentReadContract): string {
  if (!familyAppointmentContractIncludesDetail(contractVersion)) {
    return `นัดที่จะถึงใน ${FAMILY_APPOINTMENT_WINDOW_DAYS} วัน: ชื่อหน่วยบริการ ประเภทนัด วันและเวลา ระยะเวลา รูปแบบสถานที่ และสถานะ`;
  }
  const serviceAndSource = familyAppointmentContractIncludesServiceSource(contractVersion) ? " บริการ และที่มาของนัด" : "";
  return `นัดย้อนหลังและล่วงหน้าอย่างละ ${FAMILY_APPOINTMENT_WINDOW_DAYS} วัน: ชื่อหน่วยบริการ ประเภทนัด วันและเวลา สถานที่ ผู้รับผิดชอบ อสม. ตอนสร้างนัด${serviceAndSource}`;
}

/** What sharing the latest grant adds over an ACTIVE older grant; undefined when nothing is added. */
function appointmentGrantUpgradeFields(contractVersion: FamilyAppointmentReadContract): string | undefined {
  if (contractVersion === FAMILY_APPOINTMENT_LATEST_READ_CONTRACT) return undefined;
  if (!familyAppointmentContractIncludesDetail(contractVersion)) return "สถานที่ ผู้รับผิดชอบ ประวัตินัด บริการ";
  return familyAppointmentContractIncludesServiceSource(contractVersion) ? undefined : "บริการและที่มาของนัด";
}

const APPOINTMENT_SHARING_STATUS = {
  PENDING: { label: "รอผู้ดูแลยอมรับ", variant: "warning" },
  ACTIVE: { label: "แชร์นัดหมาย: เปิดอยู่", variant: "success" },
  REVOKED: { label: "แชร์นัดหมาย: ปิด", variant: "neutral" },
} as const;

function GrantRow({ grant, perspective }: { grant: AppointmentGrantManagementItem; perspective: "patient" | "caregiver" }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(perspective === "patient" ? revokeAppointmentGrantAction : acceptAppointmentGrantAction, initialFamilyMutationActionState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const careEnded = grant.careEnded === true && grant.status !== "REVOKED";
  const upgradeFields = grant.status === "ACTIVE" ? appointmentGrantUpgradeFields(grant.contractVersion) : undefined;
  const status = APPOINTMENT_SHARING_STATUS[grant.status];
  const canRevoke = perspective === "patient" && grant.status !== "REVOKED" && state.status !== "SUCCESS";
  const canAccept = perspective === "caregiver" && grant.status === "PENDING" && state.status !== "SUCCESS";
  const canUpgrade = perspective === "patient" && grant.scope !== undefined && upgradeFields !== undefined;
  const canOpenAppointments = perspective === "caregiver" && grant.status === "ACTIVE";
  const hasActions = canRevoke || canAccept || canUpgrade || canOpenAppointments;
  const participantName = formatFamilyParticipantName(grant.participant, perspective === "patient" ? "ไม่ระบุชื่อผู้ดูแล" : "ไม่ระบุชื่อผู้ป่วย");
  return <li className="min-w-0">
    <SavedRecordCard>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="break-words font-semibold text-text">{participantName}</h4>
          <p className="mt-0.5 break-words text-sm text-text-muted">{grant.hospitalName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
          {careEnded ? <StatusBadge variant="neutral">สิ้นสุดการดูแลแล้ว</StatusBadge> : null}
        </div>
      </div>
      {perspective === "caregiver" && grant.status === "PENDING" ? <div className="mt-4 border-t border-border pt-4">
        <h5 className="font-semibold text-text">ขอบเขตที่ต้องยอมรับ</h5>
        <p className="type-readable mt-2 text-sm leading-7 text-text-muted">{FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS[grant.contractVersion]}</p>
      </div> : <details className="mt-3 border-t border-border pt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
          {perspective === "patient" ? "ผู้ดูแลจะเห็นอะไรบ้าง" : "คุณเห็นอะไรบ้าง"}
        </summary>
        <p className="type-readable mt-2 text-sm leading-7 text-text-muted">{appointmentGrantVisibleFields(grant.contractVersion)}</p>
      </details>}
      {hasActions ? <SavedRecordActions>
        {canRevoke ? <ConfirmableActionForm
          action={action}
          className="inline"
          recovery={<UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />}
          confirmation={{
            title: `${grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์ดูนัดหมาย"}ของ ${participantName} หรือไม่`,
            description: grant.status === "PENDING" ? `${participantName} จะยอมรับข้อเสนอนี้ไม่ได้อีก` : `${participantName} จะไม่เห็นนัดหมายของ ${grant.hospitalName} อีก`,
            confirmLabel: grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์ดูนัดหมาย",
            confirmVariant: "destructive",
          }}
          outcome={state.status === "ERROR" ? "error" : "idle"}
          pending={pending}
          resultKey={state}
          returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-appointment-grants-heading") ?? document.querySelector<HTMLElement>("main h1")}
        >
          <input type="hidden" name="grantId" value={grant.grantId} />
          <Button type="submit" disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} variant="danger" aria-label={`${grant.status === "PENDING" ? "ยกเลิกข้อเสนอสิทธิ์ดูนัดหมาย" : "ยกเลิกสิทธิ์ดูนัดหมาย"}: ${participantName} ${grant.hospitalName}`}>
            {pending ? "กำลังบันทึก..." : grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์ดูนัดหมาย"}
          </Button>
        </ConfirmableActionForm> : null}
        {canAccept ? <form action={action}>
          <input type="hidden" name="grantId" value={grant.grantId} />
          <Button type="submit" disabled={pending || unknownOutcome} loading={pending} variant="primary" aria-label={`ยอมรับสิทธิ์ดูนัดหมาย: ${participantName} ${grant.hospitalName}`}>
            {pending ? "กำลังบันทึก..." : "ยอมรับสิทธิ์ดูนัดหมาย"}
          </Button>
        </form> : null}
        {canUpgrade && grant.scope && upgradeFields ? <UpgradeGrant grant={grant} scope={grant.scope} fields={upgradeFields} /> : null}
        {canOpenAppointments ? <Link prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-4 text-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={personalAppointmentHubHref({ subject: grant.grantId, tab: "upcoming" })}>ดูนัดหมาย</Link> : null}
      </SavedRecordActions> : null}
      <Feedback state={state} />
    </SavedRecordCard>
  </li>;
}

/** AF-5/SR-C1: proposes the latest contract for the same scope; the older grant keeps working until the caregiver accepts. */
function UpgradeGrant({ grant, scope, fields }: { grant: AppointmentGrantManagementItem; scope: NonNullable<AppointmentGrantManagementItem["scope"]>; fields: string }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState(proposeAppointmentGrantAction, initialFamilyMutationActionState);
  return <form action={action}>
    <input type="hidden" name="caregiverRelationshipId" value={scope.caregiverRelationshipId} />
    <input type="hidden" name="patientHospitalRelationshipId" value={scope.patientHospitalRelationshipId} />
    <Button type="submit" size="compact" variant="secondary" disabled={pending || unknownOutcome || state.status === "SUCCESS"} loading={pending}
      aria-label={`แชร์รายละเอียดนัดเพิ่ม: ${formatFamilyParticipantName(grant.participant, "ไม่ระบุชื่อ")} ${grant.hospitalName}`}>
      {pending ? "กำลังเสนอ..." : `แชร์รายละเอียดนัดเพิ่ม (${fields})`}
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = formatFamilyParticipantName(grant.participant, perspective === "patient" ? "ไม่ระบุชื่อผู้ดูแล" : "ไม่ระบุชื่อผู้ป่วย");
  const resourceLabel = CAREGIVER_RESOURCE_LABELS[grant.resource];
  const scopeLabel = grant.status === "PENDING" ? "ข้อมูลที่เสนอให้เข้าถึง" : "ข้อมูลที่อนุญาตแล้ว";
  const canRevoke = perspective === "patient" && state.status !== "SUCCESS";
  const canAccept = perspective === "caregiver" && grant.status === "PENDING" && state.status !== "SUCCESS";
  return <li className="min-w-0">
    <SavedRecordCard>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h4 className="break-words font-semibold text-text">{name}</h4>
        <StatusBadge variant={grant.status === "ACTIVE" ? "success" : "warning"}>
          {grant.status === "ACTIVE" ? "ยอมรับสิทธิ์แล้ว" : "รอผู้ดูแลยอมรับ"}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-text-muted">{scopeLabel}</dt>
          <dd className="mt-1 break-words text-text">{resourceLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-text-muted">เสนอเมื่อ</dt>
          <dd className="mt-1 text-text"><time dateTime={grant.proposedAt.toISOString()}>{formatFamilyManagementDate(grant.proposedAt)}</time></dd>
        </div>
        {grant.acceptedAt ? <div className="min-w-0">
          <dt className="text-sm font-semibold text-text-muted">ยอมรับเมื่อ</dt>
          <dd className="mt-1 text-text"><time dateTime={grant.acceptedAt.toISOString()}>{formatFamilyManagementDate(grant.acceptedAt)}</time></dd>
        </div> : null}
      </dl>
      {perspective === "caregiver" && grant.status === "PENDING" ? <div className="mt-4 border-t border-border pt-4">
        <h5 className="font-semibold text-text">ขอบเขตที่ต้องยอมรับ</h5>
        <p className="type-readable mt-2 text-sm leading-7 text-text-muted">{CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS[grant.resource]}</p>
      </div> : <details className="mt-3 border-t border-border pt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
          {perspective === "patient" ? "ผู้ดูแลจะเห็นอะไรบ้าง" : "คุณเห็นอะไรบ้าง"}
        </summary>
        <p className="type-readable mt-2 text-sm leading-7 text-text-muted">{CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS[grant.resource]}</p>
      </details>}
      {canRevoke || canAccept ? <SavedRecordActions>
        {canRevoke ? <ConfirmableActionForm
          action={action}
          className="inline"
          recovery={<UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />}
          confirmation={{
            title: `${grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์"} ${resourceLabel} ให้ ${name} หรือไม่`,
            description: grant.status === "PENDING"
              ? `${name} จะยอมรับข้อเสนอนี้ไม่ได้อีก`
              : `${name} จะไม่เห็น${resourceLabel}อีก`,
            confirmLabel: grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์",
            confirmVariant: "destructive",
          }}
          outcome={state.status === "ERROR" ? "error" : "idle"}
          pending={pending}
          resultKey={state}
          returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-resource-grants-heading") ?? document.querySelector<HTMLElement>("main h1")}
        >
          <input type="hidden" name="grantId" value={grant.grantId} />
          <Button type="submit" disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} variant="danger" aria-label={`${grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์"}${resourceLabel}: ${name}`}>
            {pending ? "กำลังบันทึก..." : grant.status === "PENDING" ? "ยกเลิกข้อเสนอ" : "ยกเลิกสิทธิ์"}
          </Button>
        </ConfirmableActionForm> : null}
        {canAccept ? <form action={action}>
          <input type="hidden" name="grantId" value={grant.grantId} />
          <Button type="submit" disabled={pending || unknownOutcome} loading={pending} variant="primary" aria-label={`ยอมรับสิทธิ์${resourceLabel}: ${name}`}>
            {pending ? "กำลังบันทึก..." : `ยอมรับสิทธิ์ดู${resourceLabel}`}
          </Button>
        </form> : null}
      </SavedRecordActions> : null}
      <Feedback state={state} />
    </SavedRecordCard>
  </li>;
}

function ResourceSharing({ resources, relationships }: { resources: ResourceGrantManagement; relationships: readonly FamilyRelationshipManagementItem[] }): React.JSX.Element {
  return <section className="mt-8" aria-labelledby="resource-sharing-heading">
    <h2 id="resource-sharing-heading" className="text-xl font-semibold text-text">แชร์ข้อมูลสุขภาพอื่นให้ผู้ดูแล</h2>
    {resources.patient ? <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="patient-resource-grants-heading" tabIndex={-1}>ข้อมูลที่คุณแชร์</h3>
      <ProposeResourceForm relationships={relationships} resources={resources.availableResources} />
      {resources.patient.length ? <ul className="mt-6 space-y-3">{resources.patient.map((grant) => <ResourceGrantRow key={grant.grantId} grant={grant} perspective="patient" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่ได้แชร์ข้อมูลอื่น</p>}
    </Panel> : null}
    <Panel className="mt-4"><h3 className="text-lg font-semibold text-text">ข้อมูลที่แชร์ถึงคุณ</h3>
      {resources.caregiver.length ? <ul className="mt-4 space-y-3">{resources.caregiver.map((grant) => <ResourceGrantRow key={grant.grantId} grant={grant} perspective="caregiver" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่มีข้อมูลที่แชร์ถึงคุณ</p>}
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
    {management.patient ? <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="patient-appointment-grants-heading" tabIndex={-1}>ผู้ดูแลที่คุณแชร์นัดหมายให้</h3>
      <ProposeForm relationships={relationships} hospitals={management.patient.hospitals} />
      <Next name="hospitalsCursor" cursor={management.patient.nextHospitalsCursor} />
      {management.patient.grants.length ? <ul className="mt-6 space-y-3">{management.patient.grants.map((grant) => <GrantRow key={grant.grantId} grant={grant} perspective="patient" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่ได้แชร์นัดหมายให้ผู้ดูแล</p>}
      <Next name="patientGrantsCursor" cursor={management.patient.nextCursor} />
    </Panel> : null}
    <Panel className="mt-4"><h3 className="text-lg font-semibold text-text">นัดหมายที่แชร์ถึงคุณ</h3>
      {management.caregiver.grants.length ? <ul className="mt-4 space-y-3">{management.caregiver.grants.map((grant) => <GrantRow key={grant.grantId} grant={grant} perspective="caregiver" />)}</ul> : <p className="mt-4 text-sm text-text-muted">ยังไม่มีนัดหมายที่แชร์ถึงคุณ</p>}
      <Next name="caregiverGrantsCursor" cursor={management.caregiver.nextCursor} />
    </Panel>
    {resources ? <ResourceSharing resources={resources} relationships={relationships} /> : null}
  </section>;
}
