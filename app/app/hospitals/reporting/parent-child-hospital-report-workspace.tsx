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
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
            <Panel aria-labelledby="parent-child-report-dashboard-heading" className="p-5 sm:p-6">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-lg font-semibold text-text" id="parent-child-report-dashboard-heading">
                  ภาพรวมรายงาน
                </h3>
                <StatusBadge variant="warning">ยังไม่อนุมัติการเปิดเผยตัวเลข</StatusBadge>
              </div>
              <p className="mt-3 max-w-prose text-sm leading-6 text-text-muted">
                ระบบตรวจสอบสรุปของโรงพยาบาลที่เลือกแล้ว แต่จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล ความสัมพันธ์ที่ไม่มี Program และจำนวน Program แยกตามสถานะยังไม่เปิดให้ผู้ใช้ผ่านโรงพยาบาลแม่ข่ายเห็น
              </p>
              <p className="mt-3 max-w-prose text-sm leading-6 text-text-muted">
                ยังไม่มีข้อกำหนดที่ยืนยันสำหรับการเปิดเผยตัวเลขเหล่านี้ รวมถึงข้อมูลที่บันทึกไว้ก่อนเปลี่ยนโรงพยาบาลแม่ข่าย
              </p>
            </Panel>

            <Panel aria-labelledby="parent-child-report-service-heading" className="p-5 sm:p-6">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-lg font-semibold text-text" id="parent-child-report-service-heading">
                  ขั้นตอนบริการ
                </h3>
                <StatusBadge variant="warning">ยังไม่อนุมัติการเปิดเผยตัวเลข</StatusBadge>
              </div>
              <p className="mt-3 max-w-prose text-sm leading-6 text-text-muted">
                รายงานต้นทางตรวจการมีบันทึกในแต่ละ Program จำนวนบันทึกของขั้นตอนบริการยังไม่เปิดให้ผู้ใช้ผ่านโรงพยาบาลแม่ข่ายเห็น
              </p>
              <p className="mt-3 max-w-prose text-sm leading-6 text-text-muted">
                การมีบันทึกไม่ได้ยืนยันว่าบริการเสร็จสิ้นหรือเกิดผลสำเร็จ และยังไม่มีข้อกำหนดที่ยืนยันว่าจะแสดงจำนวนดังกล่าวได้
              </p>
            </Panel>
          </div>
        ) : null}
      </section>
    </div>
  );
}
