"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type {
  FamilyInvitationManagementItem,
  FamilyManagementOverview,
  FamilyRelationshipManagementItem,
} from "@/modules/family/services/caregiver-relationship-query-service";
import {
  caregiverInvitationStatusLabel,
  caregiverInvitationStatusVariant,
  caregiverRelationshipStatusLabel,
  caregiverRelationshipStatusVariant,
  formatFamilyManagementDate,
  formatFamilyParticipantName,
} from "@/modules/family/presentation/caregiver-relationship-presentation";
import {
  createCaregiverInvitationAction,
  reissueCaregiverInvitationLinkAction,
  revokeCaregiverRelationshipAction,
  revokePendingCaregiverInvitationAction,
  withdrawOwnCaregiverRelationshipAction,
} from "@/modules/family/transport/server-actions";
import {
  initialCreateCaregiverInvitationActionState,
  initialFamilyMutationActionState,
} from "@/modules/family/transport/action-state";

import { FamilyInvitationQr } from "./family-invitation-qr";

function PaginationLink({ href }: { href: string }): React.JSX.Element {
  return (
    <Link
      className="mt-4 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:border-action-primary hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      href={href}
    >
      ดูรายการถัดไป
    </Link>
  );
}

function InvitationLinkHandoff({
  invitationUrl,
  expiresAt,
  title,
  description,
}: {
  invitationUrl: string;
  expiresAt: string;
  title: string;
  description: string;
}): React.JSX.Element {
  const [copyStatus, setCopyStatus] = useState("");
  const linkInputId = useId();

  async function copyInvitationLink(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องลิงก์");
      return;
    }

    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopyStatus("คัดลอกลิงก์แล้ว ส่งให้ผู้รับที่ตั้งใจเชื่อมได้เลย");
    } catch {
      setCopyStatus("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องลิงก์");
    }
  }

  return (
    <Alert className="mt-5" variant="success">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">
        {description}หมดอายุ {formatFamilyManagementDate(expiresAt)}
        กรุณาส่งให้ผู้รับที่ตั้งใจเชื่อมเท่านั้น
      </p>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <FamilyInvitationQr invitationLink={invitationUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block text-sm font-semibold" htmlFor={linkInputId}>
            ลิงก์คำเชิญ
          </label>
          <input
            autoComplete="off"
            className="h-12 w-full rounded-control border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            id={linkInputId}
            readOnly
            spellCheck={false}
            type="text"
            value={invitationUrl}
          />
          <Button onClick={copyInvitationLink} type="button" variant="secondary">
            คัดลอกลิงก์
          </Button>
          {copyStatus ? <p className="text-sm" role="status">{copyStatus}</p> : null}
          <p className="text-sm leading-6">
            QR และลิงก์นี้ใช้สำหรับผู้รับที่ตั้งใจเชื่อมเท่านั้น
            ผู้ที่ได้รับภาพ QR หรือลิงก์สามารถเปิดหน้าคำเชิญได้
            แต่ต้องเข้าสู่ระบบด้วยบัญชีผู้รับที่ระบุไว้จึงจะตอบรับได้
          </p>
        </div>
      </div>
    </Alert>
  );
}

function CreateCaregiverInvitationForm(): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    createCaregiverInvitationAction,
    initialCreateCaregiverInvitationActionState,
  );

  return (
    <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text">เพิ่มผู้ดูแล</h3>
      <p className="type-readable mt-2 text-sm leading-6 text-text-muted">
        ระบุเลขบัตรประชาชนของผู้ดูแล แล้วแชร์ลิงก์หรือ QR ให้ผู้รับด้วยตนเอง หากยังไม่มีบัญชี ผู้รับสามารถสร้างบัญชีจากคำเชิญนี้โดยใช้เลขบัตรเดียวกัน
        การรู้เลขบัตรประชาชนอย่างเดียวไม่ทำให้เกิดสิทธิ์หรือความสัมพันธ์
      </p>
      <form
        action={formAction}
        className="mt-5 space-y-4"
        key={state.status === "SUCCESS" ? `issued-${state.expiresAt}` : "new-invitation"}
        onSubmit={submitPreservingInput(formAction)}
      >
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="caregiver-national-id">
            เลขบัตรประชาชนของผู้ดูแล
          </label>
          <input
            autoComplete="off"
            className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring"
            disabled={pending || unknownOutcome}
            id="caregiver-national-id"
            inputMode="numeric"
            maxLength={13}
            name="nationalId"
            pattern="[0-9]{13}"
            required
            type="text"
          />
        </div>
        {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
        <UnknownOutcomeAlert
          active={unknownOutcome}
          className="mt-2"
          recovery={{
            kind: "reload",
            label: "ตรวจสอบคำเชิญล่าสุด",
            message:
              "ระบบอาจสร้างคำเชิญแล้ว แต่ลิงก์เดิมแสดงซ้ำไม่ได้ โหลดรายการคำเชิญล่าสุดด้านล่าง หากพบคำเชิญที่รอตอบรับของคู่เดิม ให้ยกเลิกก่อนแล้วจึงสร้างใหม่",
          }}
        />
        <Button disabled={pending || unknownOutcome} loading={pending} type="submit">
          {pending ? "กำลังสร้างคำเชิญ..." : "สร้างลิงก์คำเชิญ"}
        </Button>
      </form>
      {state.status === "SUCCESS" ? (
        <InvitationLinkHandoff
          description="QR และลิงก์นี้แสดงครั้งเดียวและ"
          expiresAt={state.expiresAt}
          key={state.invitationUrl}
          title="สร้างคำเชิญแล้ว"
          invitationUrl={state.invitationUrl}
        />
      ) : null}
    </Panel>
  );
}

