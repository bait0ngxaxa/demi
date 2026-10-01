"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
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
} from "@/modules/family/presentation/caregiver-relationship-presentation";
import {
  createCaregiverInvitationAction,
  revokeCaregiverRelationshipAction,
  revokePendingCaregiverInvitationAction,
  withdrawOwnCaregiverRelationshipAction,
} from "@/modules/family/transport/server-actions";
import {
  initialCreateCaregiverInvitationActionState,
  initialFamilyMutationActionState,
} from "@/modules/family/transport/action-state";

const noSubscription = (): (() => void) => () => undefined;
const getBrowserOrigin = (): string => window.location.origin;
const getServerOrigin = (): string => "";

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

function CreateCaregiverInvitationForm(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    createCaregiverInvitationAction,
    initialCreateCaregiverInvitationActionState,
  );
  const origin = useSyncExternalStore(noSubscription, getBrowserOrigin, getServerOrigin);
  const [copyStatus, setCopyStatus] = useState("");

  const invitationLink =
    state.status === "SUCCESS" && origin
      ? `${origin}/app/family/invitations#${encodeURIComponent(state.token)}`
      : "";

  async function copyInvitationLink(): Promise<void> {
    if (!invitationLink || !navigator.clipboard?.writeText) {
      setCopyStatus("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องลิงก์");
      return;
    }

    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopyStatus("คัดลอกลิงก์แล้ว ส่งให้ผู้รับที่ตั้งใจเชื่อมได้เลย");
    } catch {
      setCopyStatus("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องลิงก์");
    }
  }

  return (
    <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text">เพิ่มผู้ดูแล</h3>
      <p className="type-readable mt-2 text-sm leading-6 text-text-muted">
        ระบุเลขบัตรประชาชนของบัญชีที่มีอยู่แล้ว ระบบจะส่งลิงก์ให้คุณนำไปแชร์ด้วยตนเอง
        การรู้เลขบัตรประชาชนอย่างเดียวไม่ทำให้เกิดสิทธิ์หรือความสัมพันธ์
      </p>
      <form
        action={formAction}
        className="mt-5 space-y-4"
        key={state.status === "SUCCESS" ? `issued-${state.expiresAt}` : "new-invitation"}
        onSubmit={() => setCopyStatus("")}
      >
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="caregiver-national-id">
            เลขบัตรประชาชนของผู้ดูแล
          </label>
          <input
            autoComplete="off"
            className="h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring"
            disabled={pending}
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
        <Button disabled={pending} loading={pending} type="submit">
          {pending ? "กำลังสร้างคำเชิญ..." : "สร้างลิงก์คำเชิญ"}
        </Button>
      </form>
      {state.status === "SUCCESS" ? (
        <Alert className="mt-5" variant="success">
          <p className="font-semibold">สร้างคำเชิญแล้ว</p>
          <p className="mt-1">
            ลิงก์นี้แสดงครั้งเดียวและหมดอายุ {formatFamilyManagementDate(state.expiresAt)}
            กรุณาส่งให้ผู้รับที่ตั้งใจเชื่อมเท่านั้น
          </p>
          {invitationLink ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold" htmlFor="caregiver-invitation-link">
                ลิงก์คำเชิญ
              </label>
              <input
                autoComplete="off"
                className="h-12 w-full rounded-control border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                id="caregiver-invitation-link"
                readOnly
                spellCheck={false}
                type="text"
                value={invitationLink}
              />
              <Button onClick={copyInvitationLink} size="compact" type="button" variant="secondary">
                คัดลอกลิงก์
              </Button>
              {copyStatus ? <p className="text-sm" role="status">{copyStatus}</p> : null}
            </div>
          ) : (
            <p className="mt-2" role="status">กำลังเตรียมลิงก์คำเชิญ...</p>
          )}
        </Alert>
      ) : null}
    </Panel>
  );
}

