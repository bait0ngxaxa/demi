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
  preferredDateBounds,
}: {
  relationships: readonly PatientServiceRelationshipView[];
  /** SR-D6: tomorrow to +60 days on the Bangkok calendar, from the server clock. */
  preferredDateBounds: { min: string; max: string };
}): React.JSX.Element {
  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "บริการของฉัน" }]}
        description="ขอให้ อสม. มาเยี่ยมบ้านเพื่อรับบริการ โรงพยาบาลจะยืนยันวันเวลานัดให้"
        title="บริการของฉัน"
      />
      <p className="mt-3 text-sm leading-6 text-text-muted">
        เลือกวันและช่วงเวลาที่สะดวก โรงพยาบาลจะยืนยันนัดหรือแจ้งเหตุผลหากไม่อนุมัติ การส่งคำขอไม่ได้เปลี่ยน อสม. ผู้ดูแลของคุณ
      </p>

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
                <StatusBadge variant={relationship.hospitalActive && !relationship.careEnded ? "success" : "neutral"}>
                  {relationship.careEnded
                    ? "สิ้นสุดการดูแลแล้ว"
                    : relationship.hospitalActive ? "รับคำขอได้เมื่อมีบริการเปิด" : "โรงพยาบาลยังไม่พร้อมรับคำขอ"}
                </StatusBadge>
              </div>

              <section aria-labelledby={`${sectionId}-history`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-history`}>
                  คำขอของคุณ
                </h3>
                {relationship.requests.length > 0 ? (
                  <ul className="mt-4 divide-y divide-border">
                    {[...relationship.requests].sort((left, right) => Number(right.status === "PENDING" || right.status === "APPROVED") - Number(left.status === "PENDING" || left.status === "APPROVED")).map((request) => (
                      <PatientServiceRequestHistoryItem key={request.requestId} request={request} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-text-muted">ยังไม่มีคำขอบริการสำหรับโรงพยาบาลนี้</p>
                )}
              </section>

              <section aria-labelledby={`${sectionId}-offerings`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-offerings`}>
                  ขอเพิ่มบริการ
                </h3>
                {relationship.hospitalActive && !relationship.careEnded && relationship.offerings.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      เลือกบริการที่เปิดรับคำขอ การส่งคำขอยังไม่ใช่การลงทะเบียนใน Program
                    </p>
                    <PatientServiceRequestForm
                      relationshipId={relationship.relationshipId}
                      offerings={relationship.offerings}
                      osmChoices={relationship.osmChoices}
                      preferredDateBounds={preferredDateBounds}
                    />
                  </>
                ) : (
                  <Alert className="mt-4" variant={relationship.hospitalActive || relationship.careEnded ? "neutral" : "warning"}>
                    {relationship.careEnded
                      ? "โรงพยาบาลสิ้นสุดการดูแลแล้ว จึงส่งคำขอใหม่ที่โรงพยาบาลนี้ไม่ได้ ประวัติคำขอยังดูได้ด้านล่าง"
                      : relationship.hospitalActive
                        ? "ขณะนี้โรงพยาบาลยังไม่ได้เปิดบริการสำหรับยื่นคำขอ"
                        : "ขณะนี้ยังส่งคำขอเพิ่มบริการที่โรงพยาบาลนี้ไม่ได้"}
                  </Alert>
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
