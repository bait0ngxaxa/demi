import { describe, expect, it } from "vitest";

import {
  groupOnboardingHospitals,
  type OnboardingHospitalParent,
  type OnboardingHospitalOption,
} from "./hospital-groups";

const parent = {
  id: "parent-id",
  name: "โรงพยาบาลเครือกลาง",
  parentHospitalId: null,
};

function child(
  id: string,
  name: string,
  hospitalCode: string,
  parentOverride: OnboardingHospitalParent = parent,
): OnboardingHospitalOption {
  return {
    id,
    hospitalCode,
    name,
    parentHospitalId: parent.id,
    parentHospital: parentOverride,
  };
}

function eligibleParent(): OnboardingHospitalOption {
  return {
    id: parent.id,
    hospitalCode: "NETWORK-001",
    name: parent.name,
    parentHospitalId: null,
    parentHospital: null,
  };
}

describe("groupOnboardingHospitals", () => {
  it("groups direct children by persisted parent identity and keeps an eligible parent separately selectable", () => {
    const hospitals = [
      child("child-b", "โรงพยาบาลลูกข่าย ข", "CHILD-B"),
      eligibleParent(),
      child("child-a", "โรงพยาบาลลูกข่าย ก", "CHILD-A"),
    ];

    const groups = groupOnboardingHospitals(hospitals);

    expect(groups.networks).toHaveLength(1);
    expect(groups.networks[0]).toMatchObject({
      parent: { id: parent.id, name: parent.name },
      eligibleParent: { id: parent.id, hospitalCode: "NETWORK-001" },
      children: [{ id: "child-a" }, { id: "child-b" }],
    });
    expect(groups.otherHospitals).toEqual([]);
  });

  it("shows a non-eligible parent as grouping context without making it selectable", () => {
    const groups = groupOnboardingHospitals([child("child-a", "โรงพยาบาลลูกข่าย ก", "CHILD-A")]);

    expect(groups.networks[0]?.parent).toEqual(parent);
    expect(groups.networks[0]?.eligibleParent).toBeNull();
    expect(groups.networks[0]?.children.map(({ id }) => id)).toEqual(["child-a"]);
  });

  it("keeps hospitals with missing, mismatched, or subordinate parent relationships ungrouped", () => {
    const missingParent = child("orphan", "โรงพยาบาลไม่พบแม่ข่าย", "ORPHAN");
    missingParent.parentHospital = null;
    const mismatchedParent = child("mismatch", "โรงพยาบาลความสัมพันธ์ไม่ตรง", "MISMATCH", {
      ...parent,
      id: "different-parent-id",
    });
    const subordinateParent = child("subordinate", "โรงพยาบาลแม่ข่ายซ้อน", "SUBORDINATE", {
      ...parent,
      parentHospitalId: "another-parent-id",
    });
    const unnamedParent = child("unnamed", "โรงพยาบาลชื่อแม่ข่ายว่าง", "UNNAMED", {
      ...parent,
      name: "  ",
    });

    const groups = groupOnboardingHospitals([
      missingParent,
      mismatchedParent,
      subordinateParent,
      unnamedParent,
    ]);

    expect(groups.networks).toEqual([]);
    expect(groups.otherHospitals.map(({ id }) => id).sort()).toEqual([
      "mismatch",
      "orphan",
      "subordinate",
      "unnamed",
    ]);
  });

  it("preserves distinct Hospital identities when display names are identical", () => {
    const groups = groupOnboardingHospitals([
      child("child-a", "โรงพยาบาลซ้ำ", "CHILD-A"),
      child("child-b", "โรงพยาบาลซ้ำ", "CHILD-B"),
    ]);

    expect(groups.networks[0]?.children.map(({ id }) => id)).toEqual(["child-a", "child-b"]);
  });

  it("leaves unrelated eligible Hospitals selectable without inventing a network", () => {
    const other: OnboardingHospitalOption = {
      id: "unrelated-id",
      hospitalCode: "OTHER-001",
      name: "โรงพยาบาลไม่มีแม่ข่าย",
      parentHospitalId: null,
      parentHospital: null,
    };

    const groups = groupOnboardingHospitals([other]);

    expect(groups.networks).toEqual([]);
    expect(groups.otherHospitals).toEqual([other]);
  });
});
