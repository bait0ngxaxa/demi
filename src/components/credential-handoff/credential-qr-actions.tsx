"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { useCredentialQr } from "./use-credential-qr";

export type CredentialQrActionsProps = {
  url: string;
  alt: string;
  /** The downloaded/shared file name; each flow has its own so files are not confused in a downloads folder. */
  fileName: string;
  shareTitle: string;
  displaySize?: number;
};

/** The QR for a one-time credential link, with save and share-image actions. The saved image is a secret. */
export function CredentialQrActions({
  url,
  alt,
  fileName,
  shareTitle,
  displaySize = 240,
}: CredentialQrActionsProps): React.JSX.Element {
  const qr = useCredentialQr(url, { fileName, displaySize });
  const [sharing, setSharing] = useState(false);
  const [shareFailure, setShareFailure] = useState<string | null>(null);
  const shown = qr.status === "READY" ? qr : null;
  const file = shown && shown.file !== null && shown.file !== "ERROR" ? shown.file : null;
  const fileFailed = qr.status === "ERROR" || shown?.file === "ERROR";

  function downloadQr(event: React.MouseEvent<HTMLButtonElement>): void {
    if (!file) return;
    const link = document.createElement("a");
    link.href = file.dataUrl;
    link.download = fileName;
    link.hidden = true;
    event.currentTarget.after(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  }

  async function shareQr(): Promise<void> {
    if (!file?.shareFile || sharing) return;
    const sharedFor = url;
    setSharing(true);
    setShareFailure(null);
    try {
      await navigator.share({ title: shareTitle, files: [file.shareFile] });
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareFailure(sharedFor);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-3">
      <div aria-busy={qr.status === "LOADING"} className="mx-auto flex aspect-square w-60 max-w-full items-center justify-center rounded-control border border-border bg-surface p-2">
        {shown ? (
          // A local transient data URL: Next image optimization must never receive the secret.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={alt} className="h-full w-full" height={displaySize} src={shown.displayUrl} width={displaySize} />
        ) : (
          <p className="px-3 text-center text-sm leading-6 text-text-muted" role="status">
            {qr.status === "ERROR" ? "สร้าง QR Code ไม่ได้ กรุณาคัดลอกลิงก์แทน" : "กำลังสร้าง QR Code..."}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="gap-2" disabled={!file} loading={!file && !fileFailed} onClick={downloadQr} size="compact" type="button">
          <svg aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 16v4h14v-4" />
          </svg>
          บันทึกรูป QR Code
        </Button>
        {file?.shareFile ? (
          <Button loading={sharing} onClick={() => void shareQr()} size="compact" type="button" variant="secondary">
            แชร์รูป QR Code
          </Button>
        ) : null}
      </div>
      {shown?.file === "ERROR" ? (
        <p className="text-sm text-danger" role="alert">เบราว์เซอร์นี้บันทึกหรือแชร์รูป QR Code ไม่ได้ ให้สแกนจากหน้าจอนี้ หรือใช้ปุ่มคัดลอกลิงก์แทน</p>
      ) : null}
      {shareFailure === url ? (
        <p className="text-sm text-danger" role="alert">แชร์รูป QR Code ไม่สำเร็จ กรุณาบันทึกรูปหรือคัดลอกลิงก์แทน</p>
      ) : null}
      {shown ? (
        <p className="text-sm leading-6 text-text-muted">ส่งให้เจ้าของบัญชีเท่านั้น ห้ามโพสต์ในกลุ่ม และลบรูปเมื่อใช้งานเสร็จ</p>
      ) : null}
    </div>
  );
}
