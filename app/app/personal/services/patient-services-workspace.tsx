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
        breadcrumbs={[{ href: "/app/personal/care", label: "บริการ" }, { label: "ขอรับบริการ" }]}
        title="ขอรับบริการ"
      />

      {relationships.length === 0 ? (
        <Alert className="mt-6" variant="info">
          ยังไม่พบโรงพยาบาลที่ดูแลคุณ
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
                  <p className="mt-1 text-sm leading-6 text-text-muted">โรงพยาบาลที่ดูแลคุณ</p>
                </div>
                <StatusBadge variant={relationship.hospitalActive && !relationship.careEnded ? "success" : "neutral"}>
                  {relationship.careEnded
                    ? "สิ้นสุดการดูแลแล้ว"
                    : relationship.hospitalActive ? "รับคำขอได้" : "โรงพยาบาลยังไม่พร้อมรับคำขอ"}
                </StatusBadge>
              </div>

              <section aria-labelledby={`${sectionId}-history`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-history`}>
                  คำขอของคุณ
                </h3>
                {relationship.requests.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {[...relationship.requests].sort((left, right) => Number(right.status === "PENDING" || right.status === "APPROVED") - Number(left.status === "PENDING" || left.status === "APPROVED")).map((request) => (
                      <PatientServiceRequestHistoryItem hospitalName={relationship.hospitalName} key={request.requestId} request={request} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-text-muted">ยังไม่มีคำขอบริการสำหรับโรงพยาบาลนี้</p>
                )}
              </section>

              <section aria-labelledby={`${sectionId}-services`} className="mt-6 border-t border-border pt-5">
                <h3 className="text-base font-semibold text-text" id={`${sectionId}-services`}>
                  ขอเพิ่มบริการ
                </h3>
                {relationship.hospitalActive && !relationship.careEnded ? (
                  <>
                    <PatientServiceRequestForm
                      relationshipId={relationship.relationshipId}
                      services={relationship.services}
                      openServiceCodes={relationship.requests
                        .filter(({ status }) => status === "PENDING" || status === "APPROVED")
                        .map(({ serviceCode }) => serviceCode)}
                      assignedOsm={relationship.assignedOsm}
                      preferredDateBounds={preferredDateBounds}
                    />
                  </>
                ) : (
                  <Alert className="mt-4" variant={relationship.careEnded ? "neutral" : "warning"}>
                    {relationship.careEnded
                      ? "โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว"
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
