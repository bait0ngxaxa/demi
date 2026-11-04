import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import type { WorkforceOsmPatientPage } from "@/modules/patient-directory/services/patient-directory-query-service";

export type WorkforceOsmAssignedPatientsState =
  | { status: "READY"; page: WorkforceOsmPatientPage }
  | { status: "SUMMARY_ONLY" }
  | { status: "ERROR" };

function patientPageHref(relationshipId: string, page: number): string {
  return `/app/workforce/osm/${encodeURIComponent(relationshipId)}?patientsPage=${page}`;
}

export function WorkforceOsmAssignedPatientsSection({
  currentAssignmentCount,
  relationshipId,
  state,
}: {
  currentAssignmentCount: number;
  relationshipId: string;
  state: WorkforceOsmAssignedPatientsState;
}): React.JSX.Element {
  return (
    <section aria-labelledby="workforce-osm-assigned-patients-heading">
      <Panel>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text" id="workforce-osm-assigned-patients-heading">
            ผู้ป่วยในความรับผิดชอบ
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            แสดงผู้ป่วยที่ยังรับการดูแลจากโรงพยาบาลนี้และยังมอบหมายให้ อสม. รายนี้ดูแล โดยไม่กรองตามสถานะบัญชีผู้ป่วย ทั้งนี้ อสม. ต้องมีบัญชีและสิทธิ์ทำงานกับโรงพยาบาลนี้อยู่
          </p>
        </div>

        {state.status === "SUMMARY_ONLY" ? (
          <Alert className="mt-4" role="status" variant="info">
            แสดงได้เฉพาะจำนวนรายการมอบหมายที่ยังไม่สิ้นสุด ผู้ดูรายนี้ไม่มีสิทธิ์ดูรายชื่อผู้ป่วย
          </Alert>
        ) : state.status === "ERROR" ? (
          <Alert className="mt-4" role="alert" variant="warning">
            โหลดรายชื่อผู้ป่วยไม่สำเร็จ จำนวนรายการมอบหมายที่ยังไม่สิ้นสุดด้านบนยังแสดงตามเดิม กรุณาลองใหม่ภายหลัง
          </Alert>
        ) : state.page.total === 0 ? (
          <Alert className="mt-4" role="status" variant={currentAssignmentCount > 0 ? "warning" : "info"}>
            {currentAssignmentCount > 0
              ? "มีผู้ป่วยที่ยังมอบหมายอยู่ แต่ไม่มีรายชื่อที่แสดงได้ กรุณาตรวจสอบสถานะการดูแลผู้ป่วยและสิทธิ์ทำงานของ อสม. กับแอดมินโรงพยาบาล"
              : "ขณะนี้ไม่มีผู้ป่วยที่มอบหมายให้อสม. รายนี้ดูแล"}
          </Alert>
        ) : (
          <>
            <p className="mt-4 text-sm text-text-muted">
              รายชื่อที่แสดงได้ {state.page.total} ราย · รายการมอบหมายที่ยังไม่สิ้นสุด {currentAssignmentCount} รายการ · {state.page.hospital.name}
            </p>
            {state.page.total !== currentAssignmentCount ? (
              <p className="mt-2 text-sm leading-6 text-text-muted">
                ยอดด้านบนเป็นจำนวนผู้ป่วยที่ยังมอบหมายอยู่ ส่วนรายชื่อนี้แสดงเฉพาะผู้ป่วยที่ยังรับการดูแลจากโรงพยาบาลนี้ และผู้รับผิดชอบมีบัญชีและสิทธิ์ทำงานกับโรงพยาบาลนี้อยู่
              </p>
            ) : null}
            <ul aria-label="รายชื่อผู้ป่วยในความรับผิดชอบ" className="mt-3 divide-y divide-border border-y border-border">
              {state.page.items.map((patient) => (
                <li className="flex min-w-0 flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between" key={patient.patientHospitalRelationshipId}>
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-text">{patient.displayName}</p>
                    <p className="mt-1 break-words text-sm text-text-muted">
                      HN {patient.hospitalNumber ?? "ไม่ระบุ"} · {patient.hospital.name}
                    </p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 shrink-0 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}`}
                    prefetch={false}
                  >
                    ดูรายละเอียดผู้ป่วย
                  </Link>
                </li>
              ))}
            </ul>
            {state.page.totalPages > 1 ? (
              <nav aria-label="แบ่งหน้ารายชื่อผู้ป่วย" className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p aria-live="polite" className="text-sm text-text-muted">
                  หน้า {state.page.page} จาก {state.page.totalPages}
                </p>
                <div className="flex flex-wrap gap-2">
                  {state.page.hasPreviousPage ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                      href={patientPageHref(relationshipId, state.page.page - 1)}
                      rel="prev"
                      prefetch={false}
                    >
                      หน้าก่อน
                    </Link>
                  ) : null}
                  {state.page.hasNextPage ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                      href={patientPageHref(relationshipId, state.page.page + 1)}
                      rel="next"
                      prefetch={false}
                    >
                      หน้าถัดไป
                    </Link>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </>
        )}
      </Panel>
    </section>
  );
}
