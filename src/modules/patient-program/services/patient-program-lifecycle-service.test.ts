import { HospitalStatus, Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedAccess = vi.hoisted(() => vi.fn());
const mockedOwnRelationship = vi.hoisted(() => vi.fn());
const mockedCurrentRound = vi.hoisted(() => vi.fn());
const mockedPolicy = vi.hoisted(() => vi.fn());

vi.mock("./patient-program-access-service", () => ({
  resolvePatientProgramByIdAccessContext: mockedAccess,
}));

vi.mock("@/modules/patient-self/services/patient-self-query-service", () => ({
  resolveOwnPatientRelationshipContext: mockedOwnRelationship,
}));

vi.mock("@/modules/patient-program-rounds/services/round-sequencing", () => ({
  currentOpenRound: mockedCurrentRound,
}));

vi.mock("@/modules/patient-self/policies/patient-self-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/patient-self/policies/patient-self-policy")>();
  mockedPolicy.mockImplementation(actual.decidePatientSelfRoundRecordPolicy);

  return { ...actual, decidePatientSelfRoundRecordPolicy: mockedPolicy };
});

import { RoundConflictError } from "@/modules/patient-program-rounds/domain/round-conflict-error";

import { lockActivePatientProgram } from "./patient-program-lifecycle-service";

const programId = "33333333-3333-4333-8333-333333333333";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "11111111-1111-4111-8111-111111111111";

const patient: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

function createTransaction(planStepCodes: readonly string[]) {
  return {
    patientProgram: {
      findUnique: vi.fn().mockResolvedValue({
        patientHospitalRelationshipId: relationshipId,
        patientHospitalRelationship: { hospitalId },
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: programId,
        patientHospitalRelationshipId: relationshipId,
        status: "ACTIVE",
        completedAt: null,
        startedAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    patientProgramRoundPlanItem: {
      findMany: vi.fn().mockResolvedValue(planStepCodes.map((stepCode) => ({ stepCode }))),
    },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAccess.mockRejectedValue(new ForbiddenError());
  mockedOwnRelationship.mockResolvedValue({
    relationshipId,
    careEndedAt: null,
    hospitalStatus: HospitalStatus.ACTIVE,
    hospitalNumber: "HN-1",
    hospitalName: "โรงพยาบาลทดสอบ",
  });
  mockedCurrentRound.mockResolvedValue(1);
});

describe("lockActivePatientProgram on the patient self-recording path (FR-7)", () => {
  it("passes the computed relationship and Program state to the self-recording policy", async () => {
    const context = await lockActivePatientProgram(createTransaction(["VITALS"]), patient, programId, {
      stepCode: "VITALS",
      roundNumber: 1,
    });

    expect(context).toMatchObject({ patientSelfRecording: true, recordingRoundNumber: 1 });
    expect(mockedPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        ownActiveRelationship: true,
        programActive: true,
        roundNumber: 1,
        currentOpenRoundNumber: 1,
        stepCode: "VITALS",
        activePlanStepCodes: ["VITALS"],
      }),
    );
  });

  it("enforces a policy denial", async () => {
    await expect(
      lockActivePatientProgram(createTransaction([]), patient, programId, { stepCode: "VITALS", roundNumber: 1 }),
    ).rejects.toBeInstanceOf(RoundConflictError);
    expect(mockedPolicy).toHaveReturnedWith(expect.objectContaining({ allowed: false }));
  });

  it("denies an ended relationship before the policy (defence in depth)", async () => {
    mockedOwnRelationship.mockResolvedValue({
      relationshipId,
      careEndedAt: new Date("2026-10-02T00:00:00.000Z"),
      hospitalStatus: HospitalStatus.ACTIVE,
      hospitalNumber: "HN-1",
      hospitalName: "โรงพยาบาลทดสอบ",
    });

    await expect(
      lockActivePatientProgram(createTransaction(["VITALS"]), patient, programId, { stepCode: "VITALS", roundNumber: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedPolicy).not.toHaveBeenCalled();
  });
});
