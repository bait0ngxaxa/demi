"use client";

import { Button } from "@/components/ui/button";
import type { HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

export function HospitalPatientServiceRequestReviewControls({
  requestId,
  status,
  action,
  pending,
}: {
  requestId: string;
  status: HospitalPatientServiceRequestView["status"];
  action: (formData: FormData) => void;
  pending: boolean;
}): React.JSX.Element | null {
  if (status !== "PENDING" && status !== "APPROVED") {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-3 text-sm leading-6 text-text-muted" id={`review-help-${requestId}`}>
        {status === "PENDING"
          ? "อนุมัติเพื่อรับคำขอไว้ดำเนินงานต่อ หรือไม่อนุมัติเพื่อบันทึกผลการตรวจสอบ การอนุมัติยังไม่ใช่การเริ่มให้บริการ"
          : "ยืนยันเมื่อเริ่มให้บริการแล้ว ระบบบันทึกเฉพาะสถานะคำขอและประวัติการดำเนินการ ไม่ได้สร้าง Program มอบหมาย อสม. หรือบันทึกผลบริการอัตโนมัติ"}
      </p>
      <form action={action} aria-busy={pending} aria-describedby={`review-help-${requestId}`} className="flex flex-wrap gap-2">
        <input name="requestId" type="hidden" value={requestId} />
        {status === "PENDING" ? (
          <>
            <Button disabled={pending} name="decision" size="compact" type="submit" value="APPROVE">
              อนุมัติคำขอ
            </Button>
            <Button disabled={pending} name="decision" size="compact" type="submit" value="REJECT" variant="secondary">
              ไม่อนุมัติคำขอ
            </Button>
          </>
        ) : (
          <Button disabled={pending} name="decision" size="compact" type="submit" value="START">
            ยืนยันว่าเริ่มให้บริการแล้ว
          </Button>
        )}
      </form>
    </div>
  );
}
