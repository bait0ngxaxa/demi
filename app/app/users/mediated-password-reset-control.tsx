"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

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

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

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
  const [handoffUrl, setHandoffUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copyState, setCopyState] = useState("");
  const [busy, setBusy] = useState(false);
  const navigatedHandoffUrls = useRef(new Set<string>());
  const issuedMode = result?.status === "ISSUED" ? result.mode : null;

  useEffect(() => {
    if (!open || issuedMode !== "ONLINE" || !handoffUrl) return;
    let active = true;
    void QRCode.toDataURL(handoffUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
  }, [handoffUrl, issuedMode, open]);

  function openDialog(event: React.MouseEvent<HTMLButtonElement>): void {
    event.currentTarget.focus({ preventScroll: true });
    setOpen(true);
  }

  function closeDialog(): void {
    if (busy) return;
    setOpen(false);
    setResult(null);
    setHandoffUrl("");
    setQrDataUrl("");
    setCopyState("");
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
      } else if (response.status === "ISSUED") {
        setHandoffUrl(response.handoffUrl);
      }
    } catch {
      setResult({ status: "ERROR", message: "ระบบไม่พร้อมออกลิงก์ กรุณาลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(handoffUrl);
      setCopyState("คัดลอกลิงก์แล้ว");
    } catch {
      setCopyState("คัดลอกไม่ได้ กรุณาเลือกและคัดลอกลิงก์นี้");
    }
  }

  async function shareLink(): Promise<void> {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: "ลิงก์รีเซ็ตรหัสผ่าน DEMI", text: "ลิงก์ใช้ครั้งเดียวและหมดอายุตามเวลาที่แสดง", url: handoffUrl });
      setCopyState("ส่งลิงก์แล้ว");
    } catch {
      setCopyState("ยังไม่ได้ส่งลิงก์");
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
          className="[max-height:calc(100svh-2*max(1rem,env(safe-area-inset-top,0px),env(safe-area-inset-bottom,0px)))]! [max-width:calc(100dvw-2*max(1rem,env(safe-area-inset-left,0px),env(safe-area-inset-right,0px)))]!"
          description={<p className="wrap-anywhere">{props.targetName}{props.hospitalName ? ` · ${props.hospitalName}` : ""}</p>}
          dismissible={!busy}
          focusOnStepChange
          footer={issuedMode === "IN_PERSON" ? null : (
            <div className="flex flex-wrap justify-end gap-2">
              {issuedMode === "ONLINE" ? (
                <Button onClick={closeDialog} size="compact" variant="secondary">เสร็จสิ้น</Button>
              ) : (
                <>
                  <Button disabled={busy} onClick={closeDialog} ref={closeButtonRef} size="compact" variant="secondary">ปิด</Button>
                  <Button disabled={busy} form={formId} size="compact" type="submit">{busy ? "กำลังออกลิงก์…" : "ออกลิงก์รีเซ็ต"}</Button>
                </>
              )}
            </div>
          )}
          initialFocusRef={closeButtonRef}
          onRequestClose={closeDialog}
          size="compact"
          stepKey={issuedMode ?? "confirm"}
          title={title}
        >
          {result?.status === "ISSUED" && result.mode === "IN_PERSON" ? (
            <div className="space-y-2" role="status">
              <p className="font-semibold">ออกจากระบบบัญชีของคุณแล้ว กำลังเปิดหน้าตั้งรหัสผ่าน…</p>
              <p className="text-sm leading-6 text-text-muted">ส่งอุปกรณ์ให้เจ้าของบัญชียืนยันบัญชีด้วย{targetConfirmationLabel}และตั้งรหัสผ่านด้วยตนเองภายในเวลาที่กำหนด</p>
            </div>
          ) : result?.status === "ISSUED" ? (
            <div className="space-y-4" role="status">
              <p className="font-semibold">ออกลิงก์แล้ว หมดอายุ {formatThaiDate(result.expiresAt)}</p>
              <p className="text-sm leading-6 text-text-muted">ลิงก์ใช้ได้ครั้งเดียว ให้ส่งตรงถึงเจ้าของบัญชีเพื่อยืนยันด้วย{targetConfirmationLabel}และตั้งรหัสผ่านใหม่ ห้ามส่งต่อให้ผู้อื่น</p>
              <div className="space-y-3 rounded-lg border border-border p-4">
                {qrDataUrl ? <Image alt="QR code สำหรับเปิดลิงก์รีเซ็ตรหัสผ่าน" className="mx-auto h-auto w-60 max-w-full" height={240} src={qrDataUrl} unoptimized width={240} /> : null}
                <label className="grid grid-cols-1 gap-1 text-sm font-medium">
                  ลิงก์สำหรับส่งให้เจ้าของบัญชี
                  <input className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm" readOnly value={handoffUrl} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => void copyLink()} type="button">คัดลอกลิงก์</button>
                  <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => void shareLink()} type="button">แชร์ลิงก์</button>
                </div>
                {copyState ? <p className="text-sm text-text-muted" role="status">{copyState}</p> : null}
              </div>
            </div>
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
