import { Prisma, Role, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

const mockedResolveAccess = vi.hoisted(() => vi.fn());
const mockedSetInTransaction = vi.hoisted(() => vi.fn());

vi.mock("./patient-classification-access-service", () => ({
  resolvePatientClassificationAccessContext: mockedResolveAccess,
}));
vi.mock("./patient-classification-transaction", () => ({
  setPatientClassificationInTransaction: mockedSetInTransaction,
}));

import { setPatientClassification } from "./patient-classification-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientProfileId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-27T05:00:00.000Z");

const actor: ActorContext = {
  userId: actorUserId,
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const access = {
  actor,
  patient: {
    patientProfileId,
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
  },
  target: {
    hospitalId,
    hospitalStatus: "ACTIVE",
    assignedOsmUserId: null,
    patientRelationshipExists: true,
  },
} as const;

describe("Patient classification standalone service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
    mockedSetInTransaction.mockResolvedValue({
      operation: "CHANGED",
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      classification: "DIABETES",
      previousClassification: "RISK",
      changedAt: now,
      changedByUserId: actorUserId,
      source: "MANUAL",
      patientClassificationId: "66666666-6666-4666-8666-666666666666",
      historyId: "77777777-7777-4777-8777-777777777777",
    });
  });

  it("authorizes before the transaction and supplies a server-time manual mutation", async () => {
    const transaction = {} as Prisma.TransactionClient;
    const database = {
      $transaction: vi.fn(async (operation: (value: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction)),
    } as unknown as PrismaClient;

    const result = await setPatientClassification(
      actor,
      { patientHospitalRelationshipId: relationshipId, classification: "DIABETES" },
      { database, now: () => now },
    );

    expect(result).toMatchObject({ operation: "CHANGED", classification: "DIABETES" });
    expect(mockedResolveAccess).toHaveBeenCalledWith(
      actor,
      relationshipId,
      "patient:classification:manage",
      database,
    );
    expect(mockedSetInTransaction).toHaveBeenCalledWith(
      transaction,
      actor,
      {
        patientProfileId,
        patientHospitalRelationshipId: relationshipId,
        targetHospitalId: hospitalId,
        classification: "DIABETES",
        source: "MANUAL",
        explicitChangeConfirmation: true,
      },
      now,
    );
    expect(database.$transaction).toHaveBeenCalledOnce();
  });

  it("rejects invalid values and unauthenticated actors before persistence", async () => {
    const database = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(
      setPatientClassification(
        actor,
        { patientHospitalRelationshipId: relationshipId, classification: "UNKNOWN" },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setPatientClassification(null, {
        patientHospitalRelationshipId: relationshipId,
        classification: "RISK",
      }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
