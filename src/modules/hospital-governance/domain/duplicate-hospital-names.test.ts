import { describe, expect, it } from "vitest";

import { findDuplicateHospitalNames, type DuplicateNameHospital } from "./duplicate-hospital-names";

function hospital(id: string, name: string, parent: { id: string; name: string } | null = null): DuplicateNameHospital {
  return {
    id, hospitalCode: `H-${id}`, name, status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00.000Z"),
    parentId: parent?.id ?? null, parentName: parent?.name ?? null,
  };
}

describe("findDuplicateHospitalNames", () => {
  it("reports normalized global duplicates and duplicates within one Parent separately", () => {
    const north = { id: "p1", name: "แม่ข่ายเหนือ" };
    const south = { id: "p2", name: "แม่ข่ายใต้" };
    const groups = findDuplicateHospitalNames([
      hospital("a", "รพ.สต. บ้านใหม่", north),
      hospital("b", "รพ.สต.บ้านใหม่", north),
      hospital("c", "รพ.สต.บ้านใหม่", south),
      hospital("d", "โรงพยาบาลเดียว"),
    ]);

    expect(groups.map(({ scope, parentName, hospitals }) => [scope, parentName, hospitals.map(({ id }) => id)])).toEqual([
      ["GLOBAL", null, ["a", "b", "c"]],
      ["NETWORK", "แม่ข่ายเหนือ", ["a", "b"]],
    ]);
  });

  it("reports nothing when every name is unique", () => {
    expect(findDuplicateHospitalNames([hospital("a", "หนึ่ง"), hospital("b", "สอง")])).toEqual([]);
  });
});
