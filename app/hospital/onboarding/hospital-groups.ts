export type OnboardingHospitalParent = {
  id: string;
  name: string;
  parentHospitalId: string | null;
};

export type OnboardingHospitalOption = {
  id: string;
  hospitalCode: string;
  name: string;
  parentHospitalId: string | null;
  parentHospital: OnboardingHospitalParent | null;
};

export type HospitalNetworkGroup = {
  parent: OnboardingHospitalParent;
  eligibleParent: OnboardingHospitalOption | null;
  children: readonly OnboardingHospitalOption[];
};

export type HospitalSelectionGroups = {
  networks: readonly HospitalNetworkGroup[];
  otherHospitals: readonly OnboardingHospitalOption[];
};

function compareByName(
  left: { id: string; name: string },
  right: { id: string; name: string },
): number {
  return left.name.localeCompare(right.name, "th-TH") || left.id.localeCompare(right.id, "en");
}

export function getVerifiedParentHospital(
  hospital: OnboardingHospitalOption,
): OnboardingHospitalParent | null {
  const parent = hospital.parentHospital;

  if (
    hospital.parentHospitalId === null ||
    parent === null ||
    parent.name.trim().length === 0 ||
    parent.id !== hospital.parentHospitalId ||
    parent.id === hospital.id ||
    parent.parentHospitalId !== null
  ) {
    return null;
  }

  return parent;
}

export function groupOnboardingHospitals(
  hospitals: readonly OnboardingHospitalOption[],
): HospitalSelectionGroups {
  const eligibleRoots = hospitals.filter(
    (hospital) => hospital.parentHospitalId === null && hospital.parentHospital === null,
  );
  const eligibleRootById = new Map(eligibleRoots.map((hospital) => [hospital.id, hospital]));
  const candidatesByParentId = new Map<
    string,
    { parent: OnboardingHospitalParent; children: OnboardingHospitalOption[] }
  >();
  const ambiguousParentIds = new Set<string>();

  for (const hospital of hospitals) {
    const parent = getVerifiedParentHospital(hospital);
    if (!parent) continue;

    const existing = candidatesByParentId.get(parent.id);
    if (existing && existing.parent.name !== parent.name) {
      ambiguousParentIds.add(parent.id);
      continue;
    }

    if (existing) {
      existing.children.push(hospital);
    } else {
      candidatesByParentId.set(parent.id, { parent, children: [hospital] });
    }
  }

  const groupedHospitalIds = new Set<string>();
  const networks: HospitalNetworkGroup[] = [];

  for (const [parentId, candidate] of candidatesByParentId) {
    const eligibleParent = eligibleRootById.get(parentId) ?? null;
    if (
      ambiguousParentIds.has(parentId) ||
      (eligibleParent !== null && eligibleParent.name !== candidate.parent.name)
    ) {
      continue;
    }

    const children = candidate.children.slice().sort(compareByName);
    groupedHospitalIds.add(parentId);
    for (const child of children) groupedHospitalIds.add(child.id);
    networks.push({ parent: candidate.parent, eligibleParent, children });
  }

  networks.sort((left, right) => compareByName(left.parent, right.parent));

  const otherHospitals = hospitals
    .filter((hospital) => !groupedHospitalIds.has(hospital.id))
    .slice()
    .sort(compareByName);

  return { networks, otherHospitals };
}
