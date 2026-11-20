import { normalizeHospitalName } from "./hospital-registration-csv";

/** Read-only grouping behind scripts/report-duplicate-hospital-names.ts; nothing is renamed. */
export type DuplicateNameHospital = {
  id: string;
  hospitalCode: string;
  name: string;
  status: string;
  createdAt: Date;
  /** Active network Parent, else the Parent it was registered for; null for none. */
  parentId: string | null;
  parentName: string | null;
};

export type DuplicateNameGroup = { scope: "GLOBAL" | "NETWORK"; parentName: string | null; normalizedName: string; hospitals: DuplicateNameHospital[] };

function groupsOf(hospitals: readonly DuplicateNameHospital[], key: (hospital: DuplicateNameHospital) => string): DuplicateNameHospital[][] {
  const byKey = new Map<string, DuplicateNameHospital[]>();
  for (const hospital of hospitals) byKey.set(key(hospital), [...(byKey.get(key(hospital)) ?? []), hospital]);
  return [...byKey.values()].filter((group) => group.length > 1);
}

/** Global duplicates across every Hospital, then duplicates among the Children of each Parent. */
export function findDuplicateHospitalNames(hospitals: readonly DuplicateNameHospital[]): DuplicateNameGroup[] {
  const global = groupsOf(hospitals, ({ name }) => normalizeHospitalName(name)).map((group): DuplicateNameGroup => ({
    scope: "GLOBAL", parentName: null, normalizedName: normalizeHospitalName(group[0]?.name ?? ""), hospitals: group,
  }));
  const network = groupsOf(hospitals.filter(({ parentId }) => parentId !== null), ({ parentId, name }) => `${parentId}\n${normalizeHospitalName(name)}`)
    .map((group): DuplicateNameGroup => ({
      scope: "NETWORK", parentName: group[0]?.parentName ?? null, normalizedName: normalizeHospitalName(group[0]?.name ?? ""), hospitals: group,
    }));
  return [...global, ...network];
}
