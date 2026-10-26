"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

import { buttonClassName } from "@/components/ui/button";
import type {
  CredentialRecoveryVerificationMethod,
  MediatedPasswordResetIssueInput,
  MediatedPasswordResetMode,
  MediatedPasswordResetTargetKind,
} from "@/modules/account-security/schemas/account-security-schemas";
import { issueMediatedPasswordResetAction, type MediatedPasswordResetIssueActionResult } from "@/modules/account-security/transport/server-actions";

const VERIFICATION_METHODS: readonly { value: CredentialRecoveryVerificationMethod; label: string }[] = [
  { value: "IN_PERSON_ID_CARD", label: "ตรวจบัตรประชาชนต่อหน้า" },
  { value: "VIDEO_CALL_FACE_AND_ID_CARD", label: "วิดีโอคอล ตรวจใบหน้าและบัตรประชาชน" },
  { value: "CALLBACK_PHONE_ON_HOSPITAL_RECORD", label: "โทรกลับหมายเลขในเวชระเบียนของโรงพยาบาล" },
];

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
    ? "ตัวระบุเข้าสู่ระบบ ADMIN ที่ลงทะเบียนไว้"
    : "เลขบัตรประชาชนของเจ้าของบัญชี";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<MediatedPasswordResetMode>("IN_PERSON");
  const [verificationMethod, setVerificationMethod] = useState<CredentialRecoveryVerificationMethod | "">("");
  const [result, setResult] = useState<MediatedPasswordResetIssueActionResult | null>(null);
  const [handoffUrl, setHandoffUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copyState, setCopyState] = useState("");
  const [busy, setBusy] = useState(false);
  const navigatedHandoffUrls = useRef(new Set<string>());

  useEffect(() => {
    if (!result || result.status !== "ISSUED" || result.mode !== "ONLINE" || !handoffUrl) return;
    void QRCode.toDataURL(handoffUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [handoffUrl, result]);

  function openDialog(): void {
    setResult(null);
    setHandoffUrl("");
    setQrDataUrl("");
    setCopyState("");
    dialogRef.current?.showModal();
  }

  async function issueReset(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!verificationMethod || busy) return;
    setBusy(true);
    const input: MediatedPasswordResetIssueInput = props.targetKind === "platform_admin"
      ? { targetKind: "platform_admin", targetUserId: props.targetUserId, hospitalId: null, relationshipId: null, mode, verificationMethod }
      : props.targetKind === "caregiver"
        ? { targetKind: "caregiver", targetUserId: props.targetUserId, hospitalId: props.hospitalId, relationshipId: null, mode, verificationMethod }
        : { targetKind: props.targetKind, hospitalId: props.hospitalId, relationshipId: props.relationshipId, mode, verificationMethod };
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
    return <p className="text-sm leading-6 text-text-muted">ต้องให้ผู้ดูแลระบบดำเนินการ</p>;
  }

  return (
    <>
      <button className={buttonClassName({ variant: "primary", size: "compact" })} onClick={openDialog} type="button">
        {props.locked ? "คืนบัญชีให้เจ้าของจริง" : "รีเซ็ตรหัสผ่าน / คืนบัญชี"}
      </button>
      <dialog
        aria-labelledby="mediated-reset-title"
        className="w-[min(40rem,calc(100%-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50"
        onClose={() => setResult(null)}
        ref={dialogRef}
      >
        <div className="space-y-5 p-6">
          <div>
            <h3 className="text-xl font-semibold" id="mediated-reset-title">{props.locked ? "คืนบัญชีให้เจ้าของจริง" : "รีเซ็ตรหัสผ่าน / คืนบัญชี"}</h3>
            <p className="mt-1 text-sm text-text-muted">{props.targetName}{props.hospitalName ? ` · ${props.hospitalName}` : ""}</p>
          </div>

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
                {qrDataUrl ? <Image alt="QR code สำหรับเปิดลิงก์รีเซ็ตรหัสผ่าน" className="mx-auto h-60 w-60" height={240} src={qrDataUrl} unoptimized width={240} /> : null}
                <label className="grid gap-1 text-sm font-medium">
                  ลิงก์สำหรับส่งให้เจ้าของบัญชี
                  <input className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" readOnly value={handoffUrl} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => void copyLink()} type="button">คัดลอกลิงก์</button>
                  <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => void shareLink()} type="button">แชร์ลิงก์</button>
                </div>
                {copyState ? <p className="text-sm text-text-muted" role="status">{copyState}</p> : null}
              </div>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={(event) => void issueReset(event)}>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">เลือกวิธีที่ใช้ยืนยันตัวตนแล้ว</legend>
                {VERIFICATION_METHODS.map((method) => (
                  <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm" key={method.value}>
                    <input checked={verificationMethod === method.value} name="verificationMethod" onChange={() => setVerificationMethod(method.value)} required type="radio" value={method.value} />
                    {method.label}
                  </label>
                ))}
                <p className="text-sm leading-6 text-text-muted">หากโทรกลับ ให้ใช้เฉพาะหมายเลขในเวชระเบียนของโรงพยาบาล ห้ามใช้หมายเลขที่ผู้ขอแจ้ง</p>
                {props.targetKind === "platform_admin" ? (
                  <p className="text-sm leading-6 text-text-muted">ผู้ดูแลระบบที่ออกลิงก์ต้องตรวจสอบตัวตนของ ADMIN ผู้รับอย่างเป็นอิสระก่อน การกรอกตัวระบุบัญชีและการได้รับลิงก์ไม่ใช้แทนการตรวจสอบดังกล่าว</p>
                ) : null}
              </fieldset>

              <fieldset className="space-y-2">
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
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => dialogRef.current?.close()} type="button">ปิด</button>
                <button className={buttonClassName({ variant: "primary", size: "compact" })} disabled={!verificationMethod || busy} type="submit">{busy ? "กำลังออกลิงก์…" : "ออกลิงก์รีเซ็ต"}</button>
              </div>
            </form>
          )}

          {result?.status === "ISSUED" && result.mode === "ONLINE" ? (
            <div className="flex justify-end border-t border-border pt-4">
              <button className={buttonClassName({ variant: "secondary", size: "compact" })} onClick={() => dialogRef.current?.close()} type="button">เสร็จสิ้น</button>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
