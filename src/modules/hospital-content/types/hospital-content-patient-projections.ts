import type { HospitalContentCategory } from "@prisma/client";

export type HospitalContentPatientHospital = { hospitalCode: string; name: string };
export type HospitalContentPatientListItem = {
  id: string;
  hospital: HospitalContentPatientHospital;
  title: string;
  category: HospitalContentCategory;
  latestPublishedAt: string;
};
export type HospitalContentPatientDetail = HospitalContentPatientListItem & {
  body: string;
  sourceText: string | null;
};
export type HospitalContentPatientEmptyState = "EMPTY_A" | "EMPTY_B" | "EMPTY_C";
export type HospitalContentPatientPage = {
  category: HospitalContentCategory | null;
  items: HospitalContentPatientListItem[];
  nextCursor: string | null;
  emptyState: HospitalContentPatientEmptyState | null;
};
