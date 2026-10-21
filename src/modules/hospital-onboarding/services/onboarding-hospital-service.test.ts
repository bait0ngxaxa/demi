import { HospitalStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  listOnboardingHospitals,
  onboardableHospitalWhere,
  type OnboardingHospitalDatabase,
} from "./onboarding-hospital-service";

describe("public onboarding Hospital projection", () => {
  it("offers only pending Parents that were never the Child of any area (ADR-0018)", async () => {
    expect(onboardableHospitalWhere).toEqual({
      status: HospitalStatus.PENDING_VERIFICATION,
      serviceAreaEligibility: { is: { kind: "PARENT" } },
      serviceAreaAssignments: { none: {} },
    });
    const findMany = vi.fn().mockResolvedValue([
      { id: "hospital-parent-id", hospitalCode: "PARENT-001", name: "โรงพยาบาลแม่ข่าย", serviceAreaEligibility: { kind: "PARENT" } },
    ]);
    const database = { hospital: { findMany } } as unknown as OnboardingHospitalDatabase;

    await expect(listOnboardingHospitals(database)).resolves.toEqual([
      { id: "hospital-parent-id", hospitalCode: "PARENT-001", name: "โรงพยาบาลแม่ข่าย", networkRole: "PARENT" },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: onboardableHospitalWhere,
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
