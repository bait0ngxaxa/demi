"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function formatDate(date: string | Date | null): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Displays a one-time credential URL supplied by the server; credentials remain in component memory. */
export function ActivationPresentation({
  activationUrl,
  expiresAt,
  title,
  maskedName,
  onFinish,
  onAssisted,
}: {
  activationUrl: string;
  expiresAt: string | null;
  title: string;
  maskedName?: string;
  onFinish?: () => void;
  onAssisted?: () => void;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let active = true;

    void QRCode.toDataURL(activationUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [activationUrl]);

  useEffect(() => {
    if (finished) return;

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    function confirmInternalNavigation(event: MouseEvent): void {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm("ลิงก์เปิดใช้งานที่ยังไม่ได้ส่งมอบจะหายไปและแสดงซ้ำไม่ได้ ต้องการออกจากหน้านี้หรือไม่")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmInternalNavigation, true);
    };
  }, [finished]);

  async function copyActivationLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function shareActivationLink(): Promise<void> {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: "ลิงก์เปิดใช้งาน DEMI", url: activationUrl });
      setShared(true);
    } catch {
      setShared(false);
    }
  }

  if (finished) {
    return (
      <Alert variant="success">
        <p className="font-semibold">ส่งมอบลิงก์แล้ว</p>
        <p className="mt-1 text-muted">ลิงก์นี้จะแสดงซ้ำไม่ได้</p>
      </Alert>
    );
  }

  return (
    <Alert variant="info">
      <p className="font-semibold">{title}</p>
      {maskedName ? <p className="mt-1 text-muted">{maskedName}</p> : null}
      <p className="mt-2 font-semibold text-text">ใช้ได้ครั้งเดียว · ห้ามส่งต่อ</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex aspect-square w-64 max-w-full shrink-0 items-center justify-center rounded-control bg-surface p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="คิวอาร์โค้ดสำหรับเปิดใช้งาน DEMI" className="h-full w-full" src={qrDataUrl} />
          ) : (
            <span className="text-center text-xs text-muted">กำลังสร้างคิวอาร์โค้ด...</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">
            ลิงก์เปิดใช้งาน
          </p>
          <p className="mt-2 break-all rounded-control border border-border bg-surface px-3 py-3 text-xs leading-5 text-text-muted">
            {activationUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void copyActivationLink()} size="compact" type="button">
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </Button>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
              <Button onClick={() => void shareActivationLink()} size="compact" type="button" variant="secondary">
                {shared ? "แชร์แล้ว" : "แชร์ลิงก์"}
              </Button>
            ) : null}
            {onAssisted ? (
              <Button onClick={onAssisted} size="compact" type="button" variant="secondary">
                เริ่มเปิดใช้งานบนเครื่องนี้
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">ลิงก์หมดอายุ: {formatDate(expiresAt)}</p>
          <Button
            className="mt-5 w-full sm:w-auto"
            onClick={() => {
              setFinished(true);
              onFinish?.();
            }}
            type="button"
            variant="secondary"
          >
            เสร็จแล้ว
          </Button>
        </div>
      </div>
    </Alert>
  );
}
