import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ParentChildHospitalReportPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";

import { HospitalReportTargetSelector } from "./hospital-report-target-selector";

export function ParentChildHospitalReportWorkspace({
  hospitals,
  parentGroups,
  selection,
  report,
}: {
  hospitals: readonly HospitalReportingHospital[];
  parentGroups: readonly ParentChildHospitalReportTargetGroup[];
  selection: HospitalReportTargetSelection;
  report: ParentChildHospitalReportPageProjection;
}): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-[1440px]">
      <PageHeader
        breadcrumbs={[
          { label: "หน้าหลัก", href: "/app" },
          { label: "รายงานโรงพยาบาล", href: "/app/hospitals/reporting" },
          { label: "รายงาน Child Hospital" },
        ]}
        description="เลือกดูรายงานของ Child Hospital ภายในเครือข่ายได้ทีละแห่ง"
        title="รายงานโรงพยาบาล"
      />

      <HospitalReportTargetSelector
        hospitals={hospitals}
        parentGroups={parentGroups}
        routeBase="/app/hospitals/reporting"
        selection={selection}
      />

      <section aria-labelledby="parent-child-report-heading" className="mt-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-text" id="parent-child-report-heading">
              {report.hospital.name}
            </h2>
            <p className="mt-2 break-words text-sm leading-6 text-text-muted">
              โรงพยาบาลแม่ข่าย: {report.parent.name}
            </p>
          </div>
          <StatusBadge variant="info">รายงาน Child Hospital ผ่านสิทธิ์เจ้าของโรงพยาบาลแม่ข่าย</StatusBadge>
        </div>

        <Alert className="mt-5" variant="info">
          สิทธิ์นี้ใช้เพื่อเปิดรายงานของโรงพยาบาลลูกข่ายที่เลือกเท่านั้น ไม่ได้ให้สิทธิ์จัดการบัญชีหรือข้อมูลของโรงพยาบาลนั้น และไม่รวมรายงานของโรงพยาบาลอื่น
        </Alert>

        {report.content.state === "WITHHELD" ? (
          <Panel aria-labelledby="parent-child-report-content-heading" className="mt-5 p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-text" id="parent-child-report-content-heading">
              ยังไม่มีเนื้อหารายงานที่เปิดให้แสดง
            </h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
              การเลือกโรงพยาบาลและตรวจสอบสิทธิ์พร้อมแล้ว แต่ยังไม่มีรายการข้อมูลรายงานที่อนุมัติให้เปิดเผยแก่ผู้ใช้ผ่านโรงพยาบาลแม่ข่าย
            </p>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-text-muted">
              รายชื่อและรหัสผู้ป่วย ข้อมูลทางคลินิก ตัวชี้วัด และรายละเอียด Program จึงยังไม่แสดง จนกว่าจะมีการกำหนดรายการข้อมูลที่อนุญาตอย่างชัดเจน
            </p>
          </Panel>
        ) : null}
      </section>
    </div>
  );
}
