import fixture from "../../../../prisma/seed/hospital-master-v2.json";
import { HospitalStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  listAvailableHospitalMaster,
  type HospitalMasterDatabase,
} from "./hospital-master-service";

describe("approved Hospital Master fixture", () => {
  it("contains exactly the approved 78 records with valid parent references", () => {
    const codes = new Set(fixture.map((record) => record.canonicalCode));

    expect(fixture).toHaveLength(78);
    expect(codes.size).toBe(78);
    expect(fixture.filter((record) => record.parentCanonicalCode)).toHaveLength(35);
    expect(fixture.filter((record) => !record.parentCanonicalCode)).toHaveLength(43);
    expect(codes.has("HH")).toBe(false);
    expect(fixture.find((record) => record.canonicalCode === "KANG")?.nameTh).toBe(
      "โรงพยาบาลแก่งคอย",
    );
    expect(fixture.find((record) => record.canonicalCode === "KHON")?.nameTh).toBe(
      "โรงพยาบาลขอนแก่น",
    );
    expect(
      fixture
        .filter((record) => record.parentCanonicalCode)
        .every((record) => codes.has(record.parentCanonicalCode ?? "")),
    ).toBe(true);
  });
});

describe("public Hospital Master projection", () => {
  it("returns only eligible Hospital identities and their persisted parent identity and name", async () => {
    const parent = {
      id: "hospital-parent-id",
      name: "โรงพยาบาลแม่ข่าย",
      parentHospitalId: null,
    };
    const records = [
      {
        id: "hospital-child-id",
        hospitalCode: "CHILD-001",
        name: "โรงพยาบาลลูกข่าย",
        parentHospitalId: parent.id,
        parentHospital: parent,
      },
    ];
    const findMany = vi.fn().mockResolvedValue(records);
    const database = { hospital: { findMany } } as unknown as HospitalMasterDatabase;

    await expect(listAvailableHospitalMaster(database)).resolves.toEqual(records);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: HospitalStatus.PENDING_VERIFICATION },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        hospitalCode: true,
        name: true,
        parentHospitalId: true,
        parentHospital: {
          select: { id: true, name: true, parentHospitalId: true },
        },
      },
    });
  });
});
