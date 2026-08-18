import { Prisma, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { PatientEvidenceStorage } from "../storage/patient-evidence-storage";
import { PatientEvidenceStorageError } from "../storage/patient-evidence-storage";
import type { PatientEvidenceCreateResult, PatientEvidenceDatabase } from "./patient-evidence-service";

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

import { createPatientEvidenceArtifact } from "./patient-evidence-service";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-08-17T06:00:00.000Z");

const actor: ActorContext = {
  userId: actorUserId,
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const access = {
  actor,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: "55555555-5555-4555-8555-555555555555", name: "โรงพยาบาล ก" },
  },
  target: {
    hospitalId: "55555555-5555-4555-8555-555555555555",
    hospitalStatus: "ACTIVE",
    assignedOsmUserId: null,
  },
};

function createStorage(): PatientEvidenceStorage & {
  uploadObject: ReturnType<typeof vi.fn<PatientEvidenceStorage["uploadObject"]>>;
  createTemporaryAccessUrl: ReturnType<typeof vi.fn<PatientEvidenceStorage["createTemporaryAccessUrl"]>>;
  removeObject: ReturnType<typeof vi.fn<PatientEvidenceStorage["removeObject"]>>;
} {
  return {
    uploadObject: vi.fn<PatientEvidenceStorage["uploadObject"]>(async () => undefined),
    createTemporaryAccessUrl: vi.fn<PatientEvidenceStorage["createTemporaryAccessUrl"]>(
      async () => "https://signed.example.invalid/temporary",
    ),
    removeObject: vi.fn<PatientEvidenceStorage["removeObject"]>(async () => undefined),
  };
}

function createDatabase(options: {
  transactionError?: unknown;
  artifactCreate?: (input: unknown) => Promise<unknown>;
} = {}): { database: PatientEvidenceDatabase; transaction: Prisma.TransactionClient } {
  const transaction = {
    patientEvidenceArtifact: {
      create:
        options.artifactCreate ??
        vi.fn(async () => ({
          id: artifactId,
          patientHospitalRelationshipId: relationshipId,
          mediaType: "image/jpeg",
          byteSize: 4,
          createdAt,
        })),
    },
  } as unknown as Prisma.TransactionClient;

  const database = {
    $transaction: vi.fn(async (callback: (transaction: Prisma.TransactionClient) => Promise<PatientEvidenceCreateResult>) => {
      if (options.transactionError) {
        throw options.transactionError;
      }

      return callback(transaction);
    }),
  } as unknown as PatientEvidenceDatabase;

  return { database, transaction };
}

