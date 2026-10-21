import { HospitalStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  listAvailableHospitalMaster,
  type HospitalMasterDatabase,
} from "./hospital-master-service";

describe("public onboarding Hospital projection", () => {
  it("returns only pending Hospital identities with their ADMIN-set network role", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "hospital-child-id", hospitalCode: "CHILD-001", name: "รพ.สต.ลูกข่าย", serviceAreaEligibility: { kind: "CHILD" } },
      { id: "hospital-other-id", hospitalCode: "OTHER-001", name: "โรงพยาบาลอื่น", serviceAreaEligibility: null },
    ]);
    const database = { hospital: { findMany } } as unknown as HospitalMasterDatabase;

    await expect(listAvailableHospitalMaster(database)).resolves.toEqual([
      { id: "hospital-child-id", hospitalCode: "CHILD-001", name: "รพ.สต.ลูกข่าย", networkRole: "CHILD" },
      { id: "hospital-other-id", hospitalCode: "OTHER-001", name: "โรงพยาบาลอื่น", networkRole: null },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: HospitalStatus.PENDING_VERIFICATION },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        hospitalCode: true,
        name: true,
        serviceAreaEligibility: { select: { kind: true } },
      },
    });
  });
});
