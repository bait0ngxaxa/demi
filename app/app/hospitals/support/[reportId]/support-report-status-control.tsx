"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { updateSupportReportStatusAction } from "@/modules/support/transport/server-actions";

type SupportReportStatus = "NEW" | "ACKNOWLEDGED" | "RESOLVED";

export function SupportReportStatusControl({ reportId, updatedAt, status }: { reportId: string; updatedAt: string; status: SupportReportStatus }): React.JSX.Element | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  // The version the confirmed transition started from; the control stays locked until the refreshed page replaces it.
  const [confirmedFrom, setConfirmedFrom] = useState<{ updatedAt: string; status: SupportReportStatus } | null>(null);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const reportIdRef = useRef(reportId);
  const nextStatus = status === "NEW" ? "ACKNOWLEDGED" : status === "ACKNOWLEDGED" ? "RESOLVED" : null;
  const awaitingRefresh = confirmedFrom !== null && confirmedFrom.updatedAt === updatedAt && confirmedFrom.status === status;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    reportIdRef.current = reportId;
  }, [reportId]);

  useEffect(() => {
    if (confirmedFrom !== null && !awaitingRefresh) inFlightRef.current = false;
  }, [awaitingRefresh, confirmedFrom]);

  if (!nextStatus) return null;
  const targetStatus = nextStatus;

  function update(): void {
    if (inFlightRef.current || awaitingRefresh || unknownOutcome) return;
    inFlightRef.current = true;
    const submitted = { reportId, updatedAt, status };
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateSupportReportStatusAction>>;
      try {
        result = await updateSupportReportStatusAction({ reportId, expectedUpdatedAt: updatedAt, status: targetStatus });
      } catch {
        // The request may have been applied; stay locked and ask the user to reload and review.
        if (mountedRef.current) setUnknownOutcome(true);
        return;
      }
      if (!mountedRef.current) return;
      const inScope = reportIdRef.current === submitted.reportId;
      if (result.status === "SUCCESS" && result.reportId === submitted.reportId) {
        setConfirmedFrom({ updatedAt: submitted.updatedAt, status: submitted.status });
        if (inScope) {
          notify.success(targetStatus === "ACKNOWLEDGED" ? "รับทราบรายงานแล้ว" : "บันทึกสถานะว่าแก้ไขแล้ว");
          router.refresh();
        }
        return;
      }
      if (result.status === "ERROR" && result.code !== "UNAVAILABLE") {
        inFlightRef.current = false;
        if (!inScope) return;
        setError(result.message);
        if (result.code === "CONFLICT") notify.warning("สถานะรายงานเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
        else if (result.code === "FORBIDDEN") notify.error("ไม่มีสิทธิ์จัดการรายงานนี้");
        return;
      }
      // UNAVAILABLE, an unexpected IDLE, or a success for another report proves nothing about this transition.
      setUnknownOutcome(true);
    });
  }
  return <div className="mt-5 space-y-3">{error ? <Alert variant="warning">{error}</Alert> : null}<UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "reload" }} /><Button disabled={pending || unknownOutcome || awaitingRefresh} loading={pending} onClick={update} type="button">{targetStatus === "ACKNOWLEDGED" ? "รับทราบรายงาน" : "ทำเครื่องหมายว่าแก้ไขแล้ว"}</Button></div>;
}
