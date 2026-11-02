"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

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
    delivery: "ACTIVATION_LINK" | "ACCOUNT_ACCEPTANCE" | "ADMIN_RESET_REQUIRED";
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
  const linkText = invitation.delivery === "ADMIN_RESET_REQUIRED"
    ? "รอ platform ADMIN ยืนยันตัวตน"
    : invitation.delivery === "ACCOUNT_ACCEPTANCE"
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const inviteeNationalIdRef = useRef<HTMLInputElement>(null);
  const returnFocusTarget = useCallback(
    () => headingRef.current?.isConnected ? headingRef.current : document.getElementById("network-children-heading"),
    [],
  );
  const target = { parentHospitalId, childHospitalId: child.id };
  const ownerManageable = state === "PENDING_ACTIVATION" || state === "NO_OWNER";
  const linkInvitation = invitation?.delivery === "ACTIVATION_LINK";
  const status = stateCopy[state];
  const headingId = `network-child-${child.id}`;

  return (
    <Panel aria-labelledby={headingId} className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id={headingId} ref={headingRef} tabIndex={-1}>{child.name}</h3>
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
            <ChildOwnerInvitationForm
              action={issueChildOwnerLinkAction}
              confirmation={{
                title: `ออกลิงก์ใหม่สำหรับ ${child.name} หรือไม่`,
                description: "ลิงก์เดิมจะใช้ไม่ได้ทันที ส่งลิงก์หรือคิวอาร์โค้ดใหม่ให้ผู้ถูกเชิญ (ใช้ได้ 24 ชั่วโมง)",
                confirmLabel: "ออกลิงก์ใหม่",
              }}
              hidden={{ ...target, mode: "REMOTE" }}
              onSuccess={keepResult}
              returnFocusTarget={returnFocusTarget}
              submitLabel="ออกลิงก์ใหม่"
            />
            <ChildOwnerInvitationForm
              action={issueChildOwnerLinkAction}
              confirmation={{
                title: `เปิดใช้งาน ${child.name} ต่อหน้าหรือไม่`,
                description: "ลิงก์เดิมจะใช้ไม่ได้ทันที ลิงก์ใหม่ใช้บนเครื่องนี้ได้ 15 นาที",
                confirmLabel: "เปิดใช้งานต่อหน้า",
              }}
              hidden={{ ...target, mode: "ASSISTED" }}
              onSuccess={keepResult}
              returnFocusTarget={returnFocusTarget}
              submitLabel="เปิดใช้งานต่อหน้า"
              submitVariant="ghost"
            />
            {invitation?.link.status === "OPEN" ? (
              <NetworkMutationForm
                action={revokeChildOwnerLinkAction}
                confirmation={{
                  title: `ยกเลิกลิงก์ของ ${child.name} หรือไม่`,
                  description: "ลิงก์นี้จะใช้ไม่ได้ทันที แต่คำเชิญยังเปิดอยู่และออกลิงก์ใหม่ได้ภายหลัง",
                  confirmLabel: "ยกเลิกลิงก์",
                  destructive: true,
                }}
                hidden={target}
                returnFocusTarget={returnFocusTarget}
                submitLabel="ยกเลิกลิงก์"
                submitVariant="ghost"
              />
            ) : null}
          </div>
        ) : null}

        {ownerManageable && invitation?.delivery === "ADMIN_RESET_REQUIRED" ? (
          <NetworkMutationForm
            action={revokeChildOwnerLinkAction}
            confirmation={{
              title: `ยกเลิกคำเชิญของ ${child.name} หรือไม่`,
              description: "คำเชิญและลิงก์ที่เกี่ยวข้องจะใช้ไม่ได้ทันที",
              confirmLabel: "ยกเลิกคำเชิญ",
              destructive: true,
            }}
            hidden={target}
            returnFocusTarget={returnFocusTarget}
            submitLabel="ยกเลิกคำเชิญ"
            submitVariant="ghost"
          />
        ) : null}

        {ownerManageable && (state === "PENDING_ACTIVATION" || invitation) ? (
          <ChildOwnerInvitationForm
            action={changeChildOwnerInviteeAction}
            hidden={target}
            onSuccess={keepResult}
            taskDialog={{
              title: invitation ? `เปลี่ยนผู้ถูกเชิญของ ${child.name}` : `เชิญผู้ดูแล ${child.name}`,
              triggerLabel: invitation ? "เปลี่ยนผู้ถูกเชิญ" : "เชิญผู้ดูแล",
              description: invitation ? "คำเชิญและลิงก์เดิมจะใช้ไม่ได้ทันที" : "กรอกข้อมูลผู้ดูแลและเลือกวิธีส่งมอบคำเชิญ",
              destructive: Boolean(invitation),
              initialFocusRef: inviteeNationalIdRef,
              returnFocusTarget,
            }}
            submitLabel={invitation ? "เปลี่ยนผู้ถูกเชิญ" : "ส่งคำเชิญ"}
          >
            <ChildOwnerInviteeFields idPrefix={`invitee-${child.id}`} nationalIdRef={inviteeNationalIdRef} />
          </ChildOwnerInvitationForm>
        ) : null}

        {state === "NO_OWNER" && !invitation ? (
          <ChildOwnerInvitationForm
            action={inviteReplacementChildOwnerAction}
            hidden={target}
            onSuccess={keepResult}
            taskDialog={{
              title: `เชิญผู้ดูแลคนใหม่ของ ${child.name}`,
              triggerLabel: "เชิญผู้ดูแลคนใหม่",
              description: "หน่วยบริการนี้ไม่มีผู้ดูแลที่ใช้งานอยู่ ผู้ดูแลคนใหม่จะจัดการบุคลากรของหน่วยบริการเอง",
              initialFocusRef: inviteeNationalIdRef,
              returnFocusTarget,
            }}
            submitLabel="ส่งคำเชิญ"
          >
            <ChildOwnerInviteeFields idPrefix={`replacement-${child.id}`} nationalIdRef={inviteeNationalIdRef} />
          </ChildOwnerInvitationForm>
        ) : null}

        <NetworkMutationForm
          action={renameChildFacilityAction}
          hidden={{ ...target, expectedUpdatedAt: child.updatedAt }}
          taskDialog={{
            title: `เปลี่ยนชื่อ ${child.name}`,
            triggerLabel: "เปลี่ยนชื่อ",
            description: "บันทึกชื่อใหม่ของหน่วยบริการนี้",
            initialFocusRef: renameInputRef,
            returnFocusTarget,
          }}
          submitLabel="บันทึกชื่อ"
        >
          <label className="text-sm font-semibold text-text" htmlFor={`rename-${child.id}`}>ชื่อหน่วยบริการ</label>
          <Input className="mt-2" defaultValue={child.name} id={`rename-${child.id}`} maxLength={200} name="name" required ref={renameInputRef} />
        </NetworkMutationForm>

        {state === "PENDING_ACTIVATION" && props.registeredByThisParent ? (
          <NetworkMutationForm
            action={cancelPendingChildFacilityAction}
            taskDialog={{
              title: `ยกเลิกหน่วยบริการ ${child.name}`,
              triggerLabel: "ยกเลิกหน่วยบริการ",
              description: "คำเชิญและลิงก์ทั้งหมดจะใช้ไม่ได้ หน่วยบริการจะออกจากเครือข่ายและถูกถอนออกจากรายชื่อ ข้อมูลไม่ถูกลบ ผู้ดูแลระบบคืนได้ภายหลัง",
              destructive: true,
              returnFocusTarget,
            }}
            hidden={{ ...target, confirm: "true" }}
            submitLabel="ยืนยันยกเลิกหน่วยบริการ"
            submitVariant="danger"
          >
            <label className="text-sm font-semibold text-text" htmlFor={`cancel-reason-${child.id}`}>เหตุผล</label>
            <textarea className={`${inputClassName} mt-2 min-h-24 py-3`} id={`cancel-reason-${child.id}`} maxLength={500} name="reason" required />
          </NetworkMutationForm>
        ) : null}

        {state !== "PENDING_ACTIVATION" ? (
          <NetworkMutationForm
            action={endServiceAreaAction}
            taskDialog={{
              title: `นำ ${child.name} ออกจากเครือข่าย`,
              triggerLabel: "นำออกจากเครือข่าย",
              description: "เจ้าของและเจ้าหน้าที่ของแม่ข่ายจะหมดสิทธิ์ดูผู้ป่วยและรายงานสรุปของลูกข่ายนี้ทันที ข้อมูลของลูกข่ายจะไม่ถูกลบ และเพิ่มกลับได้ภายหลัง",
              destructive: true,
              returnFocusTarget,
            }}
            hidden={{ parentHospitalId, areaId, confirm: "true" }}
            submitLabel="ยืนยันนำออกจากเครือข่าย"
            submitVariant="danger"
          >
            <label className="text-sm font-semibold text-text" htmlFor={`end-reason-${areaId}`}>เหตุผล</label>
            <textarea className={`${inputClassName} mt-2 min-h-24 py-3`} id={`end-reason-${areaId}`} maxLength={500} name="endReason" required />
          </NetworkMutationForm>
        ) : null}
      </div>
    </Panel>
  );
}
