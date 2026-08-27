import { Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError } from "@/shared/errors/application-error";

const mockedResolveAccess = vi.hoisted(() => vi.fn());
const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("./patient-classification-access-service", () => ({
  resolvePatientClassificationAccessContext: mockedResolveAccess,
}));
vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

import {
  PatientClassificationReconciliationRequiredError,
  PatientClassificationStaleConflictError,
  setPatientClassificationInTransaction,
} from "./patient-classification-transaction";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientProfileId = "33333333-3333-4333-8333-333333333333";
const classificationId = "44444444-4444-4444-8444-444444444444";
const historyId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "66666666-6666-4666-8666-666666666666";
const actorPersonId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-08-27T05:00:00.000Z");

const actor: ActorContext = {
  userId: actorUserId,
  personId: actorPersonId,
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

function createTransaction(existing: Record<string, unknown> | null = null): {
  transaction: Prisma.TransactionClient;
  patientClassification: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  patientClassificationHistory: { create: ReturnType<typeof vi.fn> };
} {
  const patientClassification = {
    findUnique: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({
      id: classificationId,
      patientProfileId,
      classification: "RISK",
      updatedByUserId: actorUserId,
    }),
    update: vi.fn().mockResolvedValue({
      id: classificationId,
      patientProfileId,
      classification: "DIABETES",
      updatedByUserId: actorUserId,
    }),
  };
  const patientClassificationHistory = {
    create: vi.fn().mockResolvedValue({ id: historyId }),
  };

  return {
    transaction: {
      patientClassification,
      patientClassificationHistory,
    } as unknown as Prisma.TransactionClient,
    patientClassification,
    patientClassificationHistory,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    patientProfileId,
    patientHospitalRelationshipId: relationshipId,
    targetHospitalId: hospitalId,
    classification: "RISK" as const,
    source: "MANUAL" as const,
    ...overrides,
  };
}

describe("Patient classification transaction seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
    mockedAudit.mockResolvedValue(undefined);
  });

  it("creates current state, initial history, and audit on one supplied transaction", async () => {
    const { transaction, patientClassification, patientClassificationHistory } = createTransaction();

    const result = await setPatientClassificationInTransaction(
      transaction,
      actor,
      request({ classification: "RISK" }),
      now,
    );

    expect(result).toMatchObject({
      operation: "CREATED",
      classification: "RISK",
      previousClassification: null,
      changedAt: now,
      changedByUserId: actorUserId,
      historyId,
    });
    expect(patientClassification.create).toHaveBeenCalledWith({
      data: {
        patientProfileId,
        classification: "RISK",
        updatedByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      },
      select: expect.anything(),
    });
    expect(patientClassificationHistory.create).toHaveBeenCalledWith({
      data: {
        patientProfileId,
        fromClassification: null,
        toClassification: "RISK",
        changedAt: now,
        changedByUserId: actorUserId,
        source: "MANUAL",
      },
      select: { id: true },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: actorUserId,
        action: "patient_classification.created",
        resourceType: "PatientClassification",
        resourceId: classificationId,
        metadata: {
          patientProfileId,
          fromClassification: null,
          toClassification: "RISK",
          source: "MANUAL",
        },
      }),
      transaction,
    );
  });

  it("returns a same-value NOOP without history or audit", async () => {
    const { transaction, patientClassification, patientClassificationHistory } = createTransaction({
      id: classificationId,
      patientProfileId,
      classification: "RISK",
      updatedByUserId: actorUserId,
    });

    const result = await setPatientClassificationInTransaction(
      transaction,
      actor,
      request({ classification: "RISK" }),
      now,
    );

    expect(result).toMatchObject({ operation: "NOOP", previousClassification: "RISK" });
    expect(patientClassification.create).not.toHaveBeenCalled();
    expect(patientClassification.update).not.toHaveBeenCalled();
    expect(patientClassificationHistory.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("requires explicit reconciliation for a roster change", async () => {
    const { transaction, patientClassification, patientClassificationHistory } = createTransaction({
      id: classificationId,
      patientProfileId,
      classification: "RISK",
      updatedByUserId: actorUserId,
    });

    await expect(
      setPatientClassificationInTransaction(
        transaction,
        actor,
        request({
          classification: "DIABETES",
          source: "ROSTER_IMPORT",
        }),
        now,
      ),
    ).rejects.toBeInstanceOf(PatientClassificationReconciliationRequiredError);
    expect(patientClassification.update).not.toHaveBeenCalled();
    expect(patientClassificationHistory.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("changes in either direction with expected-current recheck, history, and audit", async () => {
    const { transaction, patientClassification, patientClassificationHistory } = createTransaction({
      id: classificationId,
      patientProfileId,
      classification: "RISK",
      updatedByUserId: actorUserId,
    });

    const result = await setPatientClassificationInTransaction(
      transaction,
      actor,
      request({
        classification: "DIABETES",
        source: "ROSTER_IMPORT",
        expectedCurrentClassification: "RISK",
        explicitChangeConfirmation: true,
      }),
      now,
    );

    expect(result).toMatchObject({
      operation: "CHANGED",
      previousClassification: "RISK",
      classification: "DIABETES",
      source: "ROSTER_IMPORT",
    });
    expect(patientClassification.update).toHaveBeenCalledWith({
      where: { id: classificationId },
      data: {
        classification: "DIABETES",
        updatedByUserId: actorUserId,
        updatedAt: now,
      },
      select: expect.anything(),
    });
    expect(patientClassificationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromClassification: "RISK",
        toClassification: "DIABETES",
        source: "ROSTER_IMPORT",
        changedByUserId: actorUserId,
        changedAt: now,
      }),
      select: { id: true },
    });
    expect(mockedAudit).toHaveBeenCalledOnce();
  });

  it("rejects a stale expected value before writing a transition", async () => {
    const { transaction, patientClassification, patientClassificationHistory } = createTransaction({
      id: classificationId,
      patientProfileId,
      classification: "DIABETES",
      updatedByUserId: actorUserId,
    });

    await expect(
      setPatientClassificationInTransaction(
        transaction,
        actor,
        request({
          classification: "RISK",
          expectedCurrentClassification: "RISK",
          explicitChangeConfirmation: true,
        }),
        now,
      ),
    ).rejects.toBeInstanceOf(PatientClassificationStaleConflictError);
    expect(patientClassification.update).not.toHaveBeenCalled();
    expect(patientClassificationHistory.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("does not hide an audit failure from the caller-owned transaction", async () => {
    const { transaction, patientClassificationHistory } = createTransaction();
    mockedAudit.mockRejectedValueOnce(new InfrastructureError("audit unavailable"));

    await expect(
      setPatientClassificationInTransaction(transaction, actor, request(), now),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(patientClassificationHistory.create).toHaveBeenCalledOnce();
    expect(mockedAudit.mock.calls[0]?.[1]).toBe(transaction);
    expect(transaction).not.toHaveProperty("$transaction");
  });
});
