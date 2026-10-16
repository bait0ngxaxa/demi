"use client";

import { useEffect } from "react";

import { Alert } from "./alert";
import { Button } from "./button";
import { unknownOutcomeMessage } from "./mutation-action-state";

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

const resendMessage =
  "ระบบยังยืนยันผลการดำเนินการไม่ได้ กรุณากด “ตรวจสอบผลด้วยคำขอเดิม” ระบบจะส่งข้อมูลชุดเดิมอีกครั้งเพื่อยืนยันผล หากบันทึกไปแล้วจะไม่ถูกบันทึกซ้ำ ไม่ควรโหลดหน้าใหม่ก่อนตรวจสอบ";
const reviewMessage =
  "ระบบยังยืนยันไม่ได้ว่าบันทึกแล้วหรือไม่ และคำขอนี้อาจถูกบันทึกซ้ำหากส่งอีกครั้ง กรุณาตรวจสอบรายการล่าสุดก่อนส่งใหม่";
const noteMessage = "ระบบยังยืนยันไม่ได้ว่าบันทึกแล้วหรือไม่";

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
      <Alert className={className} role="alert" variant="warning">
        <p>{resendMessage}</p>
        <Button
          className="mt-3"
          loading={recovery.resending}
          onClick={recovery.onResend}
          size="compact"
          type="button"
          variant="secondary"
        >
          {recovery.resending ? "กำลังตรวจสอบผล..." : "ตรวจสอบผลด้วยคำขอเดิม"}
        </Button>
      </Alert>
    );
  }

  if (recovery.kind === "note") {
    return (
      <Alert className={className} role="alert" variant="warning">
        <p>{recovery.message ?? noteMessage}</p>
        <p className="mt-1">{recovery.note}</p>
      </Alert>
    );
  }

  if (recovery.kind === "verify") {
    return (
      <Alert className={className} role="alert" variant="warning">
        <p>{recovery.message}</p>
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
      <p>
        {recovery.kind === "review"
          ? reviewMessage
          : recovery.message ?? unknownOutcomeMessage}
      </p>
      <Button className="mt-3" onClick={() => window.location.reload()} size="compact" type="button" variant="secondary">
        {recovery.kind === "review" ? recovery.label : recovery.label ?? "โหลดข้อมูลล่าสุด"}
      </Button>
    </Alert>
  );
}
