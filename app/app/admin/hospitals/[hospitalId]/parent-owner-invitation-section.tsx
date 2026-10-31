"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  cancelParentOwnerInvitationAction,
  changeParentOwnerInviteeAction,
  inviteParentOwnerAction,
  issueParentOwnerLinkAction,
  revokeParentOwnerLinkAction,
} from "@/modules/hospital-onboarding/transport/parent-owner-invitation-actions";
import type { ChildOwnerInvitationActionState } from "@/modules/hospital-service-areas/transport/action-state";

import { ChildOwnerInvitationForm, ChildOwnerInviteeFields, InvitationResult } from "../../../hospitals/network/child-owner-invitation-form";

export type ParentOwnerInvitationSectionProps = {
  hospital: { id: string; name: string };
  availability: "FIRST_OWNER" | "REPLACEMENT" | "PENDING_APPLICATION" | "UNAVAILABLE";
  pendingApplication: { id: string; createdAt: string } | null;
  invitation: {
    membershipId: string;
    inviteeName: string;
    invitedAt: string;
    delivery: "ACTIVATION_LINK" | "ACCOUNT_ACCEPTANCE" | "ADMIN_RESET_REQUIRED";
    link: { status: "OPEN" | "EXPIRED" | "IN_USE" | "NONE"; expiresAt: string | null; mode: "REMOTE" | "ASSISTED" | null };
  } | null;
  lastDeclinedAt: string | null;
  /** Fresh per render; the page refreshes after every success, so each submission gets its own nonce. */
  submissionNonce: string;
};

type InvitationStatus = { label: string; variant: StatusVariant; detail: string };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function invitationStatus(invitation: NonNullable<ParentOwnerInvitationSectionProps["invitation"]>): InvitationStatus {
  if (invitation.delivery === "ADMIN_RESET_REQUIRED") {
    return {
      label: "ต้องคืนบัญชีโดยผู้ดูแลระบบ",
      variant: "danger",
      detail: "บัญชีนี้ถูกพักไว้ ยืนยันตัวตนและรีเซ็ตรหัสผ่านด้วยเครื่องมือคืนบัญชีก่อน แล้วผู้ถูกเชิญจึงตอบรับคำเชิญได้ด้วยตนเอง",
    };
  }
  if (invitation.delivery === "ACCOUNT_ACCEPTANCE") {
    return { label: "รอตอบรับ", variant: "info", detail: "ผู้ถูกเชิญมีบัญชี DEMI อยู่แล้ว และต้องตอบรับในบัญชีของตนเอง" };
  }
  const link = invitation.link;
  if (link.status === "EXPIRED") return { label: "หมดอายุ", variant: "neutral", detail: "ลิงก์หมดอายุแล้ว ออกลิงก์ใหม่ได้" };
  return {
    label: "รอเปิดใช้งาน",
    variant: "warning",
    detail: link.status === "OPEN"
      ? `ลิงก์ใช้ได้ถึง ${link.expiresAt ? formatDateTime(link.expiresAt) : "-"}${link.mode === "ASSISTED" ? " (เปิดใช้งานต่อหน้า)" : ""}`
      : link.status === "IN_USE"
        ? "ผู้ถูกเชิญกำลังเปิดใช้งานอยู่"
        : "ยังไม่มีลิงก์ที่ใช้ได้ ออกลิงก์ใหม่ได้",
  };
}

/**
 * ADR-0024 (path B): platform ADMIN invites the first OWNER of a pending Parent Hospital, or a replacement OWNER of an
 * ACTIVE Parent without one, with the same form and one-time result as a Child OWNER invitation. The one-time link is
 * kept here so it survives the refresh that replaces the form that issued it.
 */
