import { HospitalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildHospitalHierarchyDirectory, type HospitalNetworkRecord } from "./hospital-hierarchy-service";

function record(
  id: string,
  name: string,
  role: HospitalNetworkRecord["role"],
  networkParentId: string | null = null,
): HospitalNetworkRecord {
  return { id, hospitalCode: id.toUpperCase(), name, status: HospitalStatus.ACTIVE, role, networkParentId };
}

describe("hospital network directory", () => {
  it("groups each network PARENT with its active network Children in Thai name order", () => {
    const directory = buildHospitalHierarchyDirectory([
      record("child-b", "ข ลูกข่าย", "CHILD", "parent"),
      record("parent", "ก แม่ข่าย", "PARENT"),
      record("child-a", "ก ลูกข่าย", "CHILD", "parent"),
      record("empty-parent", "ค แม่ข่ายใหม่", "PARENT"),
    ]);

    expect(directory.groups.map(({ mainHospital, directChildren }) => [mainHospital.id, directChildren.map(({ id }) => id)])).toEqual([
      ["parent", ["child-a", "child-b"]],
      ["empty-parent", []],
    ]);
    expect(directory).toMatchObject({ hospitalCount: 4, mainHospitalCount: 2, subordinateHospitalCount: 2, outsideNetwork: [] });
  });

  it("lists free Children and unclassified Hospitals outside every network", () => {
    const directory = buildHospitalHierarchyDirectory([
      record("parent", "แม่ข่าย", "PARENT"),
      record("free", "ลูกข่ายว่าง", "CHILD"),
      record("none", "ยังไม่กำหนด", null),
    ]);

    expect(directory.outsideNetwork.map(({ id }) => id)).toEqual(["none", "free"]);
    expect(directory.subordinateHospitalCount).toBe(1);
  });

  it("projects identity fields only", () => {
    const [group] = buildHospitalHierarchyDirectory([record("parent", "แม่ข่าย", "PARENT")]).groups;
    expect(Object.keys(group?.mainHospital ?? {}).sort()).toEqual(["hospitalCode", "id", "name", "status"]);
  });
});