describe("Patient Evidence creation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
    mockedRecordAuditEvent.mockResolvedValue(undefined);
  });

  it("uploads an opaque server-generated key and commits metadata plus audit", async () => {
    const storage = createStorage();
    const { database, transaction } = createDatabase();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

    const result = await createPatientEvidenceArtifact(
      actor,
      {
        relationshipId,
        declaredMediaType: "image/jpeg",
        bytes,
        caption: "  ภาพภาคสนาม  ",
      },
      {
        artifactIdFactory: () => artifactId,
        database,
        now: () => createdAt,
        storage,
      },
    );

    expect(result).toEqual({
      artifactId,
      patientHospitalRelationshipId: relationshipId,
      mediaType: "image/jpeg",
      byteSize: 4,
      createdAt,
    });
    expect(storage.uploadObject).toHaveBeenCalledWith({
      objectKey: `relationship-evidence/${artifactId}`,
      bytes,
      mediaType: "image/jpeg",
    });
    expect(storage.removeObject).not.toHaveBeenCalled();
    expect(mockedResolveAccess).toHaveBeenCalledTimes(2);
    expect(mockedRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        action: "patient_evidence_artifact.created",
        resourceId: artifactId,
        metadata: { artifactId, patientHospitalRelationshipId: relationshipId },
      }),
      transaction,
    );
  });

  it("does not create metadata or audit when storage upload fails", async () => {
    const storage = createStorage();
    storage.uploadObject.mockRejectedValue(new PatientEvidenceStorageError("upload"));
    const { database } = createDatabase();

    await expect(
      createPatientEvidenceArtifact(
        actor,
        {
          relationshipId,
          declaredMediaType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        },
        { database, storage },
      ),
    ).rejects.toBeInstanceOf(PatientEvidenceStorageError);

    expect(database.$transaction).not.toHaveBeenCalled();
    expect(mockedRecordAuditEvent).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("compensates the uploaded object when metadata or audit transaction fails", async () => {
    const storage = createStorage();
    const { database } = createDatabase({ transactionError: new Error("database unavailable") });

    await expect(
      createPatientEvidenceArtifact(
        actor,
        {
          relationshipId,
          declaredMediaType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        },
        { artifactIdFactory: () => artifactId, database, storage },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(storage.removeObject).toHaveBeenCalledWith({
      objectKey: `relationship-evidence/${artifactId}`,
    });
  });

  it("compensates when metadata creation succeeds but audit persistence fails", async () => {
    const storage = createStorage();
    const { database, transaction } = createDatabase();
    mockedRecordAuditEvent.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      createPatientEvidenceArtifact(
        actor,
        {
          relationshipId,
          declaredMediaType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        },
        { artifactIdFactory: () => artifactId, database, storage },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(storage.uploadObject).toHaveBeenCalled();
    expect(transaction.patientEvidenceArtifact.create).toHaveBeenCalled();
    expect(mockedRecordAuditEvent).toHaveBeenCalled();
    expect(storage.removeObject).toHaveBeenCalledWith({
      objectKey: `relationship-evidence/${artifactId}`,
    });
  });

  it("reports failure and records only a safe opaque id when compensation fails", async () => {
    const storage = createStorage();
    storage.removeObject.mockRejectedValue(new PatientEvidenceStorageError("remove"));
    const { database } = createDatabase({ transactionError: new Error("database unavailable") });
    const logOperationalError = vi.fn();

    await expect(
      createPatientEvidenceArtifact(
        actor,
        {
          relationshipId,
          declaredMediaType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
          caption: "ข้อมูลที่ไม่ควรอยู่ใน log",
        },
        { artifactIdFactory: () => artifactId, database, logOperationalError, storage },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(logOperationalError).toHaveBeenCalledWith({
      category: "storage_compensation_failed",
      artifactId,
    });
  });

  it("still fails and logs only an opaque id when audit and compensation both fail", async () => {
    const storage = createStorage();
    storage.removeObject.mockRejectedValue(new PatientEvidenceStorageError("remove"));
    const { database, transaction } = createDatabase();
    mockedRecordAuditEvent.mockRejectedValueOnce(new Error("audit unavailable"));
    const logOperationalError = vi.fn();

    await expect(
      createPatientEvidenceArtifact(
        actor,
        {
          relationshipId,
          declaredMediaType: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
          caption: "ข้อมูลที่ไม่ควรอยู่ใน log",
        },
        { artifactIdFactory: () => artifactId, database, logOperationalError, storage },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(storage.uploadObject).toHaveBeenCalled();
    expect(transaction.patientEvidenceArtifact.create).toHaveBeenCalled();
    expect(mockedRecordAuditEvent).toHaveBeenCalled();
    expect(storage.removeObject).toHaveBeenCalledWith({
      objectKey: `relationship-evidence/${artifactId}`,
    });
    expect(logOperationalError).toHaveBeenCalledTimes(1);
    expect(logOperationalError).toHaveBeenCalledWith({
      category: "storage_compensation_failed",
      artifactId,
    });
    expect(logOperationalError.mock.calls[0]?.[0]).toEqual({
      category: "storage_compensation_failed",
      artifactId,
    });
  });
});
