"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function formatDate(date: string | Date | null): string {
  if (!date) {
    return "-";
  }

  const parsedDate = new Date(date);
  if (!Number.isFinite(parsedDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

/** Displays a one-time credential URL supplied by the server; credentials remain in component memory. */
type ActivationPresentationProps = {
  activationUrl: string;
  expiresAt: string | null;
  title: string;
  maskedName?: string;
  onFinish?: () => void;
  onAssisted?: () => void;
};

export function ActivationPresentation(props: ActivationPresentationProps): React.JSX.Element {
  return <ActivationPresentationContent key={props.activationUrl} {...props} />;
}

function ActivationPresentationContent({
  activationUrl,
  expiresAt,
  title,
  maskedName,
  onFinish,
  onAssisted,
}: ActivationPresentationProps): React.JSX.Element {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const allowUnloadRef = useRef(false);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(activationUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
          setQrFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl(null);
          setQrFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [activationUrl]);

  useEffect(() => {
    if (finished) return;

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      if (allowUnloadRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    function confirmInternalNavigation(event: MouseEvent): void {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(target instanceof Element)
      ) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.protocol !== "http:" && destination.protocol !== "https:") return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : destination.href,
      );
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
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  function continueNavigation(): void {
    if (!pendingNavigation) {
      return;
    }

    const destination = new URL(pendingNavigation, window.location.href);
    setPendingNavigation(null);

    if (destination.origin === window.location.origin) {
      router.push(`${destination.pathname}${destination.search}${destination.hash}`);
      return;
    }

    allowUnloadRef.current = true;
    window.location.assign(destination.href);
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
    <>
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
              <span className="text-center text-xs text-muted" role="status">
                {qrFailed ? "สร้างคิวอาร์โค้ดไม่ได้ กรุณาคัดลอกลิงก์แทน" : "กำลังสร้างคิวอาร์โค้ด..."}
              </span>
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
            {copyFailed ? (
              <p className="mt-2 text-sm text-danger" role="status">
                คัดลอกไม่สำเร็จ กรุณาเลือกและคัดลอกลิงก์ด้วยตนเอง
              </p>
            ) : null}
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
      <ConfirmDialog
        cancelLabel="อยู่หน้านี้"
        confirmLabel="ออกจากหน้า"
        confirmVariant="destructive"
        description="ลิงก์เปิดใช้งานที่ยังไม่ได้ส่งมอบจะแสดงซ้ำไม่ได้"
        onCancel={() => setPendingNavigation(null)}
        onConfirm={continueNavigation}
        open={pendingNavigation !== null}
        title="ออกจากหน้านี้หรือไม่?"
      />
    </>
  );
}
