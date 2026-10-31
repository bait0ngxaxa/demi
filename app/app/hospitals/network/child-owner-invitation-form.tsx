"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { Input } from "@/components/ui/input";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { ActivationPresentation } from "@/components/workforce/activation-presentation";
import {
  initialChildOwnerInvitationActionState,
  type ChildOwnerInvitationActionState,
} from "@/modules/hospital-service-areas/transport/action-state";

type InvitationAction = (previous: ChildOwnerInvitationActionState, formData: FormData) => Promise<ChildOwnerInvitationActionState>;

/** Who invites: a Parent OWNER for its Child (ADR-0018) or platform ADMIN for a Parent Hospital (ADR-0024). */
export type OwnerInvitationAudience = "PARENT_OWNER" | "PLATFORM_ADMIN";

const resultCopy: Record<OwnerInvitationAudience, { heldForReset: string; awaitingAcceptance: string; alreadyIssued: string }> = {
  PARENT_OWNER: {
    heldForReset: "รอ platform ADMIN ยืนยันตัวตน บัญชีนี้จะตอบรับคำเชิญหรือเข้าสู่ระบบไม่ได้จนกว่าจะรีเซ็ตรหัสผ่านผ่านการตรวจสอบตัวตน",
    awaitingAcceptance: "ผู้ดูแลมีบัญชี DEMI อยู่แล้ว จะเห็นคำเชิญที่หน้าหลักเมื่อเข้าสู่ระบบ และต้องตอบรับด้วยตนเองก่อนหน่วยบริการจะเปิดใช้งาน",
    alreadyIssued: "ลิงก์เดิมแสดงได้ครั้งเดียว หากยังไม่ได้ส่งมอบ ให้ออกลิงก์ใหม่จากรายการลูกข่าย",
  },
  PLATFORM_ADMIN: {
    heldForReset: "บัญชีนี้ต้องคืนบัญชีโดยผู้ดูแลระบบก่อน ยืนยันตัวตนและรีเซ็ตรหัสผ่านด้วยเครื่องมือคืนบัญชี แล้วผู้ถูกเชิญจึงตอบรับคำเชิญได้ด้วยตนเอง",
    awaitingAcceptance: "ผู้ดูแลมีบัญชี DEMI อยู่แล้ว จะเห็นคำเชิญที่หน้าหลักเมื่อเข้าสู่ระบบ และต้องตอบรับด้วยตนเองก่อนโรงพยาบาลจะเปิดใช้งาน",
    alreadyIssued: "ลิงก์เดิมแสดงได้ครั้งเดียว หากยังไม่ได้ส่งมอบ ให้ออกลิงก์ใหม่จากหน้านี้",
  },
};

/** National ID, names and delivery mode of a Child OWNER invitee (ADR-0018 O-D6). */
export function ChildOwnerInviteeFields({ idPrefix }: { idPrefix: string }): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <label className="text-sm font-semibold text-text" htmlFor={`${idPrefix}-national-id`}>เลขบัตรประชาชนผู้ดูแล</label>
        <Input
          autoComplete="off"
          className="mt-2"
          id={`${idPrefix}-national-id`}
          inputMode="numeric"
          maxLength={13}
          name="nationalId"
          pattern="[0-9]{13}"
          required
        />
      </div>
      <div className="min-w-0">
        <label className="text-sm font-semibold text-text" htmlFor={`${idPrefix}-given-name`}>ชื่อ</label>
        <Input className="mt-2" id={`${idPrefix}-given-name`} maxLength={120} name="givenName" required />
      </div>
      <div className="min-w-0">
        <label className="text-sm font-semibold text-text" htmlFor={`${idPrefix}-family-name`}>นามสกุล</label>
        <Input className="mt-2" id={`${idPrefix}-family-name`} maxLength={120} name="familyName" required />
      </div>
      <ChildOwnerDeliveryModeField idPrefix={idPrefix} />
    </div>
  );
}

export function ChildOwnerDeliveryModeField({ idPrefix }: { idPrefix: string }): React.JSX.Element {
  return (
    <fieldset className="min-w-0 sm:col-span-2">
      <legend className="text-sm font-semibold text-text">วิธีส่งมอบลิงก์</legend>
      <div className="mt-2 flex flex-col gap-2 text-sm text-text sm:flex-row sm:gap-6">
        <label className="flex min-h-11 items-center gap-2" htmlFor={`${idPrefix}-mode-remote`}>
          <input defaultChecked id={`${idPrefix}-mode-remote`} name="mode" type="radio" value="REMOTE" />
          ส่งลิงก์หรือคิวอาร์โค้ด (ใช้ได้ 24 ชั่วโมง)
        </label>
        <label className="flex min-h-11 items-center gap-2" htmlFor={`${idPrefix}-mode-assisted`}>
          <input id={`${idPrefix}-mode-assisted`} name="mode" type="radio" value="ASSISTED" />
          เปิดใช้งานต่อหน้าบนเครื่องนี้ (ใช้ได้ 15 นาที)
        </label>
      </div>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        หากผู้ดูแลมีบัญชี DEMI ที่ใช้งานอยู่แล้ว ระบบจะไม่ออกลิงก์ ผู้ดูแลต้องเข้าสู่ระบบและตอบรับคำเชิญด้วยตนเอง
      </p>
    </fieldset>
  );
}

