"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updateSupportReportStatusAction } from "@/modules/support/transport/server-actions";

export function SupportReportStatusControl({ reportId, updatedAt, status }: { reportId: string; updatedAt: string; status: "NEW" | "ACKNOWLEDGED" | "RESOLVED" }): React.JSX.Element | null {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "NEW" ? "ACKNOWLEDGED" : status === "ACKNOWLEDGED" ? "RESOLVED" : null;
  if (!nextStatus) return null;
  function update(): void {
    setError(null);
    startTransition(async () => {
      const result = await updateSupportReportStatusAction({ reportId, expectedUpdatedAt: updatedAt, status: nextStatus });
      if (result.status === "SUCCESS") window.location.reload();
      else if (result.status === "ERROR") setError(result.message);
    });
  }
  return <div className="mt-5 space-y-3">{error ? <Alert variant="warning">{error}</Alert> : null}<Button disabled={pending} loading={pending} onClick={update} type="button">{nextStatus === "ACKNOWLEDGED" ? "รับทราบรายงาน" : "ทำเครื่องหมายว่าแก้ไขแล้ว"}</Button></div>;
}
