import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  getGoalPlanCreateContext,
  getGoalPlanDetail,
  getGoalPlanOverview,
  type GoalQueryDatabase,
} from "./goal-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const otherRelationshipId = "33333333-3333-4333-8333-333333333333";
const goalPlanId = "44444444-4444-4444-8444-444444444444";
const screeningId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "66666666-6666-4666-8666-666666666666";

const result = {
  pamTotal: 10,
  promsTotal: 12,
  promsMin: 3,
  combinedTotal: 22,
  percentage: 50,
  level: "L3",
  zone: "YELLOW",
} as const;

const actor: ActorContext = {
  userId: actorUserId,
  personId: "77777777-7777-4777-8777-777777777777",
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

function createDatabase(overrides: {
  goalRecords?: Array<Record<string, unknown>>;
  detailRecord?: Record<string, unknown> | null;
  latestScreening?: Record<string, unknown> | null;
  screeningRecords?: Array<Record<string, unknown>>;
  membership?: boolean;
  screeningMembership?: boolean;
} = {}): GoalQueryDatabase {
  const actorRecord = {
    id: actorUserId,
    personId: actor.personId,
    status: UserStatus.ACTIVE,
    roles: [{ role: Role.HOSPITAL }],
    memberships: overrides.membership === false
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
  };
  const actorLookup = vi.fn().mockImplementation(async () => {
    if (overrides.screeningMembership === false && actorLookup.mock.calls.length > 1) {
      return { ...actorRecord, memberships: [] };
    }

    return actorRecord;
  });

  const database = {
    user: {
      findUnique: actorLookup,
    },
    patientHospitalRelationship: {
      findUnique: vi.fn().mockResolvedValue({
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
      }),
    },
    screeningAssessment: {
      findFirst: vi.fn().mockResolvedValue(
        overrides.latestScreening === undefined
          ? {
              id: screeningId,
              submittedAt: new Date("2026-08-16T05:00:00.000Z"),
              result,
            }
          : overrides.latestScreening,
      ),
      findMany: vi.fn().mockResolvedValue(
        overrides.screeningRecords ?? [
          {
            id: screeningId,
            submittedAt: new Date("2026-08-16T05:00:00.000Z"),
            result,
          },
        ],
      ),
    },
    patientGoalPlan: {
      findMany: vi.fn().mockResolvedValue(overrides.goalRecords ?? []),
      findFirst: vi.fn().mockResolvedValue(overrides.detailRecord ?? null),
    },
  };

  return database as unknown as GoalQueryDatabase;
}

function historyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: goalPlanId,
    roundNumber: 2,
    createdAt: new Date("2026-08-16T06:00:00.000Z"),
    primaryGoalCode: "weight",
    templateKey: "demi-goals",
    templateVersion: "legacy-prototype-v1",
    sourceScreeningAssessmentId: screeningId,
    createdByUser: { person: { givenName: "ผู้สร้าง", familyName: "แผน" } },
    _count: { items: 2 },
    ...overrides,
  };
}

function detailRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...historyRecord(),
    primaryGoalNote: "หมายเหตุเป้าหมาย",
    weeklyNote: "หมายเหตุรายสัปดาห์",
    items: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        activityCode: "stop_sweet",
        targetDays: 4,
        targetValue: null,
        targetUnit: null,
        sortOrder: 0,
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        activityCode: "exercise_walk",
        targetDays: 3,
        targetValue: 15,
        targetUnit: "minutes",
        sortOrder: 1,
      },
    ],
    ...overrides,
  };
}

