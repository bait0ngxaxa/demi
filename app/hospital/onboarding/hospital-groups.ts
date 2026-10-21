export type OnboardingHospitalOption = {
  id: string;
  hospitalCode: string;
  name: string;
  /** ADMIN-set network role (ADR-0015); a grouping label only. */
  networkRole: "PARENT" | "CHILD" | null;
};

export type HospitalSelectionGroup = {
  key: "PARENT" | "CHILD" | "OTHER";
  title: string;
  hospitals: readonly OnboardingHospitalOption[];
};

const GROUPS: readonly Omit<HospitalSelectionGroup, "hospitals">[] = [
  { key: "PARENT", title: "โรงพยาบาลแม่ข่าย" },
  { key: "CHILD", title: "รพ.สต. / หน่วยบริการลูกข่าย" },
  { key: "OTHER", title: "โรงพยาบาลอื่น" },
];

function compareByName(left: OnboardingHospitalOption, right: OnboardingHospitalOption): number {
  return left.name.localeCompare(right.name, "th-TH") || left.id.localeCompare(right.id, "en");
}

export function hospitalRoleLabel(hospital: OnboardingHospitalOption): string | null {
  return GROUPS.find(({ key }) => key === hospital.networkRole)?.title ?? null;
}

/** Non-empty groups in a fixed order (Parent, Child, other), each sorted by Thai name. */
export function groupOnboardingHospitals(hospitals: readonly OnboardingHospitalOption[]): HospitalSelectionGroup[] {
  return GROUPS.flatMap((group) => {
    const members = hospitals
      .filter(({ networkRole }) => (networkRole ?? "OTHER") === group.key)
      .slice()
      .sort(compareByName);
    return members.length > 0 ? [{ ...group, hospitals: members }] : [];
  });
}
