import { HospitalStatus } from "@prisma/client";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientSelfRelationshipNavigation } from "@/modules/patient-self/services/patient-self-query-service";

const hospitalStatusLabels: Record<HospitalStatus, string> = {
  [HospitalStatus.ACTIVE]: "ใช้งาน",
  [HospitalStatus.SUSPENDED]: "ถูกระงับการใช้งาน",
  [HospitalStatus.PENDING_VERIFICATION]: "รอยืนยันการขึ้นทะเบียน",
};

export function PatientSelfRelationshipNavigation({
  relationships,
  emptyMessage,
}: {
  relationships: readonly PatientSelfRelationshipNavigation[];
  emptyMessage: string;
}): React.JSX.Element {
  if (relationships.length === 0) {
    return (
      <Alert className="mt-6" variant="info">
        <p className="font-semibold">ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย</p>
        <p className="mt-1">{emptyMessage}</p>
      </Alert>
    );
  }

  return (
    <ul className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
      {relationships.map((relationship) => (
        <li className="min-w-0" key={relationship.relationshipId}>
          <Panel className="h-full">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-text">
                  {relationship.hospitalName}
                </h2>
                <p className="mt-1 break-words text-sm text-text-muted">
                  รหัสโรงพยาบาล: {relationship.hospitalCode}
                </p>
                <p className="mt-1 break-words text-sm text-text-muted">
                  HN: {relationship.hospitalNumber ?? "ยังไม่ได้บันทึก"}
                </p>
              </div>
              <StatusBadge variant="neutral">
                สถานะโรงพยาบาล: {hospitalStatusLabels[relationship.hospitalStatus]}
              </StatusBadge>
            </div>
            <nav aria-label={`ประวัติของ ${relationship.hospitalName}`} className="mt-5">
              <ul className="grid gap-2 sm:grid-cols-2">
                <li>
                  <Link
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-action-primary px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    href={`/app/personal/care/${encodeURIComponent(relationship.relationshipId)}`}
                  >
                    ข้อมูลการดูแล
                  </Link>
                </li>
                <li>
                  <Link
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-center text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    href={`/app/personal/appointments/${encodeURIComponent(relationship.relationshipId)}`}
                  >
                    นัดหมาย
                  </Link>
                </li>
              </ul>
            </nav>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
