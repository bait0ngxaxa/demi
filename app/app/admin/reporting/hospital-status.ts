import type { StatusVariant } from "@/components/ui/status-badge";
import type { HospitalHierarchyUnit } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

export type HospitalStatusFilter = "ALL" | Exclude<HospitalHierarchyUnit["status"], "RETIRED">;

export const HOSPITAL_STATUS_FILTERS: readonly HospitalStatusFilter[] = ["ALL", "ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"];

/** The directory's status filter from `?hospitalStatus=`; anything else is not a filter. */
export function parseHospitalStatusFilter(value: string | null | undefined): HospitalStatusFilter | null {
  return HOSPITAL_STATUS_FILTERS.find((filter) => filter === value) ?? null;
}

export function hospitalStatusLabel(status: HospitalHierarchyUnit["status"]): string {
  switch (status) {
    case "ACTIVE": return "ใช้งานอยู่";
    case "SUSPENDED": return "ระงับการใช้งาน";
    case "PENDING_VERIFICATION": return "รอยืนยันการขึ้นทะเบียน";
    case "RETIRED": return "ถอนออกจากรายชื่อ";
  }
}

export function hospitalStatusVariant(status: HospitalHierarchyUnit["status"]): StatusVariant {
  switch (status) {
    case "ACTIVE": return "success";
    case "SUSPENDED": return "danger";
    case "PENDING_VERIFICATION": return "warning";
    case "RETIRED": return "neutral";
  }
}

export function globalHospitalReportHref(hospitalId: string): string {
  return `/app/admin/reporting/hospitals/${encodeURIComponent(hospitalId)}`;
}