export function InvitationResult({
  audience = "PARENT_OWNER",
  state,
}: {
  audience?: OwnerInvitationAudience;
  state: Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }>;
}): React.JSX.Element {
  const invitation = state.invitation;
  const copy = resultCopy[audience];
  if (invitation.kind === "ADMIN_RESET_REQUIRED") {
    return (
      <Alert className="mt-4" variant="warning">
        <p className="font-semibold">{state.message}</p>
        <p className="mt-1">{copy.heldForReset}</p>
      </Alert>
    );
  }
  if (invitation.kind === "AWAITING_ACCEPTANCE") {
    return (
      <Alert className="mt-4" variant="success">
        <p className="font-semibold">{state.message}</p>
        <p className="mt-1">{copy.awaitingAcceptance}</p>
      </Alert>
    );
  }
  if (invitation.kind === "ALREADY_ISSUED") {
    return (
      <Alert className="mt-4" variant="info">
        <p className="font-semibold">คำขอนี้ถูกบันทึกไปแล้ว</p>
        <p className="mt-1">{copy.alreadyIssued}</p>
      </Alert>
    );
  }
  return (
    <div className="mt-4">
      <ActivationPresentation
        activationUrl={invitation.activationUrl}
        expiresAt={invitation.activationExpiresAt}
        title={state.message}
      />
      {invitation.activationMode === "ASSISTED" ? (
        <Button
          className="mt-3"
          onClick={() => window.location.assign(invitation.activationUrl)}
          size="compact"
          type="button"
        >
          เริ่มเปิดใช้งานบนเครื่องนี้
        </Button>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-text-muted">ลิงก์นี้แสดงเพียงครั้งเดียว โปรดคัดลอกหรือให้สแกนก่อนออกจากหน้านี้</p>
    </div>
  );
}

/**
 * A Child OWNER invitation mutation whose success may carry a one-time activation link (create Child, change invitee,
 * replacement OWNER, new link). The server re-authorizes every request; the list refreshes after success.
 */
export function ChildOwnerInvitationForm({
  action,
  audience = "PARENT_OWNER",
  children,
  className,
  confirmation,
  hidden,
  idempotent = false,
  onSuccess,
  submitLabel,
  submitVariant = "secondary",
}: {
  action: InvitationAction;
  audience?: OwnerInvitationAudience;
  children?: ReactNode;
  className?: string;
  /** Asks in a dialog before submitting (never `window.confirm`). */
  confirmation?: { title: string; description: string; confirmLabel: string; destructive?: boolean };
  hidden: Record<string, string>;
  /** The submission carries a nonce the server deduplicates, so an unconfirmed request may be resent. */
  idempotent?: boolean;
  /** Lifts the one-time result to a parent that stays mounted when this form disappears after the refresh. */
  onSuccess?: (state: Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }>) => void;
  submitLabel: string;
  submitVariant?: ButtonVariant;
}): React.JSX.Element {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [state, dispatch, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState(action, initialChildOwnerInvitationActionState);
  const handled = useRef<ChildOwnerInvitationActionState | null>(null);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.status === "SUCCESS") {
      notify.success("บันทึกคำเชิญผู้ดูแลแล้ว");
      container.current?.querySelector("form")?.reset();
      onSuccess?.(state);
      router.refresh();
    }
  }, [onSuccess, router, state]);

  const fields = (
    <>
      {Object.entries(hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      {children}
      <Button
        className={children ? "mt-4" : undefined}
        disabled={pending || unknownOutcome}
        loading={pending}
        size="compact"
        type="submit"
        variant={submitVariant}
      >
        {pending ? "กำลังบันทึก..." : submitLabel}
      </Button>
    </>
  );

  return (
    <div className={className} ref={container}>
      {confirmation ? (
        <ConfirmableActionForm
          action={dispatch}
          confirmation={{
            title: confirmation.title,
            description: confirmation.description,
            confirmLabel: confirmation.confirmLabel,
            confirmVariant: confirmation.destructive ? "destructive" : "default",
          }}
          outcome={state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : unknownOutcome ? "unknown" : "idle"}
          pending={pending}
          resultKey={state}
        >
          {fields}
        </ConfirmableActionForm>
      ) : (
        <form action={dispatch}>{fields}</form>
      )}
      {state.status === "SUCCESS" && !onSuccess ? <InvitationResult audience={audience} state={state} /> : null}
      {state.status === "ERROR" ? (
        <Alert className="mt-3" role="alert" variant={state.code === "CONFLICT" || state.code === "NOT_FOUND" ? "warning" : "danger"}>
          {state.message}
        </Alert>
      ) : null}
      <UnknownOutcomeAlert
        active={unknownOutcome}
        className="mt-3"
        recovery={idempotent ? { kind: "resend", onResend: resendUnconfirmed, resending: pending } : { kind: "reload" }}
      />
    </div>
  );
}
