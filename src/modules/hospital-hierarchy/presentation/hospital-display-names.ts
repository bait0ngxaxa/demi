import { normalizeHospitalName } from "@/modules/hospital-governance/domain/hospital-registration-csv";

/**
 * Hospital codes are never shown and `Hospital.name` is not unique, so a list tells same-named Hospitals apart only
 * when it actually contains a duplicate: a unique name is shown as is; a duplicate gets its Parent, otherwise its
 * registration date. If the Parent still leaves two entries equal, the date is added too.
 */
export type HospitalDisplayNameInput = {
  id: string;
  name: string;
  parentName?: string | null;
  registeredAt?: Date | string | null;
};

function registeredDateText(value: Date | string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Returns one display name per Hospital id, in the context of exactly the given list. */
export function hospitalDisplayNames(hospitals: readonly HospitalDisplayNameInput[]): ReadonlyMap<string, string> {
  const nameCounts = countBy(hospitals, ({ name }) => normalizeHospitalName(name));
  const withParent = hospitals.map((hospital) => {
    if ((nameCounts.get(normalizeHospitalName(hospital.name)) ?? 0) < 2) return { hospital, label: hospital.name, duplicated: false };
    if (hospital.parentName) return { hospital, label: `${hospital.name} · ลูกข่ายของ ${hospital.parentName}`, duplicated: true };
    return { hospital, label: hospital.registeredAt ? `${hospital.name} · ขึ้นทะเบียน ${registeredDateText(hospital.registeredAt)}` : hospital.name, duplicated: true };
  });
  const labelCounts = countBy(withParent, ({ label }) => normalizeHospitalName(label));

  return new Map(withParent.map(({ hospital, label, duplicated }) => {
    const stillEqual = duplicated && (labelCounts.get(normalizeHospitalName(label)) ?? 0) > 1;
    const { parentName, registeredAt } = hospital;
    return [hospital.id, stillEqual && parentName && registeredAt ? `${label} · ขึ้นทะเบียน ${registeredDateText(registeredAt)}` : label];
  }));
}
