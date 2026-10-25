import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientResponsibleOsmProjection } from "@/modules/patient-directory/services/patient-directory-query-service";

export type PatientResponsibleOsmSectionState = PatientResponsibleOsmProjection | {
  status: "NETWORK_RESTRICTED" | "ERROR";
};

export function PatientResponsibleOsmSection({
  canManageAssignment,
  relationshipId,
  state,
}: {
  canManageAssignment: boolean;
  relationshipId: string;
  state: PatientResponsibleOsmSectionState;
}): React.JSX.Element {
  const assignmentHref = `/app/patients/${encodeURIComponent(relationshipId)}/assignment`;

  return (
    <section aria-labelledby="patient-responsible-osm-heading" className="mt-6">
      <Panel>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text" id="patient-responsible-osm-heading">
              อสม. ผู้รับผิดชอบ
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">ผู้รับผิดชอบปัจจุบันในโรงพยาบาลนี้</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state.status === "ASSIGNED" ? <StatusBadge variant="success">รับผิดชอบอยู่</StatusBadge> : null}
            {canManageAssignment ? (
              <Link className={buttonClassName({ variant: "secondary" })} href={assignmentHref} prefetch={false}>
                จัดการผู้รับผิดชอบ
              </Link>
            ) : null}
          </div>
        </div>

        {state.status === "ASSIGNED" ? (
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-sm text-text-muted">ชื่อ อสม.</dt>
              <dd className="mt-1 break-words font-semibold text-text">{state.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">วันที่มอบหมาย</dt>
              <dd className="mt-1 font-semibold text-text">
                {new Intl.DateTimeFormat("th-TH", {
                  dateStyle: "long",
                  timeZone: "Asia/Bangkok",
                }).format(state.assignedAt)}
              </dd>
            </div>
          </dl>
        ) : state.status === "UNASSIGNED" ? (
          <Alert className="mt-4" role="status" variant="info">
            ยังไม่มี อสม. ที่ได้รับมอบหมายให้ดูแลผู้ป่วยรายนี้
          </Alert>
        ) : state.status === "UNAVAILABLE" ? (
          <Alert className="mt-4" role="status" variant="warning">
            ยืนยันผู้รับผิดชอบปัจจุบันไม่ได้ กรุณาติดต่อผู้ดูแลโรงพยาบาล
          </Alert>
        ) : state.status === "NETWORK_RESTRICTED" ? (
          <Alert className="mt-4" role="status" variant="info">
            มุมมองเครือข่ายนี้ไม่แสดงข้อมูล อสม. ผู้รับผิดชอบของโรงพยาบาลลูกข่าย
          </Alert>
        ) : state.status === "RESTRICTED" ? (
          <Alert className="mt-4" role="status" variant="info">
            บัญชีนี้ไม่มีสิทธิ์ดูรายละเอียดการมอบหมาย อสม. กรุณาติดต่อผู้ดูแลโรงพยาบาล
          </Alert>
        ) : (
          <Alert className="mt-4" role="alert" variant="warning">
            โหลดข้อมูล อสม. ผู้รับผิดชอบไม่สำเร็จ ขณะนี้ยังยืนยันผู้รับผิดชอบปัจจุบันไม่ได้ กรุณาลองใหม่ภายหลัง
          </Alert>
        )}
      </Panel>
    </section>
  );
}