describe("Goal Plan query service", () => {
  it("keeps Goal history readable when optional Screening context is denied", async () => {
    const database = createDatabase({ screeningMembership: false, goalRecords: [historyRecord()] });

    const overview = await getGoalPlanOverview(actor, relationshipId, { database });

    expect(overview.latestScreening).toBeNull();
    expect(overview.items).toHaveLength(1);
    expect(overview.items[0]?.sourceScreening).toBeNull();
    expect(JSON.stringify(overview)).not.toContain("pamTotal");
  });

  it("returns a relationship-scoped newest-first history projection", async () => {
    const database = createDatabase({ goalRecords: [historyRecord()] });

    const overview = await getGoalPlanOverview(actor, relationshipId, { database });

    expect(overview.patient).toMatchObject({
      patientHospitalRelationshipId: relationshipId,
      hospital: { id: hospitalId },
    });
    expect(overview.latest).toMatchObject({
      goalPlanId,
      roundNumber: 2,
      primaryGoalLabel: "น้ำหนักลด",
      activityCount: 2,
      sourceScreening: { result: { level: "L3", zone: "YELLOW" } },
    });
    expect(overview.items).toHaveLength(1);
    expect(overview.items[0]).not.toHaveProperty("primaryGoalNote");
    expect(JSON.stringify(overview)).not.toContain("identityKeyHash");
    expect(database.patientGoalPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: expect.objectContaining({ sourceScreeningAssessmentId: true }),
      }),
    );
    const goalQuery = vi.mocked(database.patientGoalPlan.findMany).mock.calls[0]?.[0];

    if (!goalQuery) {
      throw new Error("The Goal history query was not captured");
    }

    expect(goalQuery.select).not.toHaveProperty(
      "sourceScreeningAssessment",
    );
  });

  it("batch-enriches historical Screening sources without an N+1 query", async () => {
    const database = createDatabase({
      goalRecords: [
        historyRecord(),
        historyRecord({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          roundNumber: 1,
        }),
      ],
    });

    const overview = await getGoalPlanOverview(actor, relationshipId, { database });

    expect(overview.items).toHaveLength(2);
    expect(overview.items.every((item) => item.sourceScreening !== null)).toBe(true);
    expect(vi.mocked(database.screeningAssessment.findMany)).toHaveBeenCalledTimes(1);
  });

  it("resolves detail against the historical template and includes source context", async () => {
    const database = createDatabase({ detailRecord: detailRecord() });

    const detail = await getGoalPlanDetail(actor, relationshipId, goalPlanId, { database });

    expect(detail).toMatchObject({
      goalPlanId,
      roundNumber: 2,
      primaryGoalLabel: "น้ำหนักลด",
      primaryGoalNote: "หมายเหตุเป้าหมาย",
      weeklyNote: "หมายเหตุรายสัปดาห์",
      sourceScreening: { screeningAssessmentId: screeningId, result: { level: "L3" } },
      items: [
        { activityCode: "stop_sweet", activityLabel: "ลดหวาน", targetDays: 4 },
        { activityCode: "exercise_walk", targetValue: 15, targetUnit: "minutes" },
      ],
    });
  });

  it("loads an explicitly requested Screening only through the same relationship", async () => {
    const database = createDatabase();

    const context = await getGoalPlanCreateContext(actor, relationshipId, {
      database,
      requestedScreeningId: screeningId,
    });

    expect(context.latestScreening?.screeningAssessmentId).toBe(screeningId);
    expect(database.screeningAssessment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: screeningId,
          patientHospitalRelationshipId: relationshipId,
        },
      }),
    );
  });

  it("rejects a requested Screening that is not present in the relationship projection", async () => {
    const database = createDatabase({ latestScreening: null });

    await expect(
      getGoalPlanCreateContext(actor, relationshipId, {
        database,
        requestedScreeningId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not expose a historical Screening source when Screening read is denied", async () => {
    const database = createDatabase({ detailRecord: detailRecord(), screeningMembership: false });

    const detail = await getGoalPlanDetail(actor, relationshipId, goalPlanId, { database });

    expect(detail.sourceScreening).toBeNull();
  });

  it.each([
    ["unknown template version", { templateVersion: "unknown-version" }],
    ["unknown activity", { items: [{ id: "88888888-8888-4888-8888-888888888888", activityCode: "unknown", targetDays: 4, targetValue: null, targetUnit: null, sortOrder: 0 }] }],
  ] as const)("fails closed for %s", async (_label, overrides) => {
    const database = createDatabase({ detailRecord: detailRecord(overrides) });

    await expect(getGoalPlanDetail(actor, relationshipId, goalPlanId, { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });

  it("does not read another relationship's plan", async () => {
    const database = createDatabase({ detailRecord: null });

    await expect(getGoalPlanDetail(actor, otherRelationshipId, goalPlanId, { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("denies a Hospital actor without an active direct membership", async () => {
    const database = createDatabase({ membership: false });

    await expect(getGoalPlanOverview(actor, relationshipId, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

