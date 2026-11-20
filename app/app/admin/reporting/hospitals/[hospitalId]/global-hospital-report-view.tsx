import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";

import { ExportButton, HospitalReportWorkspace } from "../../../../hospitals/reporting/hospital-report-workspace";
import { globalHospitalReportHref, hospitalStatusLabel, hospitalStatusVariant } from "../../hospital-status";
import { HospitalReportSwitcher } from "./hospital-report-switcher";

function networkText(hierarchy: HospitalHierarchyContext): string {
  switch (hierarchy.classification) {
    case "MAIN": return `แม่ข่าย · ลูกข่าย ${hierarchy.directChildCount.toLocaleString("th-TH")} แห่ง`;
    case "SUBORDINATE": return hierarchy.parentHospital ? `ลูกข่าย · ${hierarchy.parentHospital.name}` : "ลูกข่าย";
    case "UNASSIGNED": return "ยังไม่อยู่ในเครือข่าย";
  }
}

/**
 * One Hospital's system report page. The header owns the Hospital's identity, export and switching; the report body
 * appears only for an ACTIVE Hospital (`page` is null otherwise).
 */
export function GlobalHospitalReportView({
  hierarchy,
  page,
  initialView,
}: {
  hierarchy: HospitalHierarchyContext;
  page: HospitalReportingPageProjection | null;
  initialView: "overview" | "service";
}): React.JSX.Element {
  const hospital = hierarchy.hospital;
  const reportHref = globalHospitalReportHref(hospital.id);

  return (
    <div className="min-w-0">
      <PageHeader
        actions={
          <div className="flex min-w-0 flex-wrap items-start gap-3 sm:justify-end">
            {page ? <ExportButton cohort={page.cohort} endpoint="/api/v1/admin/reporting/export" hospitalId={hospital.id} /> : null}
            <HospitalReportSwitcher currentHospitalId={hospital.id} view={initialView} />
          </div>
        }
        breadcrumbs={[
          { label: "หน้าหลัก", href: "/app" },
          { label: "รายงานระบบ", href: "/app/admin/reporting" },
          { label: hospital.name },
        ]}
        context={
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge variant={hospitalStatusVariant(hospital.status)}>{hospitalStatusLabel(hospital.status)}</StatusBadge>
            <p className="break-words text-sm text-header-muted">{networkText(hierarchy)}</p>
          </div>
        }
        title={hospital.name}
      />

      {page ? (
        <HospitalReportWorkspace
          audience="GLOBAL_ADMIN"
          chrome="embedded"
          hierarchy={hierarchy}
          hospitals={[{ id: hospital.id, hospitalCode: hospital.hospitalCode, name: hospital.name, status: hospital.status }]}
          initialView={initialView}
          key={`${hospital.id}:${initialView}`}
          page={page}
          reportHref={reportHref}
          selectedHospitalId={hospital.id}
        />
      ) : (
        <Alert className="mt-6" variant={hospital.status === "SUSPENDED" ? "warning" : "info"}>
          <p className="font-semibold">รายงานยังไม่พร้อม · สถานะ {hospitalStatusLabel(hospital.status)}</p>
        </Alert>
      )}
    </div>
  );
}
