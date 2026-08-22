import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";

const mockedProgramAccess = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-program/services/patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedProgramAccess,
}));

import {
  resolveProgramReportAccessContext,
  type ProgramReportAccessDatabase,
} from "./program-report-access-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";

const actor: ActorContext = {
  userId: actorUserId,
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
  patientProgramId: programId,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-DO-NOT-EXPOSE",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
  },
  target: {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
  },
};

describe("Program reporting access service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProgramAccess.mockResolvedValue(access);
  });

  it("requires both identifiers and delegates to authoritative exact Program access", async () => {
    const database = {} as ProgramReportAccessDatabase;

    await expect(
      resolveProgramReportAccessContext(
        actor,
        relationshipId.toUpperCase(),
        programId.toUpperCase(),
        database,
      ),
    ).resolves.toMatchObject({
      patientProgramId: programId,
      patient: { patientHospitalRelationshipId: relationshipId },
    });

    expect(mockedProgramAccess).toHaveBeenCalledWith(
      actor,
      programId,
      "program:read",
      database,
    );
  });

  it("fails closed when the Program belongs to another relationship", async () => {
    mockedProgramAccess.mockResolvedValue({
      ...access,
      patient: {
        ...access.patient,
        patientHospitalRelationshipId: "66666666-6666-4666-8666-666666666666",
      },
    });

    await expect(
      resolveProgramReportAccessContext(actor, relationshipId, programId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([
    ["invalid relationship", "not-a-uuid", programId],
    ["invalid Program", relationshipId, "not-a-uuid"],
  ])("rejects %s before accessing data", async (_label, requestedRelationshipId, requestedProgramId) => {
    await expect(
      resolveProgramReportAccessContext(actor, requestedRelationshipId, requestedProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedProgramAccess).not.toHaveBeenCalled();
  });

  it("preserves a fail-closed NotFound from an unrelated Hospital", async () => {
    mockedProgramAccess.mockRejectedValue(new NotFoundError());

    await expect(
      resolveProgramReportAccessContext(actor, relationshipId, programId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
