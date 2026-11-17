import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { PATIENT_ARTIFACT_CREATE_CAPABILITY } from "../policies/patient-evidence-policy";
import { PatientEvidenceStorageError, type PatientEvidenceStorage } from "../storage/patient-evidence-storage";
import type { PatientEvidenceDatabase } from "./patient-evidence-service";

const { mockedRecordAuditEvent, mockedResolveAccess } = vi.hoisted(() => ({
  mockedRecordAuditEvent: vi.fn(),
  mockedResolveAccess: vi.fn(),
}));

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedRecordAuditEvent,
}));
vi.mock("./patient-evidence-access-service", () => ({
  resolvePatientEvidenceAccessContext: mockedResolveAccess,
}));

import {
  PATIENT_EVIDENCE_ALREADY_REMOVED_MESSAGE,
  PATIENT_EVIDENCE_SERVICE_ONE_ASSOCIATED_MESSAGE,
  removePatientEvidenceArtifact,
} from "./patient-evidence-service";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "55555555-5555-4555-8555-555555555555";
const artifactId = "33333333-3333-4333-8333-333333333333";
const uploaderUserId = "22222222-2222-4222-8222-222222222222";
const otherUserId = "66666666-6666-4666-8666-666666666666";
const removedAt = new Date("2026-11-17T03:00:00.000Z");
const objectKey = `relationship-evidence/${artifactId}`;
const reason = "อัปโหลดผิดผู้ป่วย";

function actorWith(overrides: Partial<ActorContext>): ActorContext {
  return {
    userId: uploaderUserId,
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function hospitalActor(userId: string, membershipType: MembershipType): ActorContext {
  return actorWith({
    userId,
    hospitalMemberships: [
      { hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
    ],
  });
}

function osmActor(userId: string): ActorContext {
  return actorWith({
    userId,
    roles: [Role.OSM],
    osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  });
}

function accessFor(actor: ActorContext) {
  return {
    actor,
    patient: {
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
    },
    target: {
      hospitalId,
      hospitalStatus: HospitalStatus.ACTIVE,
      assignedOsmUserId: actor.roles.includes(Role.OSM) ? actor.userId : null,
    },
  };
}

type ArtifactRow = {
  id: string;
  storageObjectKey: string;
  createdByUserId: string;
  removedAt: Date | null;
  serviceOneArtifactAssociation: { id: string } | null;
};

function artifactRow(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: artifactId,
    storageObjectKey: objectKey,
    createdByUserId: uploaderUserId,
    removedAt: null,
    serviceOneArtifactAssociation: null,
    ...overrides,
  };
}

function createDatabase(options: { row?: ArtifactRow | null; updatedCount?: number; transactionError?: unknown } = {}) {
  const findFirst = vi.fn(async () => (options.row === undefined ? artifactRow() : options.row));
  const updateMany = vi.fn(async () => ({ count: options.updatedCount ?? 1 }));
  const transaction = { patientEvidenceArtifact: { findFirst, updateMany } } as unknown as Prisma.TransactionClient;
  const $transaction = vi.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, transactionOptions?: unknown) => {
    void transactionOptions;
    if (options.transactionError) {
      throw options.transactionError;
    }

    return callback(transaction);
  });

  return { database: { $transaction } as unknown as PatientEvidenceDatabase, findFirst, updateMany, transaction, $transaction };
}

function createStorage(): PatientEvidenceStorage & { removeObject: ReturnType<typeof vi.fn<PatientEvidenceStorage["removeObject"]>> } {
  return {
    uploadObject: vi.fn<PatientEvidenceStorage["uploadObject"]>(async () => undefined),
    createTemporaryAccessUrl: vi.fn<PatientEvidenceStorage["createTemporaryAccessUrl"]>(async () => "https://signed.example.invalid/x"),
    removeObject: vi.fn<PatientEvidenceStorage["removeObject"]>(async () => undefined),
  };
}

const input = { artifactId, relationshipId, reason: `  ${reason}  ` };

