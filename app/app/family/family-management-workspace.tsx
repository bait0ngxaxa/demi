"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import type { CaregiverRelationshipLabel, CaregiverResource } from "@prisma/client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { dispatchFormDataPreservingInput, submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { SavedRecordActions, SavedRecordCard } from "../personal/saved-record-card";
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
  updateCaregiverRelationshipLabelAction,
  withdrawOwnCaregiverRelationshipAction,
} from "@/modules/family/transport/server-actions";
import {
  CAREGIVER_RELATIONSHIP_LABEL_OTHER_MAX,
  CAREGIVER_RELATIONSHIP_LABELS,
  CAREGIVER_RESOURCE_LABELS,
  formatCaregiverRelationshipLabel,
} from "@/modules/family/domain/caregiver-sharing-contract";
import {
  initialCreateCaregiverInvitationActionState,
  initialFamilyMutationActionState,
} from "@/modules/family/transport/action-state";

import { FamilyInvitationQr } from "./family-invitation-qr";
import { familyHealthSummaryHref } from "./members/family-health-summary-href";

/** AF-5: what the Patient may choose to share in the one-step add. */
export type CaregiverSharingOptions = {
  hospitals: readonly { relationshipId: string; hospitalName: string }[];
  resources: readonly CaregiverResource[];
};

const fieldClassName = "h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-text outline-none placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring";

function RelationshipLabelFields({
  idPrefix,
  disabled,
  defaultLabel,
  defaultOther,
  selectRef,
}: {
  idPrefix: string;
  disabled: boolean;
  defaultLabel?: CaregiverRelationshipLabel | null;
  defaultOther?: string | null;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
}): React.JSX.Element {
  const [kind, setKind] = useState<string>(defaultLabel ?? "");
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-text" htmlFor={`${idPrefix}-label`}>ผู้ดูแลเกี่ยวข้องกับคุณอย่างไร</label>
        <Select disabled={disabled} id={`${idPrefix}-label`} name="relationshipLabel" onChange={(event) => setKind(event.target.value)} ref={selectRef} required value={kind}>
          <option disabled value="">เลือกความสัมพันธ์</option>
          {(Object.keys(CAREGIVER_RELATIONSHIP_LABELS) as CaregiverRelationshipLabel[]).map((value) => (
            <option key={value} value={value}>{CAREGIVER_RELATIONSHIP_LABELS[value]}</option>
          ))}
        </Select>
      </div>
      {kind === "OTHER" ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor={`${idPrefix}-label-other`}>ระบุความสัมพันธ์</label>
          <input autoComplete="off" className={fieldClassName} defaultValue={defaultOther ?? ""} disabled={disabled} id={`${idPrefix}-label-other`} maxLength={CAREGIVER_RELATIONSHIP_LABEL_OTHER_MAX} name="relationshipLabelOther" required type="text" />
        </div>
      ) : null}
    </>
  );
}

function SharingScopeFields({ options, disabled }: { options: CaregiverSharingOptions; disabled: boolean }): React.JSX.Element | null {
  if (options.hospitals.length === 0 && options.resources.length === 0) return null;
  const checkbox = "mt-1 size-5 shrink-0 accent-action-primary";
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-text">ข้อมูลที่ต้องการแชร์ให้ผู้ดูแล</legend>
      <p className="text-sm leading-6 text-text-muted">เลือกเฉพาะที่ต้องการ ผู้ดูแลต้องยอมรับพร้อมกันตอนตอบรับคำเชิญ และคุณยกเลิกแต่ละรายการได้ภายหลัง</p>
      {options.hospitals.map((hospital) => (
        <label className="flex min-h-11 items-start gap-3 text-sm text-text" key={hospital.relationshipId}>
          <input className={checkbox} disabled={disabled} name="appointmentRelationshipIds" type="checkbox" value={hospital.relationshipId} />
          <span>นัดหมายที่ {hospital.hospitalName}</span>
        </label>
      ))}
      {options.resources.map((resource) => (
        <label className="flex min-h-11 items-start gap-3 text-sm text-text" key={resource}>
          <input className={checkbox} disabled={disabled} name="resources" type="checkbox" value={resource} />
          <span>{CAREGIVER_RESOURCE_LABELS[resource]}</span>
        </label>
      ))}
    </fieldset>
  );
}

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

