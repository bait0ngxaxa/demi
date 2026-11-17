import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { PatientEvidenceStorage } from "../storage/patient-evidence-storage";
import {
  PATIENT_EVIDENCE_LIST_LIMIT,
  PATIENT_EVIDENCE_SIGNED_URL_EXPIRY_SECONDS,
} from "../schemas/patient-evidence-schemas";
import type { PatientEvidenceAccessDatabase } from "./patient-evidence-access-service";

const mockedResolveAccess = vi.hoisted(() => vi.fn());

vi.mock("./patient-evidence-access-service", () => ({
  resolvePatientEvidenceAccessContext: mockedResolveAccess,
}));

import {
  getPatientEvidenceArtifactAccess,
  getPatientEvidencePageContext,
  listPatientEvidenceArtifacts,
} from "./patient-evidence-query-service";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
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

function createDatabase(): {
  database: PatientEvidenceAccessDatabase;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: artifactId,
      patientHospitalRelationshipId: relationshipId,
      mediaType: "image/jpeg",
      byteSize: 4,
      caption: "คำอธิบาย",
      createdAt: new Date("2026-08-17T06:00:00.000Z"),
      serviceOneArtifactAssociation: null,
      createdByUser: {
        id: actor.userId,
        person: { givenName: "ผู้", familyName: "บันทึก" },
      },
    },
  ]);
  const findFirst = vi.fn();

  return {
    database: {
      patientEvidenceArtifact: { findMany, findFirst },
    } as unknown as PatientEvidenceAccessDatabase,
    findMany,
    findFirst,
  };
}

describe("Patient Evidence bounded queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
  });

  it("returns a bounded safe projection newest-first", async () => {
    const { database, findMany } = createDatabase();

    const result = await listPatientEvidenceArtifacts(actor, relationshipId, { database });

    expect(result).toEqual([
      {
        id: artifactId,
        patientHospitalRelationshipId: relationshipId,
        mediaType: "image/jpeg",
        byteSize: 4,
        caption: "คำอธิบาย",
        createdAt: new Date("2026-08-17T06:00:00.000Z"),
        creator: { id: actor.userId, displayName: "ผู้ บันทึก" },
        serviceOneAssociated: false,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientHospitalRelationshipId: relationshipId, removedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PATIENT_EVIDENCE_LIST_LIMIT,
      }),
    );
    expect(JSON.stringify(result)).not.toContain("storageObjectKey");
    expect(JSON.stringify(result)).not.toContain("authSubject");
  });

  it("constrains artifact lookup by both artifact and relationship", async () => {
    const { database, findFirst } = createDatabase();
    findFirst.mockResolvedValue(null);

    await expect(
      getPatientEvidenceArtifactAccess(actor, relationshipId, artifactId, { database }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: artifactId, patientHospitalRelationshipId: relationshipId, removedAt: null },
      }),
    );
  });

  it("creates a short-lived URL only after the exact artifact is found", async () => {
    const { database, findFirst } = createDatabase();
    findFirst.mockResolvedValue({
      id: artifactId,
      patientHospitalRelationshipId: relationshipId,
      storageObjectKey: `relationship-evidence/${artifactId}`,
      mediaType: "image/jpeg",
    });
    const createTemporaryAccessUrl = vi
      .fn<PatientEvidenceStorage["createTemporaryAccessUrl"]>()
      .mockResolvedValue("https://signed.example.invalid/short-lived");
    const storage = {
      createTemporaryAccessUrl,
      removeObject: vi.fn<PatientEvidenceStorage["removeObject"]>(),
      uploadObject: vi.fn<PatientEvidenceStorage["uploadObject"]>(),
    } satisfies PatientEvidenceStorage;

    const result = await getPatientEvidenceArtifactAccess(actor, relationshipId, artifactId, {
      database,
      storage,
    });

    expect(result.temporaryAccessUrl).toBe("https://signed.example.invalid/short-lived");
    expect(createTemporaryAccessUrl).toHaveBeenCalledWith({
      objectKey: `relationship-evidence/${artifactId}`,
      expiresInSeconds: PATIENT_EVIDENCE_SIGNED_URL_EXPIRY_SECONDS,
    });
  });
});

describe("Patient Evidence page removal flags (N4)", () => {
  const hospitalId = access.target.hospitalId;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAccess.mockResolvedValue(access);
  });
  const otherUserId = "66666666-6666-4666-8666-666666666666";

  function listRecord(id: string, createdByUserId: string, associated = false): Record<string, unknown> {
    return {
      id,
      patientHospitalRelationshipId: relationshipId,
      mediaType: "image/jpeg",
      byteSize: 4,
      caption: null,
      createdAt: new Date("2026-08-17T06:00:00.000Z"),
      serviceOneArtifactAssociation: associated ? { id: "77777777-7777-4777-8777-777777777777" } : null,
      createdByUser: { id: createdByUserId, person: { givenName: "ผู้", familyName: "บันทึก" } },
    };
  }

  const ownUpload = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherUpload = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const associatedUpload = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function databaseWithRecords(): PatientEvidenceAccessDatabase {
    return {
      patientEvidenceArtifact: {
        findMany: vi.fn().mockResolvedValue([
          listRecord(ownUpload, actor.userId),
          listRecord(otherUpload, otherUserId),
          listRecord(associatedUpload, actor.userId, true),
        ]),
      },
    } as unknown as PatientEvidenceAccessDatabase;
  }

  function removable(context: Awaited<ReturnType<typeof getPatientEvidencePageContext>>): Record<string, boolean> {
    return Object.fromEntries(context.artifacts.map((artifact) => [artifact.id, artifact.canRemove]));
  }

  it("lets a direct Hospital member remove any unassociated photo", async () => {
    const member: ActorContext = {
      ...actor,
      hospitalMemberships: [
        { hospitalId, membershipType: "MEMBER", profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" },
      ],
    };
    mockedResolveAccess.mockResolvedValue({ ...access, actor: member });

    const context = await getPatientEvidencePageContext(member, relationshipId, { database: databaseWithRecords() });

    expect(removable(context)).toEqual({ [ownUpload]: true, [otherUpload]: true, [associatedUpload]: false });
    expect(context.artifacts.find(({ id }) => id === associatedUpload)?.serviceOneAssociated).toBe(true);
  });

  it("lets an assigned อสม. remove only their own uploads", async () => {
    const osm: ActorContext = {
      ...actor,
      roles: [Role.OSM],
      osmHospitalRelationships: [{ hospitalId, status: "ACTIVE", hospitalStatus: "ACTIVE" }],
    };
    mockedResolveAccess.mockResolvedValue({
      ...access,
      actor: osm,
      target: { ...access.target, assignedOsmUserId: osm.userId },
    });

    const context = await getPatientEvidencePageContext(osm, relationshipId, { database: databaseWithRecords() });

    expect(removable(context)).toEqual({ [ownUpload]: true, [otherUpload]: false, [associatedUpload]: false });
  });

  it("offers no removal to a reader who cannot upload (network read)", async () => {
    // No direct membership and no assignment: the read resolved through the network fallback.
    const context = await getPatientEvidencePageContext(actor, relationshipId, { database: databaseWithRecords() });

    expect(context.canCreate).toBe(false);
    expect(removable(context)).toEqual({ [ownUpload]: false, [otherUpload]: false, [associatedUpload]: false });
  });
});
