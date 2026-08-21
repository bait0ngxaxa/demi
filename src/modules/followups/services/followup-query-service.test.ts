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
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

const mockedGoalOptions = vi.hoisted(() => vi.fn());
const mockedProgramGoalOptions = vi.hoisted(() => vi.fn());
const mockedPreProgramGoalOptions = vi.hoisted(() => vi.fn());
const mockedGoalDetail = vi.hoisted(() => vi.fn());
const mockedProgramGoalDetail = vi.hoisted(() => vi.fn());
const mockedFollowupAccessState = vi.hoisted(() => ({ denyRecord: false }));

vi.mock("./followup-access-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./followup-access-service")>();

  return {
    ...actual,
    resolveFollowupAccessContext: vi.fn(
      async (
        actor: Parameters<typeof actual.resolveFollowupAccessContext>[0],
        relationshipId: Parameters<typeof actual.resolveFollowupAccessContext>[1],
        capability: Parameters<typeof actual.resolveFollowupAccessContext>[2],
        database: Parameters<typeof actual.resolveFollowupAccessContext>[3],
      ) => {
        if (mockedFollowupAccessState.denyRecord && capability === "followup:record") {
          throw new ForbiddenError();
        }

        return actual.resolveFollowupAccessContext(actor, relationshipId, capability, database);
      },
    ),
  };
});

vi.mock("@/modules/goals/services/goal-query-service", () => ({
  getAccessibleGoalPlanOptions: mockedGoalOptions,
  getAccessibleGoalPlanOptionsForProgram: mockedProgramGoalOptions,
  getAccessiblePreProgramGoalPlanOptions: mockedPreProgramGoalOptions,
  getAccessibleGoalPlanActivityContext: mockedGoalDetail,
  getAccessibleGoalPlanActivityContextForProgram: mockedProgramGoalDetail,
}));

import {
  getFollowupCreateContext,
  getFollowupCreateContextForProgram,
  getFollowupDetail,
  getFollowupDetailForProgram,
  getFollowupHistory,
  getFollowupHistoryForProgram,
  type FollowupQueryDatabase,
} from "./followup-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const followupId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const goalPlanId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "66666666-6666-4666-8666-666666666666";
const personId = "77777777-7777-4777-8777-777777777777";
const recordedAt = new Date("2026-08-17T05:00:00.000Z");
const programId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherProgramId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

const goalPlan = {
  goalPlanId,
  roundNumber: 2,
  createdAt: recordedAt,
  primaryGoalCode: "weight",
  primaryGoalLabel: "น้ำหนักลด (Weight Reduction)",
  primaryGoalNote: "หมายเหตุเป้าหมาย",
  weeklyNote: "หมายเหตุสัปดาห์",
  items: [
    {
      goalPlanItemId: "88888888-8888-4888-8888-888888888888",
      activityCode: "exercise_walk",
      activityLabel: "เดิน",
      targetDays: 3,
      targetValue: 30,
      targetUnit: "minutes",
      sortOrder: 0,
    },
  ],
};

function createDatabase(overrides: {
  followupHistory?: Array<Record<string, unknown>>;
  detail?: Record<string, unknown> | null;
  membership?: boolean;
  appointmentOptions?: Array<Record<string, unknown>>;
} = {}): FollowupQueryDatabase {
  const database = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: actorUserId,
        personId,
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
      }),
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
      findFirst: vi.fn().mockResolvedValue({
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
    patientProgram: {
      findFirst: vi.fn().mockImplementation(async (query: { where?: { id?: string } }) => {
        return query.where?.id === programId
          ? {
              id: programId,
              patientHospitalRelationshipId: relationshipId,
              status: "ACTIVE",
            }
          : null;
      }),
    },
    patientAppointment: {
      findMany: vi.fn().mockResolvedValue(
        overrides.appointmentOptions ?? [
          {
            id: appointmentId,
            patientHospitalRelationshipId: relationshipId,
            type: "FOLLOW_UP",
            scheduledAt: recordedAt,
          },
        ],
      ),
    },
    patientFollowup: {
      findMany: vi.fn().mockImplementation(async (query: { where?: { patientProgramId?: string } }) => {
        const records = overrides.followupHistory ?? [];
        const requestedProgramId = query.where?.patientProgramId;

        return requestedProgramId
          ? records.filter((record) => record.patientProgramId === requestedProgramId)
          : records;
      }),
      findFirst: vi.fn().mockImplementation(async (query: { where?: { patientProgramId?: string } }) => {
        const record = overrides.detail ?? null;
        const requestedProgramId = query.where?.patientProgramId;

        if (requestedProgramId && record?.patientProgramId !== requestedProgramId) {
          return null;
        }

        return record;
      }),
      count: vi.fn().mockImplementation(async (query: { where?: { patientProgramId?: string } }) => {
        const records = overrides.followupHistory ?? [];
        const requestedProgramId = query.where?.patientProgramId;

        return requestedProgramId
          ? records.filter((record) => record.patientProgramId === requestedProgramId).length
          : records.length;
      }),
    },
  };

  return database as unknown as FollowupQueryDatabase;
}

function historyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: followupId,
    patientProgramId: null,
    roundNumber: 2,
    recordedAt,
    createdByUser: { person: { givenName: "ผู้บันทึก", familyName: "รอบแรก" } },
    appointment: {
      id: appointmentId,
      patientHospitalRelationshipId: relationshipId,
      type: "FOLLOW_UP",
      scheduledAt: recordedAt,
    },
    sourceGoalPlan: { id: goalPlanId, patientHospitalRelationshipId: relationshipId, roundNumber: 1 },
    ...overrides,
  };
}

function detailRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: followupId,
    patientProgramId: null,
    sourceGoalPlanId: goalPlanId,
    roundNumber: 2,
    recordedAt,
    createdAt: recordedAt,
    weight: 72.5,
    waistCircumference: null,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: null,
    confidenceScore: 7,
    reflectionNote: "สะท้อน",
    confidencePlan: "ทำต่อ",
    generalNote: "ทั่วไป",
    createdByUser: { person: { givenName: "ผู้บันทึก", familyName: "รอบแรก" } },
    appointment: {
      id: appointmentId,
      patientHospitalRelationshipId: relationshipId,
      type: "FOLLOW_UP",
      scheduledAt: recordedAt,
    },
    activityProgress: [
      { id: "99999999-9999-4999-8999-999999999999", goalActivityCode: "exercise_walk", status: "DONE", note: "ทำได้" },
    ],
    ...overrides,
  };
}

