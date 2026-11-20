import { ServiceProgressCard, serviceProgressHref } from "@/modules/patient-self/presentation/service-progress-card";
import type { OwnServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";

import { PatientRoundRecording } from "./patient-round-recording";

/** Tab "ครั้งบริการ" for the selected Hospital: what each round does, what is left and what the patient records. */
export function PatientServiceProgress({ service }: { service: OwnServiceProgress | null }): React.JSX.Element {
  if (!service) {
    return <p className="text-text-muted">ยังไม่มีหน่วยบริการที่ดูแลอยู่</p>;
  }

  const careHref = `/app/personal/care/${encodeURIComponent(service.relationshipId)}`;
  const programId = service.programId;
  const returnHref = serviceProgressHref(service.relationshipId, "rounds");

  return <ServiceProgressCard
    links={programId ? {
      roundHref: (roundNumber) => `${careHref}/programs/${encodeURIComponent(programId)}/rounds#round-${roundNumber}`,
      followupsHref: serviceProgressHref(service.relationshipId, "followups"),
    } : undefined}
    progress={service}
    renderRecording={(item) => {
      const round = service.recordingRound;
      const step = round?.status.steps.find(({ planItemId }) => planItemId === item.planItemId);
      return round && step ? <PatientRoundRecording round={round} step={step} relationship={service.relationship} returnHref={returnHref} /> : null;
    }}
  />;
}
