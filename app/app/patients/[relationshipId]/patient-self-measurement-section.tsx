import { StatusBadge } from "@/components/ui/status-badge";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_SELF_MEASUREMENT_LABEL } from "@/modules/patient-self-measurements/domain/patient-self-measurement";
import { listPatientSelfMeasurementsForCareTeam } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { ForbiddenError } from "@/shared/errors/application-error";

import { PatientSelfMeasurementValues } from "../../personal/measurements/patient-self-measurement-values";

/** E5 (ก-22): read-only Patient-reported values for the assigned OSM and this Hospital's staff. */
export async function PatientSelfMeasurementSection({ actor, relationshipId }: { actor: ActorContext; relationshipId: string }): Promise<React.JSX.Element | null> {
  let items: Awaited<ReturnType<typeof listPatientSelfMeasurementsForCareTeam>>;
  try {
    items = await listPatientSelfMeasurementsForCareTeam(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }

  return <section className="mt-6 border-t border-border pt-5" aria-labelledby="patient-self-measurement-heading">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-lg font-semibold text-text" id="patient-self-measurement-heading">ค่าที่ผู้ป่วยวัดเอง</h2>
      <StatusBadge variant="info">{PATIENT_SELF_MEASUREMENT_LABEL}</StatusBadge>
    </div>
    <p className="mt-2 text-sm leading-6 text-text-muted">แยกจากบันทึกของ อสม. และเจ้าหน้าที่ ไม่นับเป็นการให้บริการ ไม่ใช่สัญญาณชีพของครั้งบริการ และไม่ใช้ในรายงาน</p>
    {items.length === 0 ? <p className="mt-3 text-text-muted">ผู้ป่วยยังไม่ได้บันทึกค่าเอง</p> : <ul className="mt-3 divide-y divide-border">
      {items.map((item) => <li className="py-3" key={item.measurementId}><PatientSelfMeasurementValues item={item} /></li>)}
    </ul>}
  </section>;
}