export function ParentOwnerInvitationSection(props: ParentOwnerInvitationSectionProps): React.JSX.Element {
  const { hospital, availability, invitation, pendingApplication } = props;
  const [result, setResult] = useState<Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }> | null>(null);
  const keepResult = useCallback((next: Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }>) => setResult(next), []);
  const target = { hospitalId: hospital.id };
  const replacement = availability === "REPLACEMENT";
  const title = replacement ? "เชิญผู้ดูแลโรงพยาบาลแทน" : "เชิญผู้ดูแลโรงพยาบาลคนแรก";
  const manageable = availability === "FIRST_OWNER" || availability === "REPLACEMENT";
  const status = invitation ? invitationStatus(invitation) : null;
  // A pending Parent rejoins the public application list once its invitation ends; a replacement does not.
  const returnsToPublicList = availability === "FIRST_OWNER";

  return (
    <section aria-labelledby="parent-owner-invitation-heading">
      <Panel className="min-w-0">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="parent-owner-invitation-heading">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              {replacement
                ? "โรงพยาบาลนี้ไม่มีผู้ดูแลที่ใช้งานอยู่ ผู้ดูแลคนใหม่จะจัดการบุคลากร อสม. และเครือข่ายของโรงพยาบาลเอง"
                : "อีกทางหนึ่งนอกจากคำขอขึ้นทะเบียนสาธารณะ เมื่อผู้ถูกเชิญเปิดใช้งานหรือตอบรับ โรงพยาบาลจะเปิดใช้งานทันที ระหว่างที่คำเชิญเปิดอยู่ โรงพยาบาลจะไม่แสดงในหน้าขอขึ้นทะเบียน"}
            </p>
          </div>
          {status ? <StatusBadge variant={status.variant}>{status.label}</StatusBadge> : null}
        </div>

        {availability === "PENDING_APPLICATION" && pendingApplication ? (
          <Alert className="mt-4" variant="info">
            <p className="font-semibold">มีคำขอขึ้นทะเบียนรอพิจารณา</p>
            <p className="mt-1">
              ส่งคำขอเมื่อ {formatDateTime(pendingApplication.createdAt)} ต้องอนุมัติหรือปฏิเสธคำขอนี้ก่อน จึงจะเชิญผู้ดูแลจากหน้านี้ได้
            </p>
            <Link
              className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
              href={`/app/admin/hospital-onboarding/${encodeURIComponent(pendingApplication.id)}`}
            >
              ตรวจสอบคำขอ
            </Link>
          </Alert>
        ) : null}

        {invitation && status ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="break-words text-sm leading-6 text-text-muted">
              ผู้ถูกเชิญ: <span className="font-semibold text-text">{invitation.inviteeName}</span> · เชิญเมื่อ {formatDateTime(invitation.invitedAt)}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-muted">{status.detail}</p>
            {invitation.delivery === "ADMIN_RESET_REQUIRED" ? (
              <Link className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/app/admin/recovery">
                เปิดเครื่องมือคืนบัญชี
              </Link>
            ) : null}
            {/* ADR-0024: an open invitation can always be withdrawn, whatever its state or the Hospital's. */}
            <div className="mt-2">
              <NetworkMutationForm
                action={cancelParentOwnerInvitationAction}
                confirmation={{
                  title: `ยกเลิกคำเชิญของ ${invitation.inviteeName} หรือไม่`,
                  description: [
                    "คำเชิญและลิงก์จะใช้ไม่ได้ทันที",
                    returnsToPublicList
                      ? "โรงพยาบาลจะกลับไปอยู่ในรายชื่อขอขึ้นทะเบียนสาธารณะ และเชิญผู้ดูแลใหม่ได้ภายหลัง"
                      : "เชิญผู้ดูแลคนใหม่ได้ภายหลัง",
                    invitation.delivery === "ADMIN_RESET_REQUIRED" ? "บัญชีของผู้ถูกเชิญยังคงถูกพักไว้จนกว่าจะคืนบัญชี" : null,
                  ].filter(Boolean).join(" "),
                  confirmLabel: "ยกเลิกคำเชิญ",
                  destructive: true,
                }}
                hidden={{ ...target, membershipId: invitation.membershipId }}
                submitLabel="ยกเลิกคำเชิญ"
                submitVariant="ghost"
              />
            </div>
          </div>
        ) : props.lastDeclinedAt && manageable ? (
          <p className="mt-4 text-sm leading-6 text-warning">ผู้ถูกเชิญปฏิเสธคำเชิญเมื่อ {formatDateTime(props.lastDeclinedAt)} · เชิญผู้ดูแลคนใหม่ได้ด้านล่าง</p>
        ) : null}

        {result ? <InvitationResult audience="PLATFORM_ADMIN" state={result} /> : null}

        {manageable ? (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {invitation?.delivery === "ACTIVATION_LINK" ? (
              <div className="flex flex-wrap gap-2">
                <ChildOwnerInvitationForm
                  action={issueParentOwnerLinkAction}
                  audience="PLATFORM_ADMIN"
                  confirmation={{
                    title: "ออกลิงก์ใหม่หรือไม่",
                    description: "ลิงก์เดิมจะใช้ไม่ได้ทันที ส่งลิงก์หรือคิวอาร์โค้ดใหม่ให้ผู้ถูกเชิญ (ใช้ได้ 24 ชั่วโมง)",
                    confirmLabel: "ออกลิงก์ใหม่",
                  }}
                  hidden={{ ...target, mode: "REMOTE" }}
                  onSuccess={keepResult}
                  submitLabel="ออกลิงก์ใหม่"
                />
                <ChildOwnerInvitationForm
                  action={issueParentOwnerLinkAction}
                  audience="PLATFORM_ADMIN"
                  confirmation={{
                    title: "เปิดใช้งานต่อหน้าหรือไม่",
                    description: "ลิงก์เดิมจะใช้ไม่ได้ทันที ลิงก์ใหม่ใช้บนเครื่องนี้ได้ 15 นาที",
                    confirmLabel: "เปิดใช้งานต่อหน้า",
                  }}
                  hidden={{ ...target, mode: "ASSISTED" }}
                  onSuccess={keepResult}
                  submitLabel="เปิดใช้งานต่อหน้า"
                  submitVariant="ghost"
                />
                {invitation.link.status === "OPEN" ? (
                  <NetworkMutationForm
                    action={revokeParentOwnerLinkAction}
                    confirmation={{
                      title: "ยกเลิกลิงก์หรือไม่",
                      description: "ลิงก์นี้จะใช้ไม่ได้ทันที คำเชิญยังเปิดอยู่ และออกลิงก์ใหม่ได้ภายหลัง",
                      confirmLabel: "ยกเลิกลิงก์",
                      destructive: true,
                    }}
                    hidden={target}
                    submitLabel="ยกเลิกลิงก์"
                    submitVariant="ghost"
                  />
                ) : null}
              </div>
            ) : null}



            {invitation ? (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-strong">เปลี่ยนผู้ถูกเชิญ</summary>
                <ChildOwnerInvitationForm
                  action={changeParentOwnerInviteeAction}
                  audience="PLATFORM_ADMIN"
                  className="mt-3"
                  confirmation={{
                    title: "เปลี่ยนผู้ถูกเชิญหรือไม่",
                    description: `คำเชิญและลิงก์ของ ${invitation.inviteeName} จะใช้ไม่ได้ทันที`,
                    confirmLabel: "เปลี่ยนผู้ถูกเชิญ",
                    destructive: true,
                  }}
                  hidden={{ ...target, submissionNonce: props.submissionNonce }}
                  idempotent
                  onSuccess={keepResult}
                  submitLabel="เปลี่ยนผู้ถูกเชิญ"
                >
                  <ChildOwnerInviteeFields idPrefix={`parent-owner-change-${hospital.id}`} />
                </ChildOwnerInvitationForm>
              </details>
            ) : (
              <ChildOwnerInvitationForm
                action={inviteParentOwnerAction}
                audience="PLATFORM_ADMIN"
                hidden={{ ...target, submissionNonce: props.submissionNonce }}
                idempotent
                onSuccess={keepResult}
                submitLabel="ส่งคำเชิญ"
                submitVariant="primary"
              >
                <ChildOwnerInviteeFields idPrefix={`parent-owner-${hospital.id}`} />
              </ChildOwnerInvitationForm>
            )}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}
