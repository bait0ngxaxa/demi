import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  HospitalHierarchyDirectory,
  HospitalHierarchyIssueCode,
  HospitalHierarchyUnit,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

function statusLabel(status: HospitalHierarchyUnit["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "ใช้งานอยู่";
    case "SUSPENDED":
      return "ถูกระงับ";
    case "PENDING_VERIFICATION":
      return "รอยืนยันการขึ้นทะเบียน";
  }
}

function statusVariant(status: HospitalHierarchyUnit["status"]): StatusVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    case "PENDING_VERIFICATION":
      return "warning";
  }
}

function issueLabel(issue: HospitalHierarchyIssueCode): string {
  switch (issue) {
    case "MISSING_PARENT":
      return "ไม่พบโรงพยาบาลแม่ข่ายที่อ้างอิง";
    case "SELF_PARENT":
      return "หน่วยนี้อ้างอิงตัวเองเป็นโรงพยาบาลแม่ข่าย";
    case "CYCLE":
      return "พบวงจรในความสัมพันธ์ของโรงพยาบาล";
    case "PARENT_IS_SUBORDINATE":
      return "โรงพยาบาลแม่ข่ายที่อ้างอิงเป็นโรงพยาบาลลูกข่าย";
    case "PARENT_INVALID":
      return "ไม่สามารถจัดกลุ่มกับโรงพยาบาลแม่ข่ายได้";
    case "DUPLICATE_IDENTITY":
      return "พบรหัสหรือข้อมูลโรงพยาบาลซ้ำ";
  }
}

function HospitalDetailLink({ hospital }: { hospital: HospitalHierarchyUnit }): React.JSX.Element {
  return (
    <Link
      className="min-h-11 rounded-control text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      href={`/app/admin/hospitals/${hospital.id}`}
    >
      เปิดรายละเอียด
    </Link>
  );
}

function SubordinateRow({
  hospital,
  mainHospital,
}: {
  hospital: HospitalHierarchyUnit;
  mainHospital: HospitalHierarchyUnit;
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          className="break-words font-semibold text-text underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={`/app/admin/hospitals/${hospital.id}`}
        >
          {hospital.name}
        </Link>
        <p className="mt-1 break-words text-sm leading-6 text-text-muted">
          รหัส {hospital.hospitalCode} · โรงพยาบาลแม่ข่าย {mainHospital.name} ({mainHospital.hospitalCode})
        </p>
        <p className="text-xs leading-5 text-text-muted">รพ.สต. / หน่วยบริการในเครือ</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
        <StatusBadge variant={statusVariant(hospital.status)}>{statusLabel(hospital.status)}</StatusBadge>
      </div>
    </li>
  );
}

export function HospitalHierarchyDirectory({
  directory,
}: {
  directory: HospitalHierarchyDirectory;
}): React.JSX.Element {
  return (
    <section aria-labelledby="hospital-hierarchy-directory-heading" className="pt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-hierarchy-directory-heading">
            โครงสร้างโรงพยาบาล
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            แสดงโรงพยาบาลแม่ข่ายและโรงพยาบาลลูกข่ายตามความสัมพันธ์โดยตรงในปัจจุบัน พร้อมสถานะของแต่ละแห่ง
          </p>
        </div>
        <p className="text-sm leading-6 text-text-muted" aria-live="polite">
          ทั้งหมด {directory.hospitalCount.toLocaleString("th-TH")} แห่ง · แม่ข่าย {directory.mainHospitalCount.toLocaleString("th-TH")} แห่ง · ลูกข่าย {directory.subordinateHospitalCount.toLocaleString("th-TH")} แห่ง
        </p>
      </div>

      {directory.hospitalCount === 0 ? (
        <Panel className="mt-6 border-dashed text-center">
          <p className="font-semibold">ยังไม่มีโรงพยาบาลในระบบ</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            โรงพยาบาลที่เพิ่มเข้าสู่ระบบจะแสดงในรายการนี้ตามสถานะและความสัมพันธ์ปัจจุบัน
          </p>
        </Panel>
      ) : (
        <ul className="mt-6 grid min-w-0 gap-4">
          {directory.groups.map(({ mainHospital, directChildren }) => (
            <li className="min-w-0" key={mainHospital.id}>
              <section
                aria-labelledby={`main-hospital-${mainHospital.id}`}
                className="min-w-0 rounded-panel border border-border bg-surface p-5 sm:p-6"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold text-text" id={`main-hospital-${mainHospital.id}`}>
                      {mainHospital.name}
                    </h3>
                    <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                      โรงพยาบาลแม่ข่าย · รหัส {mainHospital.hospitalCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge variant={statusVariant(mainHospital.status)}>{statusLabel(mainHospital.status)}</StatusBadge>
                    <HospitalDetailLink hospital={mainHospital} />
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm leading-6 text-text-muted">
                    โรงพยาบาลลูกข่ายโดยตรง {directChildren.length.toLocaleString("th-TH")} แห่ง
                  </p>
                  {directChildren.length === 0 ? (
                    <p className="mt-2 text-sm text-text-muted">ยังไม่มีโรงพยาบาลลูกข่ายโดยตรง</p>
                  ) : (
                    <details className="mt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center rounded-control text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                        ดูรายชื่อโรงพยาบาลลูกข่าย {directChildren.length.toLocaleString("th-TH")} แห่ง
                      </summary>
                      <ul className="mt-2 divide-y divide-border border-t border-border">
                        {directChildren.map((hospital) => (
                          <SubordinateRow key={hospital.id} hospital={hospital} mainHospital={mainHospital} />
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </section>
            </li>
          ))}
        </ul>
      )}

      {directory.diagnostics.length > 0 ? (
        <section aria-labelledby="hospital-hierarchy-diagnostics-heading" className="mt-8">
          <Alert variant="warning">
            <h3 className="font-semibold" id="hospital-hierarchy-diagnostics-heading">
              รายการที่ต้องตรวจสอบโครงสร้าง
            </h3>
            <p className="mt-1 text-sm leading-6">
              มีโรงพยาบาล {directory.diagnostics.length.toLocaleString("th-TH")} แห่งที่ยังจัดกลุ่มตามความสัมพันธ์ปัจจุบันไม่ได้ รายการเหล่านี้ยังแสดงไว้เพื่อให้ตรวจสอบ
            </p>
          </Alert>
          <ul className="mt-3 divide-y divide-border rounded-panel border border-border bg-surface px-5 sm:px-6">
            {directory.diagnostics.map(({ hospital, parentHospital, issues }) => (
              <li className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between" key={hospital.id}>
                <div className="min-w-0">
                  <Link
                    className="break-words font-semibold text-text underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    href={`/app/admin/hospitals/${hospital.id}`}
                  >
                    {hospital.name}
                  </Link>
                  <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                    รหัส {hospital.hospitalCode}
                    {parentHospital
                      ? ` · แม่ข่ายที่อ้างอิง ${parentHospital.name} (${parentHospital.hospitalCode})`
                      : " · ไม่พบโรงพยาบาลแม่ข่าย"}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm leading-6 text-danger-strong">
                    {issues.map((issue) => (
                      <li key={`${issue.code}:${issue.parentHospitalCode ?? "none"}`}>
                        {issueLabel(issue.code)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <StatusBadge variant={statusVariant(hospital.status)}>{statusLabel(hospital.status)}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
