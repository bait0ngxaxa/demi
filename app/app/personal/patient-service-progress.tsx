import { ServiceProgressCard, serviceProgressHref } from "@/modules/patient-self/presentation/service-progress-card";
import type { OwnServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";

import { PatientRoundRecording } from "./patient-round-recording";

export function PatientServiceProgress({ services }: { services: OwnServiceProgress[] }): React.JSX.Element {
  return <section aria-labelledby="my-service-progress-heading" className="mt-6 space-y-4">
    <h2 className="text-xl font-semibold text-text" id="my-service-progress-heading">บริการของฉันตอนนี้</h2>
    {services.length === 0 ? <p className="text-text-muted">ยังไม่มีหน่วยบริการที่ดูแลอยู่</p> : services.map((service) => (
      <ServiceProgressCard key={service.relationshipId} progress={service} renderRecording={(item) => {
        const round = service.recordingRound;
        const step = round?.status.steps.find(({ planItemId }) => planItemId === item.planItemId);
        return round && step ? <PatientRoundRecording round={round} step={step} relationship={service.relationship} returnHref={serviceProgressHref(service.relationshipId)} /> : null;
      }} />
    ))}
  </section>;
}
