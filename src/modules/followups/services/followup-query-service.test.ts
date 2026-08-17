import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const mockedGoalOptions = vi.hoisted(() => vi.fn());
const mockedGoalDetail = vi.hoisted(() => vi.fn());

vi.mock("@/modules/goals/services/goal-query-service", () => ({
  getAccessibleGoalPlanOptions: mockedGoalOptions,
  getAccessibleGoalPlanActivityContext: mockedGoalDetail,
}));

import {
  getFollowupCreateContext,
  getFollowupDetail,
  getFollowupHistory,
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
      findMany: vi.fn().mockResolvedValue(overrides.followupHistory ?? []),
      findFirst: vi.fn().mockResolvedValue(overrides.detail ?? null),
    },
  };

  return database as unknown as FollowupQueryDatabase;
}

function historyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: followupId,
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
        orderBy: [{ roundNumber: "desc" }, { id: "desc" }],
      }),
    );
    const query = vi.mocked(database.patientFollowup.findMany).mock.calls[0]?.[0];
    expect(query?.select).not.toHaveProperty("reflectionNote");
    expect(JSON.stringify(history)).not.toContain("สะท้อน");
  });

  it("loads only completed Appointment options and explicit historical Goal Plan options", async () => {
    mockedGoalOptions.mockResolvedValueOnce([goalPlan]);
    const database = createDatabase();

    const context = await getFollowupCreateContext(actor, relationshipId, appointmentId, { database });

    expect(context.selectedAppointmentId).toBe(appointmentId);
    expect(context.appointments).toMatchObject([{ appointmentId, type: "FOLLOW_UP" }]);
    expect(context.goalPlans).toEqual([goalPlan]);
    expect(database.patientAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientHospitalRelationshipId: relationshipId, status: "COMPLETED" } }),
    );
    expect(mockedGoalOptions).toHaveBeenCalledWith(
      actor,
      relationshipId,
      expect.objectContaining({ database }),
    );
  });

  it("rejects a requested Appointment that is not in the exact relationship projection", async () => {
    const database = createDatabase({ appointmentOptions: [] });

    await expect(
      getFollowupCreateContext(actor, relationshipId, appointmentId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockedGoalOptions).not.toHaveBeenCalled();
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
    expect(JSON.stringify(detail)).toContain("สะท้อน");
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
});
