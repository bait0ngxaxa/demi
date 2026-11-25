"use client";

import { useId, useRef, useState } from "react";

import { credentialHandoffDialogClassName, useCredentialHandoffStep } from "@/components/credential-handoff/credential-handoff-dialog";
import { Button, buttonClassName } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type {
  MediatedPasswordResetIssueInput,
  MediatedPasswordResetMode,
  MediatedPasswordResetTargetKind,
} from "@/modules/account-security/schemas/account-security-schemas";
import { issueMediatedPasswordResetAction, type MediatedPasswordResetIssueActionResult } from "@/modules/account-security/transport/server-actions";

type Props = {
  targetName: string;
  eligibility: "OWNER_ELIGIBLE" | "ADMIN_ALLOWED" | "ADMIN_REQUIRED";
  locked?: boolean;
} & (
  | { targetKind: "platform_admin"; hospitalId: null; hospitalName: null; relationshipId: null; targetUserId: string }
  | { targetKind: "caregiver"; hospitalId: string; hospitalName: string; relationshipId: null; targetUserId: string }
  | { targetKind: Exclude<MediatedPasswordResetTargetKind, "platform_admin" | "caregiver">; hospitalId: string; hospitalName: string; relationshipId: string; targetUserId?: never }
);

export function MediatedPasswordResetControl(props: Props): React.JSX.Element {
  const targetConfirmationLabel = props.targetKind === "platform_admin"
    ? "รหัสเข้าสู่ระบบของผู้ดูแลระบบ DEMI ที่ลงทะเบียนไว้"
    : "เลขบัตรประชาชนของเจ้าของบัญชี";
  const title = props.locked ? "กู้คืนบัญชีและตั้งรหัสผ่านใหม่" : "รีเซ็ตรหัสผ่าน";
  const formId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MediatedPasswordResetMode>("IN_PERSON");
  const [result, setResult] = useState<MediatedPasswordResetIssueActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const navigatedHandoffUrls = useRef(new Set<string>());
  const issuedMode = result?.status === "ISSUED" ? result.mode : null;
  const online = open && result?.status === "ISSUED" && result.mode === "ONLINE" ? result : null;
  const handoffStep = useCredentialHandoffStep({
    handoff: online
      ? {
          url: online.handoffUrl,
          expiresAt: online.expiresAt,
          oneTimeNotice: `ลิงก์ใช้ได้ครั้งเดียว ให้ส่งตรงถึงเจ้าของบัญชีเพื่อยืนยันด้วย${targetConfirmationLabel}และตั้งรหัสผ่านใหม่ ห้ามส่งต่อให้ผู้อื่น`,
          qr: { alt: "QR Code สำหรับเปิดลิงก์รีเซ็ตรหัสผ่าน", fileName: "demi-password-reset-qr.png", shareTitle: "QR Code สำหรับรีเซ็ตรหัสผ่าน DEMI" },
          link: { label: "ลิงก์สำหรับส่งให้เจ้าของบัญชี", shareTitle: "ลิงก์รีเซ็ตรหัสผ่าน DEMI" },
        }
      : null,
    onHandedOver: closeDialog,
    onDiscard: closeDialog,
  });

  function openDialog(event: React.MouseEvent<HTMLButtonElement>): void {
    event.currentTarget.focus({ preventScroll: true });
    setOpen(true);
  }

  function closeDialog(): void {
    if (busy) return;
    setOpen(false);
    setResult(null);
  }

  async function issueReset(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const input: MediatedPasswordResetIssueInput = props.targetKind === "platform_admin"
      ? { targetKind: "platform_admin", targetUserId: props.targetUserId, hospitalId: null, relationshipId: null, mode }
      : props.targetKind === "caregiver"
        ? { targetKind: "caregiver", targetUserId: props.targetUserId, hospitalId: props.hospitalId, relationshipId: null, mode }
        : { targetKind: props.targetKind, hospitalId: props.hospitalId, relationshipId: props.relationshipId, mode };
    try {
      const response = await issueMediatedPasswordResetAction(input);
      setResult(response);
      if (response.status === "ISSUED" && response.mode === "IN_PERSON") {
        // The issuer session is already closed: open the owner's reset page once, without exposing the link.
        if (!navigatedHandoffUrls.current.has(response.handoffUrl)) {
          navigatedHandoffUrls.current.add(response.handoffUrl);
          window.location.replace(response.handoffUrl);
        }
      }
    } catch {
      setResult({ status: "ERROR", message: "ระบบไม่พร้อมออกลิงก์ กรุณาลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  if (props.eligibility === "ADMIN_REQUIRED") {
    return <p className="text-sm leading-6 text-text-muted">ต้องให้ผู้ดูแลระบบ DEMI ดำเนินการ</p>;
  }

  return (
    <>
      <button className={buttonClassName({ variant: "primary", size: "compact" })} onClick={openDialog} type="button">
        {title}
      </button>
      {open ? (
        <ModalDialog
          className={credentialHandoffDialogClassName}
          description={<p className="wrap-anywhere">{props.targetName}{props.hospitalName ? ` · ${props.hospitalName}` : ""}</p>}
          dismissible={handoffStep ? handoffStep.dismissible : !busy}
          focusOnStepChange={handoffStep ? handoffStep.focusOnStepChange : true}
          footer={handoffStep ? handoffStep.footer : issuedMode === "IN_PERSON" ? null : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={busy} onClick={closeDialog} ref={closeButtonRef} size="compact" variant="secondary">ปิด</Button>
              <Button disabled={busy} form={formId} size="compact" type="submit">{busy ? "กำลังออกลิงก์…" : "ออกลิงก์รีเซ็ต"}</Button>
            </div>
          )}
          initialFocusRef={closeButtonRef}
          onRequestClose={handoffStep ? handoffStep.requestClose : closeDialog}
          size="compact"
          stepKey={handoffStep ? handoffStep.stepKey : issuedMode ?? "confirm"}
          title={title}
        >
          {result?.status === "ISSUED" && result.mode === "IN_PERSON" ? (
            <div className="space-y-2" role="status">
              <p className="font-semibold">ออกจากระบบบัญชีของคุณแล้ว กำลังเปิดหน้าตั้งรหัสผ่าน…</p>
              <p className="text-sm leading-6 text-text-muted">ส่งอุปกรณ์ให้เจ้าของบัญชียืนยันบัญชีด้วย{targetConfirmationLabel}และตั้งรหัสผ่านด้วยตนเองภายในเวลาที่กำหนด</p>
            </div>
          ) : handoffStep ? (
            handoffStep.body
          ) : (
            <form className="space-y-5" id={formId} onSubmit={(event) => void issueReset(event)}>
              {props.targetKind === "platform_admin" ? (
                <p className="text-sm leading-6 text-text-muted">ผู้ดูแลระบบ DEMI ที่ออกลิงก์ต้องตรวจสอบตัวตนของผู้ดูแลระบบ DEMI ผู้รับอย่างเป็นอิสระก่อน การกรอกรหัสเข้าสู่ระบบและการได้รับลิงก์ไม่ใช้แทนการตรวจสอบดังกล่าว</p>
              ) : (
                <p className="text-sm leading-6 text-text-muted">ตรวจสอบตัวตนเจ้าของบัญชีก่อนออกลิงก์ หากโทรยืนยัน ให้โทรเบอร์ในเวชระเบียนของโรงพยาบาลเท่านั้น</p>
              )}

              <fieldset className="min-w-0 space-y-2" disabled={busy}>
                <legend className="text-sm font-semibold">เลือกรูปแบบส่งมอบ</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <input checked={mode === "IN_PERSON"} name="mode" onChange={() => setMode("IN_PERSON")} type="radio" value="IN_PERSON" />
                  ต่อหน้าบนเครื่องนี้ · ใช้ได้ 15 นาที · ระบบจะออกจากบัญชีของคุณก่อนส่งต่ออุปกรณ์
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <input checked={mode === "ONLINE"} name="mode" onChange={() => setMode("ONLINE")} type="radio" value="ONLINE" />
                  ส่งลิงก์ออนไลน์ · ใช้ได้ 24 ชั่วโมง
                </label>
              </fieldset>

              {result?.status === "ERROR" ? <p className="text-sm text-danger" role="alert">{result.message}</p> : null}
            </form>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
