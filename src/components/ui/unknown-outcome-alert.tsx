"use client";

import { useEffect } from "react";

import { Alert } from "./alert";
import { Button } from "./button";

/**
 * How a workflow lets the user find out whether an unconfirmed request was saved.
 * - `resend`: the server deduplicates the request identity (submission nonce, expected
 *   version, or a natural key), so re-sending the exact same payload either returns the
 *   saved result or reports it already exists. A reload would discard that identity, so the
 *   page warns before unloading.
 * - `reload`: an update or terminal transition whose current persisted state is shown on the
 *   page; reloading reads that state, it does not prove which request changed it.
 * - `verify`: the page queries current state with an in-memory identifier without replaying
 *   the mutation, so it warns before unloading while that identifier is needed.
 * - `review`: a create without server-side deduplication; the user checks the persisted list
 *   before deciding to send a new request.
 * - `note`: no in-page verification exists; the note says how to check.
 */
export type UnknownOutcomeRecovery =
  | { kind: "resend"; onResend: () => void; resending: boolean }
  | { kind: "reload"; message?: string; label?: string }
  | { kind: "verify"; label: string; message: string; onVerify: () => void; verifying: boolean }
  | { kind: "review"; label: string }
  | { kind: "note"; message?: string; note: string };

const unknownOutcomeHeading = "ยังยืนยันผลรายการนี้ไม่ได้";
const resendDetails = "ระบบจะส่งคำขอและข้อมูลเดิมอีกครั้งเพื่อค้นหาผลที่ทำไว้แล้ว โดยไม่สร้างรายการซ้ำ";
const reviewMessage =
  "กรุณาตรวจสอบรายการล่าสุดก่อนทำรายการใหม่ เพื่อป้องกันรายการซ้ำ";

export function UnknownOutcomeAlert({
  active,
  className,
  recovery,
}: {
  active: boolean;
  className?: string;
  recovery: UnknownOutcomeRecovery;
}): React.JSX.Element | null {
  const guardsUnload = active && (recovery.kind === "resend" || recovery.kind === "verify");

  useEffect(() => {
    if (!guardsUnload) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [guardsUnload]);

  if (!active) {
    return null;
  }

  if (recovery.kind === "resend") {
    return (
      <Alert
        className={className}
        data-navigation-guard={guardsUnload ? "unknown-outcome" : undefined}
        role="alert"
        variant="warning"
      >
        <p className="font-semibold">{unknownOutcomeHeading}</p>
        <p className="mt-1">กรุณาตรวจสอบผลก่อนทำรายการใหม่</p>
        <details className="mt-2">
          <summary className="cursor-pointer underline underline-offset-4">วิธีตรวจสอบผล</summary>
          <p className="mt-1">{resendDetails}</p>
        </details>
        <Button
          className="mt-3"
          loading={recovery.resending}
          onClick={recovery.onResend}
          size="compact"
          type="button"
          variant="secondary"
        >
          {recovery.resending ? "กำลังตรวจสอบผล..." : "ตรวจสอบผลของรายการ"}
        </Button>
      </Alert>
    );
  }

  if (recovery.kind === "note") {
    return (
      <Alert className={className} role="alert" variant="warning">
        <p className="font-semibold">{recovery.message ?? unknownOutcomeHeading}</p>
        <p className="mt-1">{recovery.note}</p>
      </Alert>
    );
  }

  if (recovery.kind === "verify") {
    return (
      <Alert
        className={className}
        data-navigation-guard={guardsUnload ? "unknown-outcome" : undefined}
        role="alert"
        variant="warning"
      >
        <p className="font-semibold">{unknownOutcomeHeading}</p>
        <p className="mt-1">{recovery.message}</p>
        <Button
          className="mt-3"
          loading={recovery.verifying}
          onClick={recovery.onVerify}
          size="compact"
          type="button"
          variant="secondary"
        >
          {recovery.verifying ? "กำลังตรวจสอบสถานะ..." : recovery.label}
        </Button>
      </Alert>
    );
  }

  return (
    <Alert className={className} role="alert" variant="warning">
      <p className="font-semibold">{unknownOutcomeHeading}</p>
      <p className="mt-1">
        {recovery.kind === "review" ? reviewMessage : recovery.message ?? "ดูข้อมูลล่าสุดก่อนทำรายการใหม่"}
      </p>
      {recovery.kind === "reload" ? (
        <details className="mt-2">
          <summary className="cursor-pointer underline underline-offset-4">ข้อมูลที่ตรวจสอบได้</summary>
          <p className="mt-1">การโหลดจะแสดงสถานะปัจจุบัน แต่ไม่ยืนยันว่าคำขอนี้เป็นผู้เปลี่ยนข้อมูล</p>
        </details>
      ) : null}
      <Button className="mt-3" onClick={() => window.location.reload()} size="compact" type="button" variant="secondary">
        {recovery.kind === "review" ? recovery.label : recovery.label ?? "ดูข้อมูลล่าสุด"}
      </Button>
    </Alert>
  );
}