function CreateCaregiverInvitationForm({ sharingOptions }: { sharingOptions: CaregiverSharingOptions }): React.JSX.Element {
  const [state, formAction, pending, unknownOutcome] = useMutationActionState(
    createCaregiverInvitationAction,
    initialCreateCaregiverInvitationActionState,
  );

  return (
    <Panel className="mt-4">
      <h3 className="text-lg font-semibold text-text">เพิ่มผู้ดูแล</h3>
      <p className="type-readable mt-2 text-sm leading-6 text-text-muted">
        ระบุเลขบัตรประชาชนและความสัมพันธ์ของผู้ดูแล เลือกข้อมูลที่ต้องการแชร์ แล้วแชร์ลิงก์หรือ QR ให้ผู้รับด้วยตนเอง หากยังไม่มีบัญชี ผู้รับสามารถสร้างบัญชีจากคำเชิญนี้โดยใช้เลขบัตรเดียวกัน
        การทราบเลขบัตรประชาชนเพียงอย่างเดียวไม่ทำให้ผู้รับเข้าถึงข้อมูลได้ ผู้รับต้องตอบรับคำเชิญก่อน
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
        <RelationshipLabelFields disabled={pending || unknownOutcome} idPrefix="caregiver-invitation" />
        <SharingScopeFields disabled={pending || unknownOutcome} options={sharingOptions} />
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const participantName = formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล");

  return (
    <div className="min-w-0 max-w-full">
      {invitation.status === "PENDING" && state.status !== "SUCCESS" ? (
        <ConfirmableActionForm
          action={formAction}
          className="inline"
          confirmation={{
            title: `ยกเลิกคำเชิญของ ${participantName} หรือไม่`,
            description: "คำเชิญที่รอตอบรับนี้จะใช้ไม่ได้ทันที ประวัติคำเชิญยังคงอยู่ หากต้องการเชื่อมต่อภายหลังต้องสร้างคำเชิญใหม่",
            confirmLabel: "ยกเลิกคำเชิญ",
            confirmVariant: "destructive",
          }}
          outcome={state.status === "ERROR" ? "error" : "idle"}
          pending={pending}
          resultKey={state}
          returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-invitations-heading") ?? document.querySelector<HTMLElement>("main h1")}
        >
          <input name="invitationId" type="hidden" value={invitation.invitationId} />
          <Button aria-label={`ยกเลิกคำเชิญ: ${participantName}`} disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยกเลิก..." : "ยกเลิกคำเชิญ"}
          </Button>
        </ConfirmableActionForm>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const participantName = formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล");

  if (invitation.status !== "PENDING") return null;

  return (
    <div className="min-w-0 max-w-full">
      <ConfirmableActionForm
        action={formAction}
        className="inline"
        confirmation={{
          title: `สร้างลิงก์คำเชิญใหม่ให้ ${participantName} หรือไม่`,
          description: "ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที คำเชิญเดิมยังคงรอตอบรับ และระบบจะแสดงลิงก์ใหม่ด้านล่างหลังสร้างสำเร็จ",
          confirmLabel: "สร้างลิงก์ใหม่",
          confirmVariant: "destructive",
        }}
        outcome={state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : "idle"}
        pending={pending}
        resultKey={state}
        returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-invitations-heading") ?? document.querySelector<HTMLElement>("main h1")}
      >
        <input name="invitationId" type="hidden" value={invitation.invitationId} />
        <Button aria-label={`แสดงคิวอาร์โค้ดคำเชิญ: ${participantName}`} disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} size="compact" type="submit" variant="secondary">
          {pending ? "กำลังสร้างคิวอาร์โค้ด..." : state.status === "SUCCESS" ? "สร้างคิวอาร์โค้ดใหม่" : "แสดงคิวอาร์โค้ด"}
        </Button>
      </ConfirmableActionForm>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const participantName = formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ดูแล");

  return (
    <div className="min-w-0 max-w-full">
      {relationship.status === "ACTIVE" && state.status !== "SUCCESS" ? (
        <ConfirmableActionForm
          action={formAction}
          className="inline"
          confirmation={{
            title: `ยกเลิกการเชื่อมต่อกับ ${participantName} หรือไม่`,
            description: "การเชื่อมต่อกับผู้ดูแลรายนี้จะสิ้นสุดทันที สิทธิ์ดูนัดหมายและข้อมูลสุขภาพที่แชร์ให้จะถูกยกเลิก ประวัติยังคงอยู่ หากต้องการเชื่อมอีกครั้งต้องส่งคำเชิญใหม่",
            confirmLabel: "ยกเลิกการเชื่อมต่อ",
            confirmVariant: "destructive",
          }}
          outcome={state.status === "ERROR" ? "error" : "idle"}
          pending={pending}
          resultKey={state}
          returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-relationships-heading") ?? document.querySelector<HTMLElement>("main h1")}
        >
          <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
          <Button aria-label={`ยกเลิกการเชื่อมต่อกับผู้ดูแล: ${participantName}`} disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} size="compact" type="submit" variant="danger">
            {pending ? "กำลังยกเลิกการเชื่อมต่อ..." : "ยกเลิกการเชื่อมต่อกับผู้ดูแล"}
          </Button>
        </ConfirmableActionForm>
      ) : null}
      {state.status === "SUCCESS" ? <p className="mt-2 text-sm text-success" role="status">{state.message}</p> : null}
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

type RelationshipLabelEditTarget = {
  relationshipId: string;
  expectedVersion: number;
  relationshipLabel: CaregiverRelationshipLabel | null;
  relationshipLabelOther: string | null;
  participantName: string;
};

function RelationshipLabelEditDialog({
  target,
  open,
  triggerRef,
  onClose,
  onSuccess,
}: {
  target: RelationshipLabelEditTarget | null;
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}): React.JSX.Element | null {
  const [draft, setDraft] = useState<{ relationshipLabel: CaregiverRelationshipLabel | null; relationshipLabelOther: string } | null>(null);
  const actionWithSuccess = useCallback(async (previous: typeof initialFamilyMutationActionState, formData: FormData) => {
    const next = await updateCaregiverRelationshipLabelAction(previous, formData);
    if (next.status === "SUCCESS") {
      setDraft(null);
      onSuccess(next.message);
    }
    return next;
  }, [onSuccess]);
  const [state, dispatch, pending, unknownOutcome] = useMutationActionState(
    actionWithSuccess,
    initialFamilyMutationActionState,
  );
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  if (!open || !target) return null;

  const relationshipLabel = formatCaregiverRelationshipLabel(target.relationshipLabel, target.relationshipLabelOther) ?? "ยังไม่ได้ระบุ";
  const locked = pending || unknownOutcome;

  function closeDialog(): void {
    if (!pending) {
      const form = formRef.current;
      const label = form?.elements.namedItem("relationshipLabel");
      const other = form?.elements.namedItem("relationshipLabelOther");
      if (label instanceof HTMLSelectElement) {
        setDraft({
          relationshipLabel: CAREGIVER_RELATIONSHIP_LABELS[label.value as CaregiverRelationshipLabel] ? label.value as CaregiverRelationshipLabel : null,
          relationshipLabelOther: other instanceof HTMLInputElement ? other.value : "",
        });
      }
      onClose();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (locked) {
      event.preventDefault();
      return;
    }
    dispatchFormDataPreservingInput(event, dispatch);
  }

  return (
    <ModalDialog
      description={`แก้ไขป้ายความสัมพันธ์ของ ${target.participantName} ซึ่งปัจจุบันระบุว่า “${relationshipLabel}” ปิดหน้าต่างก่อนบันทึกแล้วกลับมาแก้ ระบบจะเก็บร่างนี้ไว้`}
      dismissible={!pending}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" disabled={pending} onClick={closeDialog} variant="secondary">ยกเลิก</Button>
          <Button className="w-full sm:w-auto" disabled={locked} form={formId} loading={pending} type="submit">
            {pending ? "กำลังบันทึก..." : "บันทึกความสัมพันธ์"}
          </Button>
        </div>
      }
      initialFocusRef={selectRef}
      onRequestClose={closeDialog}
      returnFocusTarget={() => triggerRef.current ?? document.getElementById("patient-relationships-heading") ?? document.querySelector<HTMLElement>("main h1")}
      title={`แก้ไขความสัมพันธ์กับ ${target.participantName}`}
    >
      <form action={dispatch} className="space-y-4" id={formId} onSubmit={handleSubmit} ref={formRef}>
        <input name="relationshipId" type="hidden" value={target.relationshipId} />
        <input name="expectedVersion" type="hidden" value={target.expectedVersion} />
        <RelationshipLabelFields
          defaultLabel={draft?.relationshipLabel ?? target.relationshipLabel}
          defaultOther={draft?.relationshipLabelOther ?? target.relationshipLabelOther}
          disabled={locked}
          idPrefix={`relationship-${target.relationshipId}`}
          selectRef={selectRef}
        />
        {state.status === "ERROR" ? <Alert role="alert" variant="danger">{state.message}</Alert> : null}
        <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} />
      </form>
    </ModalDialog>
  );
}

function EditRelationshipLabel({
  relationship,
}: {
  relationship: FamilyRelationshipManagementItem;
}): React.JSX.Element | null {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<RelationshipLabelEditTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const handleSuccess = useCallback((message: string): void => {
    setSuccessMessage(message);
    setDialogOpen(false);
    setTarget(null);
  }, []);
  if (relationship.status !== "ACTIVE") return null;

  const participantName = formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ดูแล");

  return (
    <div className="min-w-0 max-w-full">
      <Button
        aria-label={`แก้ไขความสัมพันธ์: ${participantName}`}
        onClick={() => {
          setSuccessMessage("");
          setTarget((current) => current ?? {
            relationshipId: relationship.relationshipId,
            expectedVersion: relationship.relationshipLabelVersion,
            relationshipLabel: relationship.relationshipLabel,
            relationshipLabelOther: relationship.relationshipLabelOther,
            participantName,
          });
          setDialogOpen(true);
        }}
        ref={triggerRef}
        size="compact"
        type="button"
        variant="secondary"
      >
        แก้ไขความสัมพันธ์
      </Button>
      {successMessage ? <p className="mt-2 text-sm text-success" role="status">{successMessage}</p> : null}
      <RelationshipLabelEditDialog
        onClose={() => setDialogOpen(false)}
        onSuccess={handleSuccess}
        open={dialogOpen}
        target={target}
        triggerRef={triggerRef}
      />
    </div>
  );
}

function RelationshipLabelText({ relationship }: { relationship: FamilyRelationshipManagementItem }): React.JSX.Element | null {
  const label = formatCaregiverRelationshipLabel(relationship.relationshipLabel, relationship.relationshipLabelOther);
  return label ? <p className="mb-2 text-sm text-text">ความสัมพันธ์: {label}</p> : null;
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const participantName = formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ป่วย");

  if (relationship.status !== "ACTIVE") {
    return <></>;
  }

  if (state.status === "SUCCESS") {
    return <p className="min-w-0 text-sm text-success" role="status">{state.message}</p>;
  }

  return (
    <div className="min-w-0 max-w-full">
      <ConfirmableActionForm
        action={formAction}
        className="inline"
        confirmation={{
          title: `หยุดดูแล ${participantName} หรือไม่`,
          description: `การเชื่อมต่อกับผู้ป่วยรายนี้จะสิ้นสุดทันที คุณจะดูข้อมูลที่ผู้ป่วยแชร์ไว้ไม่ได้อีก ประวัติยังคงอยู่ หากต้องการเชื่อมอีกครั้ง ผู้ป่วยต้องส่งคำเชิญใหม่`,
          confirmLabel: "หยุดดูแลผู้ป่วยรายนี้",
          confirmVariant: "destructive",
        }}
        outcome={state.status === "ERROR" ? "error" : "idle"}
        pending={pending}
        resultKey={state}
        returnFocusTarget={() => triggerRef.current ?? document.getElementById("caregiver-relationships-heading") ?? document.querySelector<HTMLElement>("main h1")}
      >
        <input name="relationshipId" type="hidden" value={relationship.relationshipId} />
        <Button aria-label={`หยุดดูแลผู้ป่วย: ${participantName}`} disabled={pending || unknownOutcome} loading={pending} ref={triggerRef} size="compact" type="submit" variant="danger">
          {pending ? "กำลังหยุดดูแล..." : "หยุดดูแลผู้ป่วยรายนี้"}
        </Button>
      </ConfirmableActionForm>
      {state.status === "ERROR" ? <p className="mt-2 text-sm text-danger" role="alert">{state.message}</p> : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-2" recovery={{ kind: "reload" }} />
    </div>
  );
}

function PatientPerspective({
  overview,
  sharingOptions,
}: {
  overview: NonNullable<FamilyManagementOverview["patient"]>;
  sharingOptions: CaregiverSharingOptions;
}): React.JSX.Element {
  return (
    <>
      <section aria-labelledby="patient-caregivers-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="patient-caregivers-heading">ผู้ที่ดูแลคุณ</h2>
        <CreateCaregiverInvitationForm sharingOptions={sharingOptions} />
        <Panel className="mt-4">
          <h3 className="text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="patient-invitations-heading" tabIndex={-1}>คำเชิญที่คุณสร้าง</h3>
          {overview.invitations.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีคำเชิญผู้ดูแล</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {overview.invitations.map((invitation) => (
                <li className="min-w-0" key={invitation.invitationId}>
                  <SavedRecordCard>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h4 className="break-words font-semibold text-text">{formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ดูแล")}</h4>
                      <StatusBadge variant={caregiverInvitationStatusVariant(invitation.status)}>
                        {caregiverInvitationStatusLabel(invitation.status)}
                      </StatusBadge>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">สร้างเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={invitation.issuedAt.toISOString()}>{formatFamilyManagementDate(invitation.issuedAt)}</time></dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">หมดอายุ</dt>
                        <dd className="mt-1 text-text"><time dateTime={invitation.expiresAt.toISOString()}>{formatFamilyManagementDate(invitation.expiresAt)}</time></dd>
                      </div>
                    </dl>
                    <SavedRecordActions separated={invitation.status === "PENDING"}>
                      <ShowPendingInvitationQr invitation={invitation} />
                      <RevokePendingInvitation invitation={invitation} />
                    </SavedRecordActions>
                  </SavedRecordCard>
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
        <h2 className="text-xl font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="patient-relationships-heading" tabIndex={-1}>ผู้ดูแลที่เชื่อมไว้</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          รายการนี้แสดงผู้ดูแลที่เชื่อมต่อและสถานะการเชื่อมต่อ การเชื่อมต่อไม่ได้เปิดสิทธิ์ให้ดูข้อมูลสุขภาพทั้งหมดโดยอัตโนมัติ
        </p>
        <Panel className="mt-4">
          {overview.relationships.length === 0 ? (
            <p className="text-sm leading-6 text-text-muted">ยังไม่มีผู้ดูแลที่ตอบรับคำเชิญและเชื่อมต่อแล้ว</p>
          ) : (
            <ul className="space-y-3">
              {overview.relationships.map((relationship) => (
                <li className="min-w-0" key={relationship.relationshipId}>
                  <SavedRecordCard>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="break-words font-semibold text-text">{formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ดูแล")}</h3>
                      <StatusBadge variant={caregiverRelationshipStatusVariant(relationship.status)}>
                        {caregiverRelationshipStatusLabel(relationship.status)}
                      </StatusBadge>
                    </div>
                    {relationship.participant.nameIsSelfAsserted ? (
                      <p className="mt-2 text-sm text-text-muted">ชื่อที่ผู้ดูแลแจ้งเอง</p>
                    ) : null}
                    <RelationshipLabelText relationship={relationship} />
                    <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">เริ่มเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.activatedAt.toISOString()}>{formatFamilyManagementDate(relationship.activatedAt)}</time></dd>
                      </div>
                      {relationship.revokedAt ? <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">ยุติการเชื่อมต่อเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.revokedAt.toISOString()}>{formatFamilyManagementDate(relationship.revokedAt)}</time></dd>
                      </div> : null}
                      {relationship.withdrawnAt ? <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">ผู้ดูแลหยุดเชื่อมต่อเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.withdrawnAt.toISOString()}>{formatFamilyManagementDate(relationship.withdrawnAt)}</time></dd>
                      </div> : null}
                    </dl>
                    <SavedRecordActions separated={relationship.status === "ACTIVE"}>
                      <EditRelationshipLabel relationship={relationship} />
                      <RevokeRelationship relationship={relationship} />
                    </SavedRecordActions>
                  </SavedRecordCard>
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
            <ul className="mt-3 space-y-3">
              {overview.invitations.map((invitation) => (
                <li className="min-w-0" key={invitation.invitationId}>
                  <SavedRecordCard>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h4 className="break-words font-semibold text-text">{formatFamilyParticipantName(invitation.participant, "ไม่ระบุชื่อผู้ป่วย")}</h4>
                      <StatusBadge variant={caregiverInvitationStatusVariant(invitation.status)}>
                        {caregiverInvitationStatusLabel(invitation.status)}
                      </StatusBadge>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">สร้างเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={invitation.issuedAt.toISOString()}>{formatFamilyManagementDate(invitation.issuedAt)}</time></dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">หมดอายุ</dt>
                        <dd className="mt-1 text-text"><time dateTime={invitation.expiresAt.toISOString()}>{formatFamilyManagementDate(invitation.expiresAt)}</time></dd>
                      </div>
                    </dl>
                    {invitation.status === "PENDING" ? (
                      <p className="mt-3 text-sm leading-6 text-text-muted">
                        เปิดลิงก์คำเชิญที่ได้รับเพื่ออ่านรายละเอียดและตอบรับหรือปฏิเสธ
                      </p>
                    ) : null}
                  </SavedRecordCard>
                </li>
              ))}
            </ul>
          )}
          {overview.nextInvitationsCursor ? (
            <PaginationLink href={`/app/family?caregiverInvitationsCursor=${encodeURIComponent(overview.nextInvitationsCursor)}`} />
          ) : null}
        </Panel>

        <Panel className="mt-4">
          <h3 className="text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="caregiver-relationships-heading" tabIndex={-1}>ผู้ป่วยที่คุณดูแล</h3>
          {overview.relationships.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีผู้ป่วยที่คุณตอบรับคำเชิญให้ดูแล</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {overview.relationships.map((relationship) => (
                <li className="min-w-0" key={relationship.relationshipId}>
                  <SavedRecordCard>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h4 className="break-words font-semibold text-text">{formatFamilyParticipantName(relationship.participant, "ไม่ระบุชื่อผู้ป่วย")}</h4>
                      <StatusBadge variant={caregiverRelationshipStatusVariant(relationship.status)}>
                        {caregiverRelationshipStatusLabel(relationship.status)}
                      </StatusBadge>
                    </div>
                    {relationship.participant.nameIsSelfAsserted ? (
                      <p className="mt-2 text-sm text-text-muted">ชื่อที่ผู้ป่วยแจ้งเอง</p>
                    ) : null}
                    <RelationshipLabelText relationship={relationship} />
                    <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">เริ่มเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.activatedAt.toISOString()}>{formatFamilyManagementDate(relationship.activatedAt)}</time></dd>
                      </div>
                      {relationship.revokedAt ? <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">ยุติการเชื่อมต่อเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.revokedAt.toISOString()}>{formatFamilyManagementDate(relationship.revokedAt)}</time></dd>
                      </div> : null}
                      {relationship.withdrawnAt ? <div className="min-w-0">
                        <dt className="text-sm font-semibold text-text-muted">ผู้ดูแลหยุดเชื่อมต่อเมื่อ</dt>
                        <dd className="mt-1 text-text"><time dateTime={relationship.withdrawnAt.toISOString()}>{formatFamilyManagementDate(relationship.withdrawnAt)}</time></dd>
                      </div> : null}
                    </dl>
                    <SavedRecordActions separated={relationship.status === "ACTIVE"}>
                      {relationship.status === "ACTIVE" ? <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong px-4 text-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={familyHealthSummaryHref(relationship.relationshipId)} prefetch={false}>
                        ดูสรุปสุขภาพที่ได้รับแชร์
                      </Link> : null}
                      <WithdrawCaregiverRelationship relationship={relationship} />
                    </SavedRecordActions>
                  </SavedRecordCard>
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

const NO_SHARING_OPTIONS: CaregiverSharingOptions = { hospitals: [], resources: [] };

export function FamilyManagementWorkspace({
  overview,
  sharingOptions = NO_SHARING_OPTIONS,
}: {
  overview: FamilyManagementOverview;
  sharingOptions?: CaregiverSharingOptions;
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        description="จัดการคำเชิญ ผู้ดูแล และผู้ป่วยที่เชื่อมต่อกับบัญชีของคุณ การเชื่อมต่อไม่เปิดสิทธิ์ดูข้อมูลสุขภาพโดยอัตโนมัติ"
        title="ครอบครัวและผู้ดูแล"
      />
      <Alert className="mt-6" variant="info">
        <p className="font-semibold">การเชื่อมต่อยังไม่เปิดสิทธิ์ดูข้อมูลผู้ป่วย</p>
        <p className="mt-1">
          การเชื่อมต่อเพียงอย่างเดียวไม่ทำให้ผู้ดูแลดูโปรไฟล์ HN นัดหมาย หรือข้อมูลการดูแลได้
          {" "}ผู้ดูแลจะเห็นเฉพาะข้อมูลที่คุณเลือกแชร์เป็นรายการและผู้ดูแลยอมรับแล้ว คุณยกเลิกสิทธิ์แต่ละรายการได้ทุกเมื่อ
        </p>
      </Alert>
      {overview.patient ? <PatientPerspective overview={overview.patient} sharingOptions={sharingOptions} /> : null}
      <CaregiverPerspective overview={overview.caregiver} />
    </div>
  );
}
