import { HospitalStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/shared/errors/application-error";

import {
  OnboardingHospitalSearchRateLimitedError,
  onboardableHospitalWhere,
  publicOnboardableHospitalWhere,
  searchOnboardingHospitals,
  type OnboardingHospitalDatabase,
} from "./onboarding-hospital-service";

const NOW = new Date("2026-11-05T03:00:00.000Z");

describe("public onboarding Hospital projection", () => {
  it("searches only pending Parents that were never the Child of any area, ten at most (ADR-0018)", async () => {
    expect(onboardableHospitalWhere).toEqual({
      status: HospitalStatus.PENDING_VERIFICATION,
      serviceAreaEligibility: { is: { kind: "PARENT" } },
      serviceAreaAssignments: { none: {} },
    });
    const findMany = vi.fn().mockResolvedValue([
      { id: "hospital-parent-id", hospitalCode: "PARENT-001", name: "โรงพยาบาลแม่ข่าย", serviceAreaEligibility: { kind: "PARENT" } },
    ]);
    const database = { hospital: { findMany } } as unknown as OnboardingHospitalDatabase;
    const rateLimiter = { consume: vi.fn().mockResolvedValue(true) };

    await expect(searchOnboardingHospitals("  แม่ข่าย ", { ipAddress: "203.0.113.7" }, { database, rateLimiter, now: () => NOW }))
      .resolves.toEqual([
        { id: "hospital-parent-id", hospitalCode: "PARENT-001", name: "โรงพยาบาลแม่ข่าย", networkRole: "PARENT" },
      ]);
    expect(rateLimiter.consume).toHaveBeenCalledWith("HOSPITAL_SEARCH", "203.0.113.7", NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          publicOnboardableHospitalWhere,
          { OR: [
            { name: { contains: "แม่ข่าย", mode: "insensitive" } },
            { hospitalCode: { contains: "แม่ข่าย", mode: "insensitive" } },
          ] },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        hospitalCode: true,
        name: true,
        serviceAreaEligibility: { select: { kind: true } },
      },
    });
  });

  it("refuses a term shorter than two characters or longer than 100 without reading", async () => {
    const findMany = vi.fn();
    const database = { hospital: { findMany } } as unknown as OnboardingHospitalDatabase;
    const rateLimiter = { consume: vi.fn().mockResolvedValue(true) };

    for (const value of ["", " ก ", "ก".repeat(101), 42]) {
      await expect(searchOnboardingHospitals(value, { ipAddress: "203.0.113.7" }, { database, rateLimiter }))
        .rejects.toBeInstanceOf(ValidationError);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rate limits the public search per client before any read", async () => {
    const findMany = vi.fn();
    const database = { hospital: { findMany } } as unknown as OnboardingHospitalDatabase;
    const rateLimiter = { consume: vi.fn().mockResolvedValue(false) };

    await expect(searchOnboardingHospitals("แม่ข่าย", { ipAddress: "203.0.113.7" }, { database, rateLimiter }))
      .rejects.toBeInstanceOf(OnboardingHospitalSearchRateLimitedError);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("hides a Parent while platform ADMIN has an open OWNER invitation for it (ADR-0024)", () => {
    expect(publicOnboardableHospitalWhere).toEqual({
      ...onboardableHospitalWhere,
      memberships: { none: { membershipType: "OWNER", status: { in: ["PROVISIONED", "INVITED"] } } },
    });
  });
});
