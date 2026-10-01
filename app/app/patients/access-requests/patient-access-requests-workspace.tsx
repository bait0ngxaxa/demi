import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientAccessRequestListItem } from "@/modules/patient-access-requests/services/patient-access-request-service";

const statusLabels: Record<PatientAccessRequestListItem["status"], string> = {
  PENDING: "รอตรวจสอบตัวตน",
  APPROVED: "อนุมัติแล้ว รอดำเนินการต่อ",
  REJECTED: "ไม่อนุมัติคำขอ",
  WITHDRAWN: "ถอนคำขอแล้ว",
  ACTIVATION_ISSUED: "ออกลิงก์เปิดใช้งานแล้ว",
  COMPLETED: "ดำเนินการแล้ว",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function HospitalPatientAccessRequestsWorkspace({
  requests,
}: {
  requests: readonly PatientAccessRequestListItem[];
}): React.JSX.Element {
  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "งาน" }, { label: "คำขอเปิดใช้งานผู้ป่วย" }]}
        description="ตรวจสอบคำขอในโรงพยาบาลที่คุณเป็นสมาชิกโดยตรง ก่อนใช้ workflow provision และ activation ที่มีอยู่"
        title="คำขอเปิดใช้งานผู้ป่วย"
      />

      {requests.length === 0 ? (
        <Alert className="mt-6" variant="info">
          ยังไม่มีคำขอ เมื่อมีผู้ป่วยส่งคำขอ รายการจะแสดงในหน้านี้
        </Alert>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((request) => (
            <Panel aria-labelledby={`access-request-${request.requestId}`} key={request.requestId}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2
                    className="break-words text-lg font-semibold tracking-[-0.02em] text-text"
                    id={`access-request-${request.requestId}`}
                  >
                    {request.patientName ?? "คำขอจากผู้ป่วย"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {request.hospitalName} · {request.hospitalCode}
                  </p>
                </div>
                <StatusBadge
                  variant={request.status === "PENDING" ? "warning" : request.status === "REJECTED" ? "danger" : "info"}
                >
                  {statusLabels[request.status]}
                </StatusBadge>
              </div>

              <p className="mt-4 border-t border-border pt-4 text-sm leading-6 text-text-muted">
                รับคำขอเมื่อ {formatDate(request.createdAt)}
                {request.reviewedAt ? ` · ตรวจสอบล่าสุด ${formatDate(request.reviewedAt)}` : ""}
              </p>

              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={`/app/patients/access-requests/${encodeURIComponent(request.requestId)}`}
              >
                เปิดรายละเอียดและดำเนินการ
              </Link>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
