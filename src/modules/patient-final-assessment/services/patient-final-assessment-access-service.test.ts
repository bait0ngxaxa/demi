import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";

const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-program/services/patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import { resolvePatientFinalAssessmentAccessContext } from "./patient-final-assessment-access-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";

const actor: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

const access = {
  actor,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "ผู้ป่วย",
    hospitalNumber: null,
    hospital: { id: hospitalId, name: "โรงพยาบาล" },
  },
  target: {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
  },
};

describe("Patient Final Assessment access boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("normalizes the exact Program and checks the derived relationship", async () => {
    await expect(
      resolvePatientFinalAssessmentAccessContext(
        actor,
        programId.toUpperCase(),
        "program:read",
        relationshipId.toUpperCase(),
      ),
    ).resolves.toMatchObject({ patientProgramId: programId, patient: { patientHospitalRelationshipId: relationshipId } });
    expect(mockedProgramAccess).toHaveBeenCalledWith(
      actor,
      programId,
      "program:read",
      undefined,
    );
  });

  it("rejects a supplied relationship that is not the Program's relationship", async () => {
    await expect(
      resolvePatientFinalAssessmentAccessContext(
        actor,
        programId,
        "program:manage",
        "66666666-6666-4666-8666-666666666666",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