function RevokePendingInvitation({
  invitation,
}: {
  invitation: FamilyInvitationManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    revokePendingCaregiverInvitationAction,
    initialFamilyMutationActionState,
  );

  return (
    <div className="mt-3">
      {invitation.status === "PENDING" ? (
        <form action={formAction}>
          <input name="invitationId" type="hidden" value={invitation.invitationId} />
          <Button disabled={pending} loading={pending} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยกเลิก..." : "ยกเลิกคำเชิญ"}
          </Button>
        </form>
      ) : null}
      {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">{state.message}</p> : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
    </div>
  );
}

function RevokeRelationship({
  relationship,
}: {
  relationship: FamilyRelationshipManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    revokeCaregiverRelationshipAction,
    initialFamilyMutationActionState,
  );

  return (
    <div className="mt-3">
      {relationship.status === "ACTIVE" ? (
        <form action={formAction}>
          <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
          <Button disabled={pending} loading={pending} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยุติ..." : "ยุติความสัมพันธ์ผู้ดูแล"}
          </Button>
        </form>
      ) : null}
      {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">{state.message}</p> : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
    </div>
  );
}

function WithdrawCaregiverRelationship({
  relationship,
}: {
  relationship: FamilyRelationshipManagementItem;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
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
        <Button onClick={() => setConfirming(true)} size="compact" type="button" variant="danger">
          หยุดการเป็นผู้ดูแล
        </Button>
      ) : (
        <div aria-label="ยืนยันการหยุดเป็นผู้ดูแล" className="space-y-3">
          <Alert variant="warning">
            การยืนยันจะยุติความสัมพันธ์นี้ทันทีและไม่สามารถเปิดกลับได้ หากต้องการเชื่อมอีกครั้ง
            ผู้ป่วยต้องส่งคำเชิญใหม่
          </Alert>
          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
              <Button disabled={pending} loading={pending} size="compact" type="submit" variant="danger">
                {pending ? "กำลังยุติ..." : "ยืนยันหยุดการเป็นผู้ดูแล"}
              </Button>
            </form>
            <Button disabled={pending} onClick={() => setConfirming(false)} size="compact" type="button" variant="secondary">
              กลับ
            </Button>
          </div>
        </div>
      )}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
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
                    <StatusBadge variant={caregiverInvitationStatusVariant(invitation.status)}>
                      {caregiverInvitationStatusLabel(invitation.status)}
                    </StatusBadge>
                    <p className="mt-2 text-sm text-text-muted">สร้างเมื่อ {formatFamilyManagementDate(invitation.issuedAt)}</p>
                    <p className="mt-1 text-sm text-text-muted">หมดอายุ {formatFamilyManagementDate(invitation.expiresAt)}</p>
                  </div>
                  <RevokePendingInvitation invitation={invitation} />
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
          รายการนี้แสดงสถานะการเชื่อมและการจัดการความสัมพันธ์เท่านั้น
        </p>
        <Panel className="mt-4">
          {overview.relationships.length === 0 ? (
            <p className="text-sm leading-6 text-text-muted">ยังไม่มีความสัมพันธ์ผู้ดูแลที่ตอบรับแล้ว</p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.relationships.map((relationship) => (
                <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between" key={relationship.relationshipId}>
                  <div>
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
}: {
  overview: FamilyManagementOverview;
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        description="จัดการคำเชิญและสถานะความสัมพันธ์ผู้ดูแล โดยข้อมูลส่วนนี้ไม่เปิดสิทธิ์อ่านข้อมูลสุขภาพของผู้ป่วย"
        title="ความสัมพันธ์ผู้ดูแล"
      />
      <Alert className="mt-6" variant="info">
        <p className="font-semibold">การเชื่อมนี้ยังไม่ให้สิทธิ์เข้าถึงข้อมูลผู้ป่วย</p>
        <p className="mt-1">
          ผู้ดูแลจะไม่สามารถอ่านโปรไฟล์ HN นัดหมาย หรือข้อมูลการดูแลจากความสัมพันธ์นี้
          ระบบยังไม่เปิดสิทธิ์อ่านข้อมูลสุขภาพในเฟสนี้
        </p>
      </Alert>
      {overview.patient ? <PatientPerspective overview={overview.patient} /> : null}
      <CaregiverPerspective overview={overview.caregiver} />
    </div>
  );
}
