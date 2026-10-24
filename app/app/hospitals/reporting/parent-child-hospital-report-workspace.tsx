import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ParentChildHospitalReportPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";

import { ExportButton } from "./hospital-report-workspace";
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
  const dashboard = report.content.dashboard.value;
  const serviceProcess = report.content.serviceProcess.value;

  return (
    <div className="content-workspace">
      <HospitalReportTargetSelector hospitals={hospitals} parentGroups={parentGroups} routeBase="/app/hospitals/reporting" selection={selection} />
      <PageHeader
        actions={(
          <ExportButton
            endpoint="/api/v1/hospital/reporting/parent-child/export"
            hospitalId={report.hospital.id}
            parentHospitalId={report.parent.id}
          />
        )}
        breadcrumbs={[
          { label: "งานโรงพยาบาลแม่ข่าย", href: `/app?hospitalId=${encodeURIComponent(report.parent.id)}` },
          { label: "รายงานโรงพยาบาล", href: "/app/hospitals/reporting" },
          { label: "รายงานโรงพยาบาลลูกข่าย" },
        ]}
        description="เลือกโรงพยาบาลลูกข่ายในเครือข่ายเพื่อดูรายงานได้ครั้งละ 1 แห่ง"
        title="รายงานโรงพยาบาล"
      />

      <Link className="mt-4 inline-flex min-h-11 items-center text-brand-strong underline" href="/app/hospitals/reporting?scope=network">กลับไปรายชื่อลูกข่าย</Link>

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
          <StatusBadge variant="info">รายงานโรงพยาบาลลูกข่ายผ่านสิทธิ์เจ้าของโรงพยาบาลแม่ข่าย</StatusBadge>
        </div>

        <Alert className="mt-5" variant="info">
          แสดงรายงานของโรงพยาบาลลูกข่ายที่เลือกเท่านั้น สิทธิ์นี้ไม่ครอบคลุมการจัดการบัญชี ข้อมูลผู้ป่วย หรือรายงานของโรงพยาบาลอื่น ไฟล์ Excel มีเฉพาะตัวเลขสรุป 9 ค่านี้ ไม่รวมผู้ที่สิ้นสุดการดูแล และทุกการส่งออกถูกบันทึกไว้
        </Alert>

        <section aria-labelledby="parent-child-report-dashboard-heading" className="mt-6 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text" id="parent-child-report-dashboard-heading">
              ภาพรวมรายงาน
            </h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-text-muted">
              จำนวนความสัมพันธ์นับตามรายการในโรงพยาบาล ส่วน Program นับเฉพาะสถานะกำลังดำเนินและสิ้นสุดแล้ว
            </p>
          </div>
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 @5xl/workspace:grid-cols-5">
            <ReportingMetric label="จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล" value={dashboard.patientHospitalRelationships.value} />
            <ReportingMetric label="จำนวนความสัมพันธ์ที่ไม่มี Program" value={dashboard.relationshipsWithoutProgram.value} />
            <ReportingMetric label="Program ทั้งหมด" value={dashboard.programs.total} />
            <ReportingMetric label="Program ที่กำลังดำเนิน" value={dashboard.programs.active} />
            <ReportingMetric label="Program ที่สิ้นสุดแล้ว" value={dashboard.programs.completed} />
          </div>
        </section>

        <section aria-labelledby="parent-child-report-service-heading" className="mt-7 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text" id="parent-child-report-service-heading">
              ขั้นตอนบริการ
            </h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-text-muted">
              ตัวเลขแสดงจำนวน Program ที่มีบันทึกในแต่ละขั้นตอน ไม่ได้ยืนยันว่าบริการเสร็จสิ้นหรือเกิดผลสำเร็จ
            </p>
          </div>
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 @5xl/workspace:grid-cols-4">
            <ReportingMetric label="Program ที่มีบันทึก Routine" value={serviceProcess.programsWithRoutineRecord.value} />
            <ReportingMetric label="Program ที่มีบันทึก Floating Chart" value={serviceProcess.programsWithFloatingChartRecord.value} />
            <ReportingMetric label="Program ที่มีบันทึก Dream Card" value={serviceProcess.programsWithDreamCardRecord.value} />
            <ReportingMetric label="Program ที่มีบันทึก Confidence" value={serviceProcess.programsWithConfidenceRecord.value} />
          </div>
        </section>
      </section>
    </div>
  );
}

function ReportingMetric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <Panel aria-label={label} className="min-w-0">
      <dl>
        <dt className="text-sm leading-5 text-text-muted">{label}</dt>
        <dd className="mt-2 tabular-nums text-2xl font-semibold text-text">{value.toLocaleString("th-TH")}</dd>
      </dl>
    </Panel>
  );
}
