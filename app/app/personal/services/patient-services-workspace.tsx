import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientServiceRelationshipView } from "@/modules/patient-service-requests/services/patient-service-request-service";

import {
  PatientServiceRequestForm,
  PatientServiceRequestHistoryItem,
} from "./patient-service-request-controls";

export function PatientServicesWorkspace({
  relationships,
}: {
  relationships: readonly PatientServiceRelationshipView[];
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "บริการของฉัน" }]}
        description="ส่งคำขอรับบริการจากโรงพยาบาลที่เชื่อมกับบัญชีของคุณ โรงพยาบาลจะตรวจสอบก่อนเริ่มให้บริการ"
        title="บริการของฉัน"
      />

      {relationships.length === 0 ? (
        <Alert className="mt-6" variant="info">
          ยังไม่พบความสัมพันธ์กับโรงพยาบาลในบัญชีนี้ หากข้อมูลไม่ถูกต้อง โปรดติดต่อโรงพยาบาล
        </Alert>
      ) : (
        <div className="mt-6 space-y-6">
          {relationships.map((relationship, index) => {
            const sectionId = `patient-service-${index}`;

            return (
            <Panel aria-labelledby={`${sectionId}-hospital`} key={relationship.relationshipId}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={`${sectionId}-hospital`}>
                    {relationship.hospitalName}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">โรงพยาบาลที่เชื่อมกับบัญชีผู้ป่วยของคุณ</p>
                </div>
                <StatusBadge variant={relationship.hospitalActive ? "success" : "neutral"}>
                  {relationship.hospitalActive ? "รับคำขอได้เมื่อมีบริการเปิด" : "โรงพยาบาลยังไม่พร้อมรับคำขอ"}
                </StatusBadge>
              </div>

              <section aria-labelledby={`${sectionId}-offerings`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-offerings`}>
                  ขอเพิ่มบริการ
                </h3>
                {relationship.hospitalActive && relationship.offerings.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      เลือกบริการที่เปิดรับคำขอ การส่งคำขอยังไม่ใช่การลงทะเบียนใน Program
                    </p>
                    <PatientServiceRequestForm
                      relationshipId={relationship.relationshipId}
                      offerings={relationship.offerings}
                      osmChoices={relationship.osmChoices}
                    />
                  </>
                ) : (
                  <Alert className="mt-4" variant={relationship.hospitalActive ? "neutral" : "warning"}>
                    {relationship.hospitalActive
                      ? "ขณะนี้โรงพยาบาลยังไม่ได้เปิดบริการสำหรับยื่นคำขอ"
                      : "ขณะนี้ยังส่งคำขอเพิ่มบริการที่โรงพยาบาลนี้ไม่ได้"}
                  </Alert>
                )}
              </section>

              <section aria-labelledby={`${sectionId}-history`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-history`}>
                  ประวัติคำขอ
                </h3>
                {relationship.requests.length > 0 ? (
                  <ul className="mt-4 divide-y divide-border">
                    {relationship.requests.map((request) => (
                      <PatientServiceRequestHistoryItem key={request.requestId} request={request} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-text-muted">ยังไม่มีคำขอบริการสำหรับโรงพยาบาลนี้</p>
                )}
              </section>

            </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
