import { describe, expect, it } from "vitest";

import { groupOnboardingHospitals, hospitalRoleLabel, type OnboardingHospitalOption } from "./hospital-groups";

function option(id: string, name: string, networkRole: OnboardingHospitalOption["networkRole"]): OnboardingHospitalOption {
  return { id, hospitalCode: id.toUpperCase(), name, networkRole };
}

describe("groupOnboardingHospitals", () => {
  it("groups by network role in a fixed order and sorts each group by Thai name", () => {
    const groups = groupOnboardingHospitals([
      option("child-b", "รพ.สต. ข", "CHILD"),
      option("other", "โรงพยาบาลอื่น", null),
      option("parent", "โรงพยาบาลแม่ข่าย", "PARENT"),
      option("child-a", "รพ.สต. ก", "CHILD"),
    ]);

    expect(groups.map(({ key, hospitals }) => [key, hospitals.map(({ id }) => id)])).toEqual([
      ["PARENT", ["parent"]],
      ["CHILD", ["child-a", "child-b"]],
      ["OTHER", ["other"]],
    ]);
  });

  it("omits empty groups", () => {
    expect(groupOnboardingHospitals([option("child", "รพ.สต.", "CHILD")]).map(({ key }) => key)).toEqual(["CHILD"]);
    expect(groupOnboardingHospitals([])).toEqual([]);
  });

  it("labels the selected Hospital by its network role", () => {
    expect(hospitalRoleLabel(option("parent", "แม่ข่าย", "PARENT"))).toBe("โรงพยาบาลแม่ข่าย");
    expect(hospitalRoleLabel(option("child", "ลูกข่าย", "CHILD"))).toBe("รพ.สต. / หน่วยบริการลูกข่าย");
    expect(hospitalRoleLabel(option("other", "อื่น", null))).toBeNull();
  });
});
