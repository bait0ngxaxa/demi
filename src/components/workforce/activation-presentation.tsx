"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** The token travels in the URL fragment, so it never reaches server logs or the Referer header. */
export function buildActivationUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/activate/workforce#${encodeURIComponent(token)}`;
}

function formatDate(date: string | Date | null): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Workforce activation link + QR, shared by staff/OSM provisioning and Child OWNER invitations (ADR-0018). */
export function ActivationPresentation({
  token,
  expiresAt,
  title,
}: {
  token: string;
  expiresAt: string | null;
  title: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const activationUrl = useMemo(() => buildActivationUrl(token), [token]);

  useEffect(() => {
    let active = true;

    void QRCode.toDataURL(activationUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl(null);
        }
      });

    return () => {
      active = false;
    };
  }, [activationUrl]);

  async function copyActivationLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Alert variant="info">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted">ส่งลิงก์นี้ให้ผู้ใช้งานตั้งรหัสผ่านของตนเอง</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-52 w-52 max-w-full shrink-0 items-center justify-center rounded-control bg-surface p-2">
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
          <Button
            className="mt-3"
            onClick={() => void copyActivationLink()}
            size="compact"
            type="button"
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เปิดใช้งาน"}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted">ลิงก์หมดอายุ: {formatDate(expiresAt)}</p>
        </div>
      </div>
    </Alert>
  );
}
