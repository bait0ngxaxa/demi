import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

import { createGoalPlan, type GoalDatabase } from "./goal-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitalUserId = "33333333-3333-4333-8333-333333333333";
const goalPlanId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-16T05:00:00.000Z");

const hospitalActor: ActorContext = {
  userId: hospitalUserId,
  personId: "55555555-5555-4555-8555-555555555555",
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

const booklet = {
  goals: { weightLossKg: 3, waistCm: null, bloodSugarMgDl: 130, hba1cPercent: 7, customText: null },
  food: { notSet: false, planText: "งดน้ำหวาน", startDate: "2026-08-16" },
  exercise: { notSet: false, planText: "เดินเร็วหลังอาหารเย็น", startDate: null },
  problemsAfterOneMonth: null,
  patientSignatureName: "สมชาย ผู้ป่วย",
  witnessSignatureName: "บันทึกเพื่อคุยกับลูกค้า",
};

/** The stored booklet columns of `booklet`. */
const bookletColumns = {
  goalWeightLossKg: 3,
  goalWaistCm: null,
  goalBloodSugarMgDl: 130,
  goalHba1cPercent: 7,
  goalCustomText: null,
  foodPlanText: "งดน้ำหวาน",
  foodStartDate: new Date("2026-08-16T00:00:00.000Z"),
  foodNotSet: false,
  exercisePlanText: "เดินเร็วหลังอาหารเย็น",
  exerciseStartDate: null,
  exerciseNotSet: false,
  problemsAfterOneMonth: null,
  patientSignatureName: "สมชาย ผู้ป่วย",
  witnessSignatureName: "บันทึกเพื่อคุยกับลูกค้า",
};

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: "66666666-6666-4666-8666-666666666666",
    sourceScreeningAssessmentId: null,
    items: [
      { activityCode: "stop_sweet", targetDays: 4 },
      { activityCode: "cardio", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
    ],
    booklet,
    ...overrides,
  };
}

function existingPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: goalPlanId,
    patientHospitalRelationshipId: relationshipId,
    createdByUserId: hospitalUserId,
    sourceScreeningAssessmentId: null,
    submissionNonce: "66666666-6666-4666-8666-666666666666",
    templateKey: "demi-goals",
    templateVersion: "booklet-v1",
    roundNumber: 2,
    primaryGoalCode: "healthy-plan",
    primaryGoalNote: null,
    weeklyNote: null,
    ...bookletColumns,
    createdAt: now,
    items: [
      { activityCode: "stop_sweet", targetDays: 4, targetValue: null, targetUnit: null, sortOrder: 0 },
      { activityCode: "cardio", targetDays: 3, targetValue: 15, targetUnit: "minutes", sortOrder: 1 },
    ],
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: Record<string, unknown> | null;
  latestRound?: number | null;
  createResult?: { id: string; roundNumber: number; createdAt: Date };
} = {}): {
  database: GoalDatabase;
  transaction: {
    patientGoalPlan: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    screeningAssessment: { findFirst: ReturnType<typeof vi.fn> };
  };
} {
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: hospitalUserId,
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
    screeningAssessment: {
      findFirst: vi.fn().mockResolvedValue({ id: "source-screening" }),
    },
    patientGoalPlan: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      findFirst: vi.fn().mockResolvedValue(
        input.latestRound === null || input.latestRound === undefined
          ? null
          : { roundNumber: input.latestRound },
      ),
      create: vi.fn().mockResolvedValue(
        input.createResult ?? { id: goalPlanId, roundNumber: (input.latestRound ?? 0) + 1, createdAt: now },
      ),
    },
  };

  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as GoalDatabase;

  return { database, transaction };
}

describe("Goal Plan service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
  });

  it("creates a booklet plan with its goals, sections and signatures (R2-E)", async () => {
    const { database, transaction } = createDatabase();

    await createGoalPlan(hospitalActor, validInput(), { database, now: () => now });

    expect(transaction.patientGoalPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateVersion: "booklet-v1",
          primaryGoalCode: "healthy-plan",
          primaryGoalNote: null,
          weeklyNote: null,
          ...bookletColumns,
        }),
      }),
    );
  });

  it("refuses a PROMs screening as the plan's source (R2-C)", async () => {
    const { database, transaction } = createDatabase();
    transaction.screeningAssessment.findFirst.mockResolvedValue({
      id: "99999999-9999-4999-8999-999999999999",
      submittedAt: now,
      instrument: "PROMS",
      scoringVersion: "proms-booklet-v1",
      result: { itemScores: { "proms-1": 3 }, hasProblem: false, problemItemKeys: [] },
    });

    await expect(
      createGoalPlan(
        hospitalActor,
        validInput({ sourceScreeningAssessmentId: "99999999-9999-4999-8999-999999999999" }),
        { database, now: () => now },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientGoalPlan.create).not.toHaveBeenCalled();
  });

  it("rechecks relationship scope, creates one plan with items, and audits the mutation", async () => {
    const { database, transaction } = createDatabase();

    const result = await createGoalPlan(hospitalActor, validInput(), { database, now: () => now });

    expect(result).toMatchObject({
      goalPlanId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      roundNumber: 1,
    });
    expect(transaction.patientGoalPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        createdByUserId: hospitalUserId,
        templateKey: "demi-goals",
        templateVersion: "booklet-v1",
        roundNumber: 1,
        items: {
          create: [
            expect.objectContaining({ activityCode: "stop_sweet", targetDays: 4 }),
            expect.objectContaining({
              activityCode: "cardio",
              targetValue: 15,
              targetUnit: "minutes",
            }),
          ],
        },
      }),
      select: { id: true, createdAt: true, roundNumber: true },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "goal_plan.created",
        resourceType: "PatientGoalPlan",
        metadata: expect.objectContaining({ hospitalId, roundNumber: 1 }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("บันทึกเพื่อคุยกับลูกค้า");
  });

  it("returns an identical retry without creating another round or audit", async () => {
    const input = validInput();
    const { database, transaction } = createDatabase({ existing: existingPlan() });

    await expect(createGoalPlan(hospitalActor, input, { database })).resolves.toMatchObject({
      goalPlanId,
      roundNumber: 2,
    });
    expect(transaction.patientGoalPlan.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects a changed payload with a reused nonce", async () => {
    const input = validInput();
    const { database } = createDatabase({
      existing: existingPlan({ roundNumber: 1, witnessSignatureName: "ค่าที่แตกต่าง" }),
    });

    await expect(createGoalPlan(hospitalActor, input, { database })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allocates a deliberate new round after the latest immutable round", async () => {
    const { database, transaction } = createDatabase({ latestRound: 3 });

    await expect(
      createGoalPlan(
        hospitalActor,
        validInput({ submissionNonce: "77777777-7777-4777-8777-777777777777" }),
        { database, now: () => now },
      ),
    ).resolves.toMatchObject({ roundNumber: 4 });
    expect(transaction.patientGoalPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roundNumber: 4 }) }),
    );
  });

  it("rejects client-supplied authority or derived fields", async () => {
    const { database } = createDatabase();

    await expect(
      createGoalPlan(hospitalActor, { ...validInput(), hospitalId, createdByUserId: hospitalUserId }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("maps an audit failure to an infrastructure error so the transaction cannot succeed", async () => {
    mockedAudit.mockRejectedValue(new InfrastructureError("audit unavailable"));
    const { database } = createDatabase();

    await expect(createGoalPlan(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });
});

