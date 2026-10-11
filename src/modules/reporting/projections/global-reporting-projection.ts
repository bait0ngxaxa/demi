import type { HospitalStatus } from "@prisma/client";

import type { HospitalHierarchyDirectory } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

export type GlobalReportingDirectory = {
  hierarchy: HospitalHierarchyDirectory;
  statusCounts: Readonly<Record<HospitalStatus, number>>;
};