describe("Patient Evidence removal service (N4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("lets the uploader remove their photo: guarded soft removal, audit without the reason, then storage deletion", async () => {
    const actor = osmActor(uploaderUserId);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, updateMany, transaction, $transaction } = createDatabase();
    const storage = createStorage();

    const result = await removePatientEvidenceArtifact(actor, input, { database, storage, now: () => removedAt });

    expect(result).toEqual({ artifactId, patientHospitalRelationshipId: relationshipId, hospitalId, removedAt });
    expect(mockedResolveAccess).toHaveBeenCalledWith(actor, relationshipId, PATIENT_ARTIFACT_CREATE_CAPABILITY, transaction);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: artifactId, patientHospitalRelationshipId: relationshipId, removedAt: null },
      data: { removedAt, removedByUserId: uploaderUserId, removalReason: reason },
    });
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      {
        actorUserId: uploaderUserId,
        action: "patient_evidence_artifact.removed",
        resourceType: "PatientEvidenceArtifact",
        resourceId: artifactId,
        metadata: { artifactId, patientHospitalRelationshipId: relationshipId, hospitalId },
      },
      transaction,
    );
    expect(JSON.stringify(mockedRecordAuditEvent.mock.calls)).not.toContain(reason);
    expect(storage.removeObject).toHaveBeenCalledWith({ objectKey });
    expect(storage.removeObject.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockedRecordAuditEvent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("lets a direct Hospital %s remove another user's upload", async (type) => {
    const actor = hospitalActor(otherUserId, type);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, updateMany } = createDatabase();

    await removePatientEvidenceArtifact(actor, input, { database, storage: createStorage(), now: () => removedAt });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { removedAt, removedByUserId: otherUserId, removalReason: reason },
    }));
  });

  it("refuses an อสม. on another user's upload without writing", async () => {
    const actor = osmActor(otherUserId);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, updateMany } = createDatabase();
    const storage = createStorage();

    await expect(removePatientEvidenceArtifact(actor, input, { database, storage })).rejects.toBeInstanceOf(ForbiddenError);

    expect(updateMany).not.toHaveBeenCalled();
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("answers NotFound for an actor outside the relationship's scope and for an unknown artifact", async () => {
    const storage = createStorage();
    mockedResolveAccess.mockRejectedValueOnce(new NotFoundError());

    await expect(
      removePatientEvidenceArtifact(hospitalActor(otherUserId, MembershipType.OWNER), input, { database: createDatabase().database, storage }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const actor = hospitalActor(otherUserId, MembershipType.OWNER);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, findFirst, updateMany } = createDatabase({ row: null });

    await expect(removePatientEvidenceArtifact(actor, input, { database, storage })).rejects.toBeInstanceOf(NotFoundError);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: artifactId, patientHospitalRelationshipId: relationshipId },
    }));
    expect(updateMany).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("answers Conflict for a second removal, whether seen on read or lost on the guarded update", async () => {
    const actor = hospitalActor(otherUserId, MembershipType.OWNER);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const storage = createStorage();

    const alreadyRemoved = createDatabase({ row: artifactRow({ removedAt }) });
    await expect(removePatientEvidenceArtifact(actor, input, { database: alreadyRemoved.database, storage }))
      .rejects.toMatchObject({ message: PATIENT_EVIDENCE_ALREADY_REMOVED_MESSAGE });
    expect(alreadyRemoved.updateMany).not.toHaveBeenCalled();

    const lostRace = createDatabase({ updatedCount: 0 });
    await expect(removePatientEvidenceArtifact(actor, input, { database: lostRace.database, storage }))
      .rejects.toBeInstanceOf(ConflictError);
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("maps a serialization failure to Conflict", async () => {
    const actor = hospitalActor(otherUserId, MembershipType.OWNER);
    const serialization = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "test" });
    const { database } = createDatabase({ transactionError: serialization });

    await expect(removePatientEvidenceArtifact(actor, input, { database, storage: createStorage() }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it("blocks removal of a photo attached to a Service 1 activity", async () => {
    const actor = hospitalActor(otherUserId, MembershipType.OWNER);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, updateMany } = createDatabase({
      row: artifactRow({ serviceOneArtifactAssociation: { id: "77777777-7777-4777-8777-777777777777" } }),
    });
    const storage = createStorage();

    await expect(removePatientEvidenceArtifact(actor, input, { database, storage }))
      .rejects.toMatchObject({ code: "CONFLICT", message: PATIENT_EVIDENCE_SERVICE_ONE_ASSOCIATED_MESSAGE });
    expect(updateMany).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("still succeeds and logs only the opaque id when storage deletion fails after commit", async () => {
    const actor = osmActor(uploaderUserId);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database } = createDatabase();
    const storage = createStorage();
    storage.removeObject.mockRejectedValue(new PatientEvidenceStorageError("remove"));
    const logOperationalError = vi.fn();

    const result = await removePatientEvidenceArtifact(actor, input, {
      database,
      storage,
      logOperationalError,
      now: () => removedAt,
    });

    expect(result.artifactId).toBe(artifactId);
    expect(logOperationalError).toHaveBeenCalledTimes(1);
    expect(logOperationalError).toHaveBeenCalledWith({ category: "storage_removal_failed", artifactId });
  });

  it("does not delete storage when the transaction fails", async () => {
    const actor = osmActor(uploaderUserId);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    mockedRecordAuditEvent.mockRejectedValueOnce(new Error("audit unavailable"));
    const { database } = createDatabase();
    const storage = createStorage();

    await expect(removePatientEvidenceArtifact(actor, input, { database, storage })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it.each([
    ["a blank reason", { ...input, reason: "   " }],
    ["a reason over 500 characters", { ...input, reason: "ก".repeat(501) }],
    ["a missing reason", { artifactId, relationshipId }],
    ["a malformed artifact id", { ...input, artifactId: "not-a-uuid" }],
    ["an unknown key", { ...input, removedByUserId: otherUserId }],
  ])("rejects %s before any read", async (_label, badInput) => {
    const { database, $transaction } = createDatabase();

    await expect(removePatientEvidenceArtifact(osmActor(uploaderUserId), badInput, { database, storage: createStorage() }))
      .rejects.toBeInstanceOf(ValidationError);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("accepts a reason of exactly 500 characters after trimming", async () => {
    const actor = osmActor(uploaderUserId);
    mockedResolveAccess.mockResolvedValue(accessFor(actor));
    const { database, updateMany } = createDatabase();
    const longest = "ก".repeat(500);

    await removePatientEvidenceArtifact(actor, { ...input, reason: ` ${longest} ` }, { database, storage: createStorage(), now: () => removedAt });

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ removalReason: longest }),
    }));
  });
});
