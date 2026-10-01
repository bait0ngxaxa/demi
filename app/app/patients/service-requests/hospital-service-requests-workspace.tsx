import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";
import {
  formatPatientServiceRequestDate,
  patientServiceLabel,
  patientServiceRequestStatusLabel,
  patientServiceRequestStatusVariant,
} from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";

import { HospitalPatientServiceRequestReviewControls } from "./hospital-service-request-controls";

export function HospitalPatientServiceRequestsWorkspace({
  requests,
}: {
  requests: readonly HospitalPatientServiceRequestView[];
}): React.JSX.Element {
  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "งาน" }, { label: "คำขอบริการผู้ป่วย" }]}
        description="ตรวจสอบคำขอจากผู้ป่วยในโรงพยาบาลที่คุณเป็นสมาชิกโดยตรง"
        title="คำขอบริการผู้ป่วย"
      />

      {requests.length === 0 ? (
        <Alert className="mt-6" variant="info">
          ยังไม่มีคำขอบริการจากผู้ป่วย เมื่อมีคำขอเข้ามา รายการจะแสดงในหน้านี้
        </Alert>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((request) => (
            <Panel aria-labelledby={`service-request-${request.requestId}`} key={request.requestId}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold tracking-[-0.02em] text-text" id={`service-request-${request.requestId}`}>
                    {request.patientName}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {request.hospitalName} · {request.hospitalCode}
                  </p>
                </div>
                <StatusBadge variant={patientServiceRequestStatusVariant(request.status)}>
                  {patientServiceRequestStatusLabel(request.status)}
                </StatusBadge>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-text-muted">บริการที่ต้องการ</dt>
                    <dd className="mt-1 font-semibold text-text">{patientServiceLabel(request.serviceCode)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">อสม.ที่ต้องการ (ความประสงค์)</dt>
                  <dd className="mt-1 text-text">{request.preferredOsmName ?? "ให้โรงพยาบาลจัดผู้ดูแลให้"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">ส่งคำขอเมื่อ</dt>
                  <dd className="mt-1 text-text">{formatPatientServiceRequestDate(request.createdAt)}</dd>
                </div>
              </dl>

              {request.status === "APPROVED" || request.status === "STARTED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm leading-6 text-text-muted">
                    คำขอนี้ไม่สร้าง Program หรือมอบหมาย อสม. ให้ใช้ workflow เดิมสำหรับการดำเนินงานจริง
                  </p>
                  <Link
                    className="mt-2 inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={`/app/patients/${encodeURIComponent(request.relationshipId)}`}
                  >
                    เปิดข้อมูลผู้ป่วยและ workflow เดิม
                  </Link>
                </div>
              ) : null}

              <HospitalPatientServiceRequestReviewControls requestId={request.requestId} status={request.status} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
