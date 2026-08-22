import { HospitalStatus, MembershipStatus, MembershipType, PatientProgramStatus, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";

const mockedAccess = vi.hoisted(() => vi.fn());

vi.mock("./patient-final-assessment-access-service", () => ({
  resolvePatientFinalAssessmentAccessContext: mockedAccess,
}));

import {
  getPatientFinalAssessmentForProgram,
  type PatientFinalAssessmentQueryDatabase,
} from "./patient-final-assessment-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const finalAssessmentId = "44444444-4444-4444-8444-444444444444";
const actorUserId = "55555555-5555-4555-8555-555555555555";

const actor: ActorContext = {
  userId: actorUserId,
  personId: "66666666-6666-4666-8666-666666666666",
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
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
  },
  target: {
    hospitalId,
    hospitalStatus: HospitalStatus.ACTIVE,
    assignedOsmUserId: null,
  },
};

function createDatabase(finalAssessment: Record<string, unknown> | null): {
  patientProgram: { findFirst: ReturnType<typeof vi.fn> };
} {
  return {
    patientProgram: {
      findFirst: vi.fn().mockResolvedValue({
        id: programId,
        patientHospitalRelationshipId: relationshipId,
        status: PatientProgramStatus.COMPLETED,
        finalAssessment,
      }),
    },
  };
}

function finalRecord(): Record<string, unknown> {
  return {
    id: finalAssessmentId,
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    recordedAt: new Date("2026-08-22T05:00:00.000Z"),
    createdAt: new Date("2026-08-22T05:00:00.000Z"),
    weight: 72.5,
    waistCircumference: 90,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 95,
    recordedBy: {
      id: actorUserId,
      person: { givenName: "สมชาย", familyName: "ผู้บันทึก" },
    },
  };
}

describe("Patient Final Assessment Program query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAccess.mockResolvedValue(access);
  });

  it("returns exact Program ownership, provenance, raw fields, and completed history", async () => {
    const database = createDatabase(finalRecord());

    await expect(
      getPatientFinalAssessmentForProgram(actor, programId, {
        database: database as unknown as PatientFinalAssessmentQueryDatabase,
      }),
    ).resolves.toEqual({
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      programStatus: PatientProgramStatus.COMPLETED,
      finalAssessment: {
        id: finalAssessmentId,
        recordedBy: { id: actorUserId, displayName: "สมชาย ผู้บันทึก" },
        recordedAt: new Date("2026-08-22T05:00:00.000Z"),
        createdAt: new Date("2026-08-22T05:00:00.000Z"),
        measurements: {
          weight: 72.5,
          waistCircumference: 90,
          systolicBloodPressure: 120,
          diastolicBloodPressure: 80,
          bloodSugar: 95,
        },
      },
    });
    expect(database.patientProgram.findFirst).toHaveBeenCalledWith({
      where: { id: programId, patientHospitalRelationshipId: relationshipId },
      select: expect.anything(),
    });
  });

  it("returns explicit absence without inferring from another domain", async () => {
    const database = createDatabase(null);

    await expect(
      getPatientFinalAssessmentForProgram(actor, programId, {
        database: database as unknown as PatientFinalAssessmentQueryDatabase,
      }),
    ).resolves.toMatchObject({
      patientProgramId: programId,
      patientHospitalRelationshipId: relationshipId,
      finalAssessment: null,
    });
  });

  it("fails closed when the exact Program cannot be read", async () => {
    mockedAccess.mockRejectedValue(new NotFoundError());

    await expect(
      getPatientFinalAssessmentForProgram(actor, programId, {
        database: createDatabase(null) as unknown as PatientFinalAssessmentQueryDatabase,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
