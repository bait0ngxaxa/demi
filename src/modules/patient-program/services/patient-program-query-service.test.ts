import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  getPatientProgramDetail,
  getPatientProgramPageContext,
  type PatientProgramQueryDatabase,
} from "./patient-program-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const activeProgramId = "33333333-3333-4333-8333-333333333333";
const completedProgramId = "44444444-4444-4444-8444-444444444444";
const baselineId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "66666666-6666-4666-8666-666666666666";
const personId = "77777777-7777-4777-8777-777777777777";
const startedAt = new Date("2026-08-17T05:00:00.000Z");
const completedAt = new Date("2026-08-18T05:00:00.000Z");

const actor: ActorContext = {
  userId: actorUserId,
  personId,
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

function relationshipRecord(
  id = relationshipId,
): Record<string, unknown> {
  return {
    id,
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
  };
}

function programRecord(
  id: string,
  status: PatientProgramStatus,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    patientHospitalRelationshipId: relationshipId,
    status,
    startedAt,
    completedAt: status === PatientProgramStatus.COMPLETED ? completedAt : null,
    createdAt: startedAt,
    createdByUser: {
      id: actorUserId,
      person: { givenName: "ผู้บันทึก", familyName: "โปรแกรม" },
    },
    initialBaseline:
      status === PatientProgramStatus.COMPLETED
        ? { id: baselineId, recordedOn: new Date("2026-08-16T00:00:00.000Z") }
        : null,
    ...overrides,
  };
}

function createDatabase(input: {
  relationship?: Record<string, unknown> | null;
  history?: Record<string, unknown>[];
  detail?: Record<string, unknown> | null;
  membership?: boolean;
} = {}): PatientProgramQueryDatabase & {
  patientHospitalRelationship: { findFirst: ReturnType<typeof vi.fn> };
  patientProgram: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
} {
  const database = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: actorUserId,
        personId,
        status: UserStatus.ACTIVE,
        roles: [{ role: Role.HOSPITAL }],
        memberships: input.membership === false
          ? []
          : [
              {
                hospitalId,
                membershipType: MembershipType.MEMBER,
                profession: null,
                status: MembershipStatus.ACTIVE,
                hospital: { status: HospitalStatus.ACTIVE },
              },
            ],
        osmHospitalRelationships: [],
      }),
    },
    patientHospitalRelationship: {
      findFirst: vi.fn().mockResolvedValue(
        input.relationship === undefined ? relationshipRecord() : input.relationship,
      ),
    },
    patientProgram: {
      findMany: vi.fn().mockResolvedValue(input.history ?? []),
      findFirst: vi.fn().mockResolvedValue(input.detail ?? null),
    },
  } as unknown as PatientProgramQueryDatabase & {
    patientHospitalRelationship: { findFirst: ReturnType<typeof vi.fn> };
    patientProgram: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  return database;
}

describe("Patient Program query service", () => {
  it("returns active and historical projections in relationship scope", async () => {
    const database = createDatabase({
      history: [
        programRecord(completedProgramId, PatientProgramStatus.COMPLETED),
        programRecord(activeProgramId, PatientProgramStatus.ACTIVE),
      ],
    });

    const result = await getPatientProgramPageContext(actor, relationshipId, { database });

    expect(result).toMatchObject({
      patient: {
        patientHospitalRelationshipId: relationshipId,
        displayName: "สมชาย ผู้ป่วย",
        hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
      },
      active: { programId: activeProgramId, status: PatientProgramStatus.ACTIVE },
      history: [
        { programId: completedProgramId, status: PatientProgramStatus.COMPLETED },
        { programId: activeProgramId, status: PatientProgramStatus.ACTIVE },
      ],
      canOpen: false,
      canManage: true,
    });
    expect(result.history[0]?.initialBaseline).toEqual({
      id: baselineId,
      recordedOn: new Date("2026-08-16T00:00:00.000Z"),
    });
    expect(JSON.stringify(result)).not.toContain("memberships");
    expect(database.patientProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientHospitalRelationshipId: relationshipId },
        take: 50,
      }),
    );
  });

  it("allows opening when there is no active episode and exposes no clinical values", async () => {
    const database = createDatabase({
      history: [programRecord(completedProgramId, PatientProgramStatus.COMPLETED)],
    });

    const result = await getPatientProgramPageContext(actor, relationshipId, { database });

    expect(result.active).toBeNull();
    expect(result.canOpen).toBe(true);
    expect(JSON.stringify(result)).not.toContain("weight");
    expect(JSON.stringify(result)).not.toContain("bloodPressure");
  });

  it("denies the page when the actor's authoritative Hospital scope is inactive", async () => {
    const database = createDatabase({ membership: false });

    await expect(getPatientProgramPageContext(actor, relationshipId, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(database.patientProgram.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when a Program belongs to another exact relationship", async () => {
    const database = createDatabase({ detail: null });

    await expect(
      getPatientProgramDetail(actor, relationshipId, activeProgramId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(database.patientProgram.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: activeProgramId,
          patientHospitalRelationshipId: relationshipId,
        },
      }),
    );
  });

  it("does not return a Program when the relationship itself is outside scope", async () => {
    const database = createDatabase({ relationship: null });

    await expect(
      getPatientProgramDetail(actor, relationshipId, activeProgramId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(database.patientProgram.findFirst).not.toHaveBeenCalled();
  });
});
