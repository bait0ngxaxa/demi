import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ServiceRoundLine, serviceProgressHref } from "@/modules/patient-self/presentation/service-progress-card";
import type { ServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";

export function PatientCurrentServiceCard({ progress }: { progress: ServiceProgress | null }): React.JSX.Element | null {
  if (!progress?.programId) return null;
  const count = progress.currentRound?.selfRecordable.length ?? 0;
  return <section className="mt-6" aria-labelledby="current-service-heading">
    <Panel>
      <h2 className="text-xl font-semibold text-text" id="current-service-heading">บริการครั้งปัจจุบัน</h2>
      <p className="mt-2 break-words text-sm text-text-muted">{progress.hospitalName}</p>
      <ServiceRoundLine progress={progress} />
      <p className="mt-2 text-sm text-text-muted">มี {count} รายการที่บันทึกเองได้</p>
      <Link className={buttonClassName({ className: "mt-4", variant: count > 0 ? "primary" : "secondary" })} href={serviceProgressHref(progress.relationshipId)}>
        {count > 0 ? "บันทึกเลย" : "ดูความคืบหน้า"}
      </Link>
    </Panel>
  </section>;
}