function RevokePendingInvitation({
  invitation,
}: {
  invitation: FamilyInvitationManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    revokePendingCaregiverInvitationAction,
    initialFamilyMutationActionState,
  );

  return (
    <div className="mt-3">
      {invitation.status === "PENDING" ? (
        <form action={formAction}>
          <input name="invitationId" type="hidden" value={invitation.invitationId} />
          <Button aria-label={`ยกเลิกคำเชิญ: ${formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล")}`} disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยกเลิก..." : "ยกเลิกคำเชิญ"}
          </Button>
        </form>
      ) : null}
      {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">{state.message}</p> : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

function ShowPendingInvitationQr({
  invitation,
}: {
  invitation: FamilyInvitationManagementItem;
}): React.JSX.Element | null {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    reissueCaregiverInvitationLinkAction,
    initialCreateCaregiverInvitationActionState,
  );

  if (invitation.status !== "PENDING") return null;

  return (
    <div className="mt-3">
      <form action={formAction}>
        <input name="invitationId" type="hidden" value={invitation.invitationId} />
        <Button aria-label={`แสดงคิวอาร์โค้ดคำเชิญ: ${formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล")}`} disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="secondary">
          {pending ? "กำลังสร้างคิวอาร์โค้ด..." : state.status === "SUCCESS" ? "สร้างคิวอาร์โค้ดใหม่" : "แสดงคิวอาร์โค้ด"}
        </Button>
      </form>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ใช้เมื่อพบผู้รับต่อหน้า ระบบจะสร้างลิงก์ใหม่ให้คำเชิญเดิม ลิงก์หรือ QR ที่เคยส่งไปจะใช้ไม่ได้อีก
      </p>
      {state.status === "SUCCESS" ? (
        <InvitationLinkHandoff
          description="ลิงก์ก่อนหน้าของคำเชิญนี้ใช้ไม่ได้แล้ว QR และลิงก์นี้"
          expiresAt={state.expiresAt}
          key={state.invitationUrl}
          title="คิวอาร์โค้ดคำเชิญ"
          invitationUrl={state.invitationUrl}
        />
      ) : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

function RevokeRelationship({
  relationship,
}: {
  relationship: FamilyRelationshipManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    revokeCaregiverRelationshipAction,
    initialFamilyMutationActionState,
  );

  return (
    <div className="mt-3">
      {relationship.status === "ACTIVE" ? (
        <form action={formAction}>
          <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
          <Button aria-label={`ยุติความสัมพันธ์ผู้ดูแล: ${formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ดูแล")}`} disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยุติ..." : "ยุติความสัมพันธ์ผู้ดูแล"}
          </Button>
        </form>
      ) : null}
      {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">{state.message}</p> : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

function WithdrawCaregiverRelationship({
  relationship,
}: {
  relationship: FamilyRelationshipManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    withdrawOwnCaregiverRelationshipAction,
    initialFamilyMutationActionState,
  );
  const [confirming, setConfirming] = useState(false);

  if (relationship.status !== "ACTIVE") {
    return <></>;
  }

  if (state.status === "SUCCESS") {
    return <p className="mt-3 text-sm text-success" role="status">{state.message}</p>;
  }

  return (
    <div className="mt-3">
      {!confirming ? (
        <Button aria-label={`หยุดการเป็นผู้ดูแล: ${formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ป่วย")}`} onClick={() => setConfirming(true)} size="compact" type="button" variant="danger">
          หยุดการเป็นผู้ดูแล
        </Button>
      ) : (
        <div aria-label="ยืนยันการหยุดเป็นผู้ดูแล" className="space-y-3">
          <Alert variant="warning">
            การยืนยันจะยุติความสัมพันธ์กับ {formatFamilyParticipantName(relationship.participant, "ผู้ป่วยที่ไม่ระบุชื่อ")} ทันทีและไม่สามารถเปิดกลับได้ หากต้องการเชื่อมอีกครั้ง
            ผู้ป่วยต้องส่งคำเชิญใหม่
          </Alert>
          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
              <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? "กำลังยุติ..." : "ยืนยันหยุดการเป็นผู้ดูแล"}
              </Button>
            </form>
            <Button disabled={pending || unknownOutcome} onClick={() => setConfirming(false)} size="compact" type="button" variant="secondary">
              กลับ
            </Button>
          </div>
        </div>
      )}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

function PatientPerspective({
  overview,
}: {
  overview: NonNullable<FamilyManagementOverview["patient"]>;
}): React.JSX.Element {
  return (
    <>
      <section aria-labelledby="patient-caregivers-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="patient-caregivers-heading">ผู้ที่ดูแลคุณ</h2>
        <CreateCaregiverInvitationForm />
        <Panel className="mt-4">
          <h3 className="text-lg font-semibold text-text">คำเชิญที่คุณสร้าง</h3>
          {overview.invitations.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีคำเชิญผู้ดูแล</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {overview.invitations.map((invitation) => (
                <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between" key={invitation.invitationId}>
                  <div>
                    <p className="mb-2 break-words font-semibold text-text">{formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล")}</p>
                    <StatusBadge variant={caregiverInvitationStatusVariant(invitation.status)}>
                      {caregiverInvitationStatusLabel(invitation.status)}
                    </StatusBadge>
                    <p className="mt-2 text-sm text-text-muted">สร้างเมื่อ {formatFamilyManagementDate(invitation.issuedAt)}</p>
                    <p className="mt-1 text-sm text-text-muted">หมดอายุ {formatFamilyManagementDate(invitation.expiresAt)}</p>
                  </div>
                  <div className="sm:max-w-md">
                    <ShowPendingInvitationQr invitation={invitation} />
                    <RevokePendingInvitation invitation={invitation} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {overview.nextInvitationsCursor ? (
            <PaginationLink href={`/app/family?patientInvitationsCursor=${encodeURIComponent(overview.nextInvitationsCursor)}`} />
          ) : null}
        </Panel>
      </section>

      <section aria-labelledby="patient-relationships-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="patient-relationships-heading">ความสัมพันธ์ผู้ดูแล</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          รายการนี้แสดงสถานะการเชื่อมและการจัดการความสัมพันธ์เท่านั้น ความสัมพันธ์ผู้ดูแลไม่ได้ให้สิทธิ์ดูข้อมูลสุขภาพทั้งหมดโดยอัตโนมัติ
        </p>
        <Panel className="mt-4">
          {overview.relationships.length === 0 ? (
            <p className="text-sm leading-6 text-text-muted">ยังไม่มีความสัมพันธ์ผู้ดูแลที่ตอบรับแล้ว</p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.relationships.map((relationship) => (
                <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between" key={relationship.relationshipId}>
                  <div>
                    <p className="mb-2 break-words font-semibold text-text">{formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ดูแล")}</p>
                    {relationship.participant.nameIsSelfAsserted ? (
                      <p className="mb-2 text-sm text-text-muted">ชื่อที่ผู้ดูแลแจ้งเอง</p>
                    ) : null}
                    <StatusBadge variant={caregiverRelationshipStatusVariant(relationship.status)}>
                      {caregiverRelationshipStatusLabel(relationship.status)}
                    </StatusBadge>
                    <p className="mt-2 text-sm text-text-muted">เริ่มเมื่อ {formatFamilyManagementDate(relationship.activatedAt)}</p>
                    {relationship.revokedAt ? <p className="mt-1 text-sm text-text-muted">ยุติเมื่อ {formatFamilyManagementDate(relationship.revokedAt)}</p> : null}
                    {relationship.withdrawnAt ? <p className="mt-1 text-sm text-text-muted">ยุติเมื่อ {formatFamilyManagementDate(relationship.withdrawnAt)}</p> : null}
                  </div>
                  <RevokeRelationship relationship={relationship} />
                </li>
              ))}
            </ul>
          )}
          {overview.nextRelationshipsCursor ? (
            <PaginationLink href={`/app/family?patientRelationshipsCursor=${encodeURIComponent(overview.nextRelationshipsCursor)}`} />
          ) : null}
        </Panel>
      </section>
    </>
  );
}

function CaregiverPerspective({
  overview,
}: {
  overview: FamilyManagementOverview["caregiver"];
}): React.JSX.Element {
  return (
    <>
      <section aria-labelledby="caregiver-patients-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="caregiver-patients-heading">ผู้ที่คุณดูแล</h2>
        <Panel className="mt-4">
          <h3 className="text-lg font-semibold text-text">คำเชิญถึงบัญชีของคุณ</h3>
          {overview.invitations.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีคำเชิญผู้ดูแลถึงบัญชีนี้</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {overview.invitations.map((invitation) => (
                <li className="py-4 first:pt-0" key={invitation.invitationId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="break-words font-semibold text-text">{formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ป่วย")}</p>
                      <p className="mt-1 text-sm text-text-muted">หมดอายุ {formatFamilyManagementDate(invitation.expiresAt)}</p>
                    </div>
                    <StatusBadge variant={caregiverInvitationStatusVariant(invitation.status)}>
                      {caregiverInvitationStatusLabel(invitation.status)}
                    </StatusBadge>
                  </div>
                  {invitation.status === "PENDING" ? (
                    <p className="mt-2 text-sm leading-6 text-text-muted">
                      เปิดลิงก์คำเชิญที่ได้รับเพื่ออ่านรายละเอียดและตอบรับหรือปฏิเสธ
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {overview.nextInvitationsCursor ? (
            <PaginationLink href={`/app/family?caregiverInvitationsCursor=${encodeURIComponent(overview.nextInvitationsCursor)}`} />
          ) : null}
        </Panel>

        <Panel className="mt-4">
          <h3 className="text-lg font-semibold text-text">ความสัมพันธ์ที่คุณดูแล</h3>
          {overview.relationships.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีความสัมพันธ์ผู้ดูแลที่คุณตอบรับ</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {overview.relationships.map((relationship) => (
                <li className="py-4 first:pt-0" key={relationship.relationshipId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="break-words font-semibold text-text">{formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ป่วย")}</p>
                      <p className="mt-1 text-sm text-text-muted">เริ่มเมื่อ {formatFamilyManagementDate(relationship.activatedAt)}</p>
                      {relationship.revokedAt ? <p className="mt-1 text-sm text-text-muted">ยุติเมื่อ {formatFamilyManagementDate(relationship.revokedAt)}</p> : null}
                      {relationship.withdrawnAt ? <p className="mt-1 text-sm text-text-muted">ยุติเมื่อ {formatFamilyManagementDate(relationship.withdrawnAt)}</p> : null}
                    </div>
                    <StatusBadge variant={caregiverRelationshipStatusVariant(relationship.status)}>
                      {caregiverRelationshipStatusLabel(relationship.status)}
                    </StatusBadge>
                  </div>
                  <WithdrawCaregiverRelationship relationship={relationship} />
                </li>
              ))}
            </ul>
          )}
          {overview.nextRelationshipsCursor ? (
            <PaginationLink href={`/app/family?caregiverRelationshipsCursor=${encodeURIComponent(overview.nextRelationshipsCursor)}`} />
          ) : null}
        </Panel>
      </section>
    </>
  );
}

export function FamilyManagementWorkspace({
  overview,
  appointmentSharingEnabled = false,
}: {
  overview: FamilyManagementOverview;
  appointmentSharingEnabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        description="จัดการคำเชิญและความสัมพันธ์ระหว่างผู้ป่วยกับผู้ดูแล การเชื่อมความสัมพันธ์ไม่ทำให้เข้าถึงข้อมูลสุขภาพของผู้ป่วย"
        title="ครอบครัวและผู้ดูแล"
      />
      <Alert className="mt-6" variant="info">
        <p className="font-semibold">การเชื่อมนี้ยังไม่ให้สิทธิ์เข้าถึงข้อมูลผู้ป่วย</p>
        <p className="mt-1">
          ผู้ดูแลจะไม่สามารถอ่านโปรไฟล์ HN นัดหมาย หรือข้อมูลการดูแลจากความสัมพันธ์นี้
          {appointmentSharingEnabled ? "สิทธิ์ดูนัดหมายต้องเสนอและยอมรับแยกต่างหากในส่วนแชร์นัดหมาย" : "ระบบยังไม่เปิดสิทธิ์อ่านข้อมูลสุขภาพในเฟสนี้"}
        </p>
      </Alert>
      {overview.patient ? <PatientPerspective overview={overview.patient} /> : null}
      <CaregiverPerspective overview={overview.caregiver} />
    </div>
  );
}
