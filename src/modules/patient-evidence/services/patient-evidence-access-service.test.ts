import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  PATIENT_ARTIFACT_CREATE_CAPABILITY,
  PATIENT_ARTIFACT_READ_CAPABILITY,
} from "../policies/patient-evidence-policy";
import { resolvePatientEvidenceAccessContext } from "./patient-evidence-access-service";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

const hospitalActor: ActorContext = {
  userId: actorUserId,
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const osmActor: ActorContext = {
  ...hospitalActor,
  roles: [Role.OSM],
};

function relationshipRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: relationshipId,
    hospitalId,
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก", status: HospitalStatus.ACTIVE },
    patientProfile: {
      person: {
        givenName: "สมชาย",
        familyName: "ผู้ป่วย",
        user: { roles: [{ role: Role.PATIENT }] },
      },
    },
    osmAssignments: [],
    ...overrides,
  };
}

function authoritativeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: actorUserId,
    personId: hospitalActor.personId,
    status: UserStatus.ACTIVE,
    roles: [{ role: Role.HOSPITAL }],
    memberships: [
      {
        hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function createDatabase(record: unknown = relationshipRecord(), user: unknown = authoritativeUser()): {
  database: Parameters<typeof resolvePatientEvidenceAccessContext>[3];
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(record);
  const findUnique = vi.fn().mockResolvedValue(user);

  return {
    database: {
      patientHospitalRelationship: { findFirst },
      user: { findUnique },
    } as unknown as Parameters<typeof resolvePatientEvidenceAccessContext>[3],
    findFirst,
    findUnique,
  };
}

describe("Patient Evidence relationship access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a direct Hospital actor after authoritative revalidation", async () => {
    const { database, findFirst, findUnique } = createDatabase();

    const result = await resolvePatientEvidenceAccessContext(
      hospitalActor,
      relationshipId,
      PATIENT_ARTIFACT_CREATE_CAPABILITY,
      database,
    );

    expect(result).toMatchObject({
      patient: {
        patientHospitalRelationshipId: relationshipId,
        displayName: "สมชาย ผู้ป่วย",
      },
      actor: { userId: actorUserId },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: relationshipId, OR: expect.any(Array) }),
      }),
    );
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: actorUserId } }));
  });

  it("allows an exact assigned OSM path", async () => {
    const { database } = createDatabase(
      relationshipRecord({ osmAssignments: [{ osmUserId: actorUserId }] }),
      authoritativeUser({
        roles: [{ role: Role.OSM }],
        memberships: [],
        osmHospitalRelationships: [
          { hospitalId, status: MembershipStatus.ACTIVE, hospital: { status: HospitalStatus.ACTIVE } },
        ],
      }),
    );

    await expect(
      resolvePatientEvidenceAccessContext(
        osmActor,
        relationshipId,
        PATIENT_ARTIFACT_READ_CAPABILITY,
        database,
      ),
    ).resolves.toMatchObject({ actor: { roles: [Role.OSM] } });
  });

  it.each(["wrong-hospital", "unassigned-osm", "nonexistent-relationship"])(
    "uses NotFound anti-enumeration for %s",
    async () => {
      const { database } = createDatabase(null);

      await expect(
        resolvePatientEvidenceAccessContext(
          hospitalActor,
          relationshipId,
          PATIENT_ARTIFACT_READ_CAPABILITY,
          database,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );

  it("uses Forbidden for an ADMIN-only actor without a possible artifact path", async () => {
    const { database, findFirst } = createDatabase();

    await expect(
      resolvePatientEvidenceAccessContext(
        { ...hospitalActor, roles: [Role.ADMIN] },
        relationshipId,
        PATIENT_ARTIFACT_READ_CAPABILITY,
        database,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(findFirst).not.toHaveBeenCalled();
  });
});
