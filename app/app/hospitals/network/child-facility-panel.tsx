"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { buttonClassName } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type { ChildOwnerInvitationActionState } from "@/modules/hospital-service-areas/transport/action-state";
import {
  cancelPendingChildFacilityAction,
  changeChildOwnerInviteeAction,
  endServiceAreaAction,
  inviteReplacementChildOwnerAction,
  issueChildOwnerLinkAction,
  renameChildFacilityAction,
  revokeChildOwnerLinkAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

import { ChildOwnerInvitationForm, ChildOwnerInviteeFields, InvitationResult } from "./child-owner-invitation-form";

export type ChildFacilityPanelProps = {
  parentHospitalId: string;
  areaId: string;
  attachedAt: string;
  child: { id: string; hospitalCode: string; name: string; updatedAt: string };
  state: "PENDING_ACTIVATION" | "ACTIVE" | "NO_OWNER" | "INACTIVE";
  invitation: {
    inviteeName: string;
    delivery: "ACTIVATION_LINK" | "ACCOUNT_ACCEPTANCE";
    link: { status: "OPEN" | "EXPIRED" | "IN_USE" | "NONE"; expiresAt: string | null; mode: "REMOTE" | "ASSISTED" | null };
  } | null;
  lastDeclinedAt: string | null;
  registeredByThisParent: boolean;
};

const stateCopy: Record<ChildFacilityPanelProps["state"], { label: string; variant: StatusVariant }> = {
  PENDING_ACTIVATION: { label: "รอเปิดใช้งาน", variant: "warning" },
  ACTIVE: { label: "ใช้งานอยู่", variant: "success" },
  NO_OWNER: { label: "ไม่มีผู้ดูแล", variant: "danger" },
  INACTIVE: { label: "ไม่พร้อมใช้งาน", variant: "neutral" },
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function InvitationSummary({ invitation, lastDeclinedAt }: Pick<ChildFacilityPanelProps, "invitation" | "lastDeclinedAt">): React.JSX.Element | null {
  if (!invitation) {
    return lastDeclinedAt
      ? <p className="mt-2 text-sm text-warning">ผู้ถูกเชิญปฏิเสธคำเชิญเมื่อ {formatDateTime(lastDeclinedAt)} · เชิญผู้ดูแลคนใหม่ได้ด้านล่าง</p>
      : null;
  }
  const link = invitation.link;
  const linkText = invitation.delivery === "ACCOUNT_ACCEPTANCE"
    ? "รอผู้ถูกเชิญตอบรับในบัญชี DEMI ของตนเอง"
    : link.status === "OPEN"
      ? `ลิงก์ใช้ได้ถึง ${link.expiresAt ? formatDateTime(link.expiresAt) : "-"}${link.mode === "ASSISTED" ? " (เปิดใช้งานต่อหน้า)" : ""}`
      : link.status === "EXPIRED"
        ? "ลิงก์หมดอายุแล้ว ออกลิงก์ใหม่ได้"
        : link.status === "IN_USE"
          ? "ผู้ถูกเชิญกำลังเปิดใช้งานอยู่"
          : "ยังไม่มีลิงก์ที่ใช้ได้ ออกลิงก์ใหม่ได้";
  return (
    <p className="mt-2 text-sm leading-6 text-text-muted">
      ผู้ถูกเชิญเป็นผู้ดูแล: <span className="font-semibold text-text">{invitation.inviteeName}</span> · {linkText}
    </p>
  );
}

/**
 * One attached Child and the Parent actions O-D5 allows in its current state. The one-time link from any invitation
 * form is kept here, so it survives the refresh that may remove the form that issued it.
 */
export function ChildFacilityPanel(props: ChildFacilityPanelProps): React.JSX.Element {
  const { parentHospitalId, areaId, child, state, invitation } = props;
  const [result, setResult] = useState<Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }> | null>(null);
  const keepResult = useCallback((next: Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }>) => setResult(next), []);
  const target = { parentHospitalId, childHospitalId: child.id };
  const ownerManageable = state === "PENDING_ACTIVATION" || state === "NO_OWNER";
  const linkInvitation = invitation?.delivery === "ACTIVATION_LINK";
  const status = stateCopy[state];
  const headingId = `network-child-${child.id}`;

  return (
    <Panel aria-labelledby={headingId} className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-text" id={headingId}>{child.name}</h3>
          <p className="mt-1 text-sm text-text-muted">
            รหัส {child.hospitalCode} · อยู่ในเครือข่ายตั้งแต่ {formatDateTime(props.attachedAt)}
            {props.registeredByThisParent ? " · สร้างโดยแม่ข่ายนี้" : null}
          </p>
          <InvitationSummary invitation={invitation} lastDeclinedAt={props.lastDeclinedAt} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
          {state === "ACTIVE" || state === "NO_OWNER" ? (
            <>
              <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={`/app/patients?hospitalId=${encodeURIComponent(child.id)}`} prefetch={false}>
                ดูผู้ป่วย
              </Link>
              <Link
                className={buttonClassName({ variant: "ghost", size: "compact" })}
                href={`/app/hospitals/reporting?target=${encodeURIComponent(`PARENT_CHILD:${parentHospitalId}:${child.id}`)}`}
                prefetch={false}
              >
                รายงานสรุป
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {state === "PENDING_ACTIVATION" ? (
        <p className="mt-3 text-sm leading-6 text-text-muted">
          แม่ข่ายยังดูผู้ป่วยและรายงานของหน่วยบริการนี้ไม่ได้จนกว่าผู้ดูแลจะเปิดใช้งาน
        </p>
      ) : null}

      {result ? <InvitationResult state={result} /> : null}

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {ownerManageable && linkInvitation ? (
          <div className="flex flex-wrap gap-2">
            <ChildOwnerInvitationForm action={issueChildOwnerLinkAction} hidden={{ ...target, mode: "REMOTE" }} onSuccess={keepResult} submitLabel="ออกลิงก์ใหม่" />
            <ChildOwnerInvitationForm action={issueChildOwnerLinkAction} hidden={{ ...target, mode: "ASSISTED" }} onSuccess={keepResult} submitLabel="เปิดใช้งานต่อหน้า" submitVariant="ghost" />
            {invitation?.link.status === "OPEN" ? (
              <NetworkMutationForm action={revokeChildOwnerLinkAction} hidden={target} submitLabel="ยกเลิกลิงก์" submitVariant="ghost" />
            ) : null}
          </div>
        ) : null}

        {ownerManageable && (state === "PENDING_ACTIVATION" || invitation) ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-strong">
              {invitation ? "เปลี่ยนผู้ถูกเชิญ" : "เชิญผู้ดูแล"}
            </summary>
            <ChildOwnerInvitationForm
              action={changeChildOwnerInviteeAction}
              className="mt-3"
              hidden={target}
              onSuccess={keepResult}
              submitLabel={invitation ? "เปลี่ยนผู้ถูกเชิญ" : "ส่งคำเชิญ"}
            >
              {invitation ? <p className="mb-3 text-sm text-text-muted">คำเชิญและลิงก์เดิมจะใช้ไม่ได้ทันที</p> : null}
              <ChildOwnerInviteeFields idPrefix={`invitee-${child.id}`} />
            </ChildOwnerInvitationForm>
          </details>
        ) : null}

        {state === "NO_OWNER" && !invitation ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-strong">เชิญผู้ดูแลคนใหม่</summary>
            <ChildOwnerInvitationForm
              action={inviteReplacementChildOwnerAction}
              className="mt-3"
              hidden={target}
              onSuccess={keepResult}
              submitLabel="ส่งคำเชิญ"
            >
              <p className="mb-3 text-sm text-text-muted">หน่วยบริการนี้ไม่มีผู้ดูแลที่ใช้งานอยู่ ผู้ดูแลคนใหม่จะจัดการบุคลากรของหน่วยบริการเอง</p>
              <ChildOwnerInviteeFields idPrefix={`replacement-${child.id}`} />
            </ChildOwnerInvitationForm>
          </details>
        ) : null}

        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-strong">เปลี่ยนชื่อ</summary>
          <NetworkMutationForm
            action={renameChildFacilityAction}
            className="mt-3"
            hidden={{ ...target, expectedUpdatedAt: child.updatedAt }}
            submitLabel="บันทึกชื่อ"
          >
            <label className="text-sm font-semibold text-text" htmlFor={`rename-${child.id}`}>ชื่อหน่วยบริการ</label>
            <Input className="mt-2" defaultValue={child.name} id={`rename-${child.id}`} maxLength={200} name="name" required />
          </NetworkMutationForm>
        </details>

        {state === "PENDING_ACTIVATION" && props.registeredByThisParent ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-danger">ยกเลิกหน่วยบริการ</summary>
            <NetworkMutationForm
              action={cancelPendingChildFacilityAction}
              className="mt-3"
              confirmation={{
                title: `ยกเลิก ${child.name} หรือไม่`,
                description: "คำเชิญและลิงก์ทั้งหมดจะใช้ไม่ได้ หน่วยบริการจะออกจากเครือข่ายและถูกถอนออกจากรายชื่อ ข้อมูลไม่ถูกลบ ผู้ดูแลระบบคืนได้ภายหลัง",
                confirmLabel: "ยกเลิกหน่วยบริการ",
                destructive: true,
              }}
              hidden={{ ...target, confirm: "true" }}
              submitLabel="ยกเลิกหน่วยบริการ"
              submitVariant="danger"
            >
              <label className="text-sm font-semibold text-text" htmlFor={`cancel-reason-${child.id}`}>เหตุผล</label>
              <textarea className={`${inputClassName} mt-2 min-h-24 py-3`} id={`cancel-reason-${child.id}`} maxLength={500} name="reason" required />
            </NetworkMutationForm>
          </details>
        ) : null}

        {state !== "PENDING_ACTIVATION" ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-danger">นำออกจากเครือข่าย</summary>
            <NetworkMutationForm
              action={endServiceAreaAction}
              className="mt-3"
              confirmation={{
                title: `นำ ${child.name} ออกจากเครือข่ายหรือไม่`,
                description: "สิทธิ์ดูผู้ป่วยและรายงานสรุปของลูกข่ายนี้จะสิ้นสุดทันที ข้อมูลของลูกข่ายจะไม่ถูกลบ และเพิ่มกลับได้ภายหลัง",
                confirmLabel: "นำออกจากเครือข่าย",
                destructive: true,
              }}
              hidden={{ parentHospitalId, areaId, confirm: "true" }}
              submitLabel="นำออกจากเครือข่าย"
              submitVariant="danger"
            >
              <label className="text-sm font-semibold text-text" htmlFor={`end-reason-${areaId}`}>เหตุผล</label>
              <textarea className={`${inputClassName} mt-2 min-h-24 py-3`} id={`end-reason-${areaId}`} maxLength={500} name="endReason" required />
            </NetworkMutationForm>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}