describe("Follow-up query service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFollowupAccessState.denyRecord = false;
    mockedGoalOptions.mockReset();
    mockedGoalOptions.mockResolvedValue([]);
    mockedProgramGoalOptions.mockReset();
    mockedProgramGoalOptions.mockResolvedValue([]);
    mockedPreProgramGoalOptions.mockReset();
    mockedPreProgramGoalOptions.mockResolvedValue([]);
    mockedGoalDetail.mockReset();
    mockedProgramGoalDetail.mockReset();
  });

  it("returns relationship-scoped newest-first minimal history with a bounded query", async () => {
    const database = createDatabase({ followupHistory: [historyRecord()] });

    const history = await getFollowupHistory(actor, relationshipId, { database });

    expect(history).toMatchObject({
      patient: { patientHospitalRelationshipId: relationshipId, hospital: { id: hospitalId } },
      canRecord: true,
      items: [
        {
          followupId,
          roundNumber: 2,
          appointment: { appointmentId },
          sourceGoalPlan: { goalPlanId, roundNumber: 1 },
        },
      ],
    });
    expect(database.patientFollowup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      }),
    );
    const query = vi.mocked(database.patientFollowup.findMany).mock.calls[0]?.[0];
    expect(query?.select).not.toHaveProperty("reflectionNote");
    expect(JSON.stringify(history)).not.toContain("สะท้อน");
  });

  it("keeps Program Follow-up history isolated from other Programs and pre-Program records", async () => {
    const database = createDatabase({
      followupHistory: [
        historyRecord({ patientProgramId: programId }),
        historyRecord({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          patientProgramId: otherProgramId,
        }),
        historyRecord({
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          patientProgramId: null,
        }),
      ],
    });

    const history = await getFollowupHistoryForProgram(actor, programId, { database });

    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ followupId, patientProgramId: programId });
    expect(history.totalCount).toBe(1);
    expect(database.patientFollowup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientProgramId: programId,
          patientHospitalRelationshipId: relationshipId,
        },
      }),
    );
  });

  it("derives canRecord independently and keeps history readable when record is denied", async () => {
    const database = createDatabase({ followupHistory: [historyRecord()] });
    mockedFollowupAccessState.denyRecord = true;

    const history = await getFollowupHistory(actor, relationshipId, { database });

    expect(history.canRecord).toBe(false);
    expect(history.items).toHaveLength(1);
  });

  it("requires followup:record for New Follow-up setup", async () => {
    mockedFollowupAccessState.denyRecord = true;

    await expect(getFollowupCreateContext(actor, relationshipId, undefined, { database: createDatabase() })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("loads only completed Appointment options and pre-Program Goal Plan options", async () => {
    mockedPreProgramGoalOptions.mockResolvedValueOnce([goalPlan]);
    const database = createDatabase();

    const context = await getFollowupCreateContext(actor, relationshipId, appointmentId, { database });

    expect(context.selectedAppointmentId).toBe(appointmentId);
    expect(context.appointments).toMatchObject([{ appointmentId, type: "FOLLOW_UP" }]);
    expect(context.goalPlans).toEqual([goalPlan]);
    expect(database.patientAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientHospitalRelationshipId: relationshipId, status: "COMPLETED" } }),
    );
    expect(mockedPreProgramGoalOptions).toHaveBeenCalledWith(
      actor,
      relationshipId,
      expect.objectContaining({ database }),
    );
  });

  it("loads only same-Program Goal Plans and allows a Follow-up with no Goal Plan", async () => {
    mockedProgramGoalOptions.mockResolvedValueOnce([
      { ...goalPlan, patientProgramId: programId },
    ]);
    const database = createDatabase();

    const context = await getFollowupCreateContextForProgram(actor, programId, undefined, { database });

    expect(context.goalPlans).toMatchObject([{ goalPlanId, patientProgramId: programId }]);
    expect(mockedProgramGoalOptions).toHaveBeenCalledWith(
      expect.any(Object),
      programId,
      expect.objectContaining({ database }),
    );
    expect(mockedPreProgramGoalOptions).not.toHaveBeenCalled();

    mockedProgramGoalOptions.mockResolvedValueOnce([]);
    const standaloneContext = await getFollowupCreateContextForProgram(actor, programId, undefined, {
      database,
    });

    expect(standaloneContext.goalPlans).toEqual([]);
    expect(standaloneContext.selectedGoalPlanId).toBeNull();
  });

  it("preselects only an exact pre-Program Goal Plan", async () => {
    mockedPreProgramGoalOptions.mockResolvedValueOnce([goalPlan]);
    const database = createDatabase();

    const context = await getFollowupCreateContext(actor, relationshipId, undefined, {
      database,
      requestedGoalPlanId: goalPlanId,
    });

    expect(context.selectedGoalPlanId).toBe(goalPlanId);
  });

  it("rejects a Goal Plan that is not in the exact pre-Program projection", async () => {
    mockedPreProgramGoalOptions.mockResolvedValueOnce([goalPlan]);
    const database = createDatabase();

    await expect(
      getFollowupCreateContext(actor, relationshipId, undefined, {
        database,
        requestedGoalPlanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps standalone setup usable when Goal read access is denied", async () => {
    mockedPreProgramGoalOptions.mockRejectedValueOnce(new ForbiddenError());

    const context = await getFollowupCreateContext(actor, relationshipId, undefined, {
      database: createDatabase(),
    });

    expect(context.goalPlans).toEqual([]);
  });

  it("propagates optional Goal infrastructure failures", async () => {
    mockedPreProgramGoalOptions.mockRejectedValueOnce(new InfrastructureError("Goal service unavailable"));

    await expect(
      getFollowupCreateContext(actor, relationshipId, undefined, { database: createDatabase() }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("rejects a requested Appointment that is not in the exact relationship projection", async () => {
    const database = createDatabase({ appointmentOptions: [] });

    await expect(
      getFollowupCreateContext(actor, relationshipId, appointmentId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedPreProgramGoalOptions).not.toHaveBeenCalled();
  });

  it("renders detail from the exact historical Goal Plan context", async () => {
    mockedGoalDetail.mockResolvedValueOnce(goalPlan);
    const database = createDatabase({ detail: detailRecord() });

    const detail = await getFollowupDetail(actor, relationshipId, followupId, { database });

    expect(detail).toMatchObject({
      followupId,
      roundNumber: 2,
      weight: 72.5,
      sourceGoalPlan: { goalPlanId, roundNumber: 2, items: [{ activityCode: "exercise_walk" }] },
      activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE" }],
    });
    expect(mockedGoalDetail).toHaveBeenCalledWith(
      actor,
      relationshipId,
      goalPlanId,
      expect.objectContaining({ database }),
    );
    const query = vi.mocked(database.patientFollowup.findFirst).mock.calls[0]?.[0];
    expect(query?.select).toMatchObject({
      activityProgress: {
        orderBy: [{ goalActivityCode: "asc" }, { id: "asc" }],
        take: 50,
      },
    });
    expect(JSON.stringify(detail)).toContain("สะท้อน");
  });

  it("keeps activity progress in historical Goal Plan order", async () => {
    mockedGoalDetail.mockResolvedValueOnce({
      ...goalPlan,
      items: [
        {
          ...goalPlan.items[0],
          goalPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          activityCode: "stop_sweet",
          activityLabel: "งดหวาน",
          targetDays: 4,
          targetValue: null,
          targetUnit: null,
          sortOrder: 0,
        },
        {
          ...goalPlan.items[0],
          goalPlanItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sortOrder: 1,
        },
      ],
    });
    const database = createDatabase({
      detail: detailRecord({
        activityProgress: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            goalActivityCode: "exercise_walk",
            status: "DONE",
            note: null,
          },
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            goalActivityCode: "stop_sweet",
            status: "PARTIAL",
            note: "ทำได้บางส่วน",
          },
        ],
      }),
    });

    const detail = await getFollowupDetail(actor, relationshipId, followupId, { database });

    expect(detail.activityProgress.map((progress) => progress.goalActivityCode)).toEqual([
      "stop_sweet",
      "exercise_walk",
    ]);
  });

  it("does not read a cross-relationship Follow-up and denies inactive direct membership", async () => {
    const database = createDatabase({ detail: null });
    await expect(getFollowupDetail(actor, relationshipId, followupId, { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const deniedDatabase = createDatabase({ membership: false });
    await expect(getFollowupHistory(actor, relationshipId, { database: deniedDatabase })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects a Follow-up from another Program in Program detail", async () => {
    const database = createDatabase({
      detail: detailRecord({ patientProgramId: otherProgramId }),
    });

    await expect(
      getFollowupDetailForProgram(actor, programId, followupId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
