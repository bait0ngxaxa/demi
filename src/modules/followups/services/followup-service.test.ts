import {
  AppointmentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedGoalContext = vi.hoisted(() => vi.fn());
const mockedFollowupAccessState = vi.hoisted(() => ({ denyRecord: false }));

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("@/modules/goals/services/goal-query-service", () => ({
  getAccessibleGoalPlanActivityContext: mockedGoalContext,
}));

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

import {
  createFollowup,
  followupServiceInternals,
  type FollowupDatabase,
} from "./followup-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const otherRelationshipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const otherAppointmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const goalPlanId = "44444444-4444-4444-8444-444444444444";
const otherGoalPlanId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const hospitalUserId = "55555555-5555-4555-8555-555555555555";
const otherHospitalUserId = "66666666-6666-4666-8666-666666666666";
const personId = "77777777-7777-4777-8777-777777777777";
const nonce = "88888888-8888-4888-8888-888888888888";
const now = new Date("2026-08-17T05:00:00.000Z");

const hospitalActor: ActorContext = {
  userId: hospitalUserId,
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

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    appointmentId: null,
    sourceGoalPlanId: null,
    weight: 72.5,
    waistCircumference: null,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: null,
    confidenceScore: 7,
    reflectionNote: "สะท้อนแบบต้นแบบ",
    confidencePlan: "ลองทำต่อ",
    generalNote: "หมายเหตุทั่วไป",
    activityProgress: [],
    ...overrides,
  };
}

function actorRecord(userId: string): Record<string, unknown> {
  return {
    id: userId,
    personId,
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
  };
}

function relationshipRecord(id: string): Record<string, unknown> {
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

function followupRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    patientHospitalRelationshipId: relationshipId,
    createdByUserId: hospitalUserId,
    submissionNonce: nonce,
    submissionRequestHash: "0".repeat(64),
    roundNumber: 1,
    recordedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: Record<string, unknown> | null;
  latestRound?: number | null;
  appointment?: Record<string, unknown> | null;
  createResult?: Record<string, unknown>;
} = {}): {
  database: FollowupDatabase;
  transaction: {
    patientFollowup: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientAppointment: { findFirst: ReturnType<typeof vi.fn> };
  };
} {
  const transaction = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        actorRecord(where.id),
      ),
    },
    patientHospitalRelationship: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        relationshipRecord(where.id),
      ),
    },
    patientFollowup: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      findFirst: vi.fn().mockResolvedValue(
        input.latestRound === null || input.latestRound === undefined
          ? null
          : { roundNumber: input.latestRound },
      ),
      create: vi.fn().mockResolvedValue(input.createResult ?? followupRecord()),
    },
    patientAppointment: {
      findFirst: vi.fn().mockResolvedValue(input.appointment ?? null),
    },
  };

  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as FollowupDatabase;

  return { database, transaction };
}

const goalPlanContext = {
  goalPlanId,
  roundNumber: 2,
  createdAt: now,
  primaryGoalCode: "weight",
  primaryGoalLabel: "น้ำหนักลด (Weight Reduction)",
  primaryGoalNote: null,
  weeklyNote: null,
  items: [
    {
      goalPlanItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      activityCode: "exercise_walk",
      activityLabel: "เดิน",
      targetDays: 3,
      targetValue: 30,
      targetUnit: "minutes",
      sortOrder: 0,
    },
    {
      goalPlanItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      activityCode: "stop_sweet",
      activityLabel: "ลดเครื่องดื่มหวาน",
      targetDays: 4,
      targetValue: null,
      targetUnit: null,
      sortOrder: 1,
    },
  ],
};

describe("Follow-up service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFollowupAccessState.denyRecord = false;
    mockedAudit.mockResolvedValue(undefined);
    mockedGoalContext.mockResolvedValue(goalPlanContext);
  });

  it("derives creator and round, persists a standalone immutable round, and audits it", async () => {
    const { database, transaction } = createDatabase({
      createResult: followupRecord({ roundNumber: 1 }),
    });

    const result = await createFollowup(hospitalActor, validInput(), {
      database,
      now: () => now,
    });

    expect(result).toMatchObject({
      followupId: "99999999-9999-4999-8999-999999999999",
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      roundNumber: 1,
    });
    expect(transaction.patientFollowup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        createdByUserId: hospitalUserId,
        roundNumber: 1,
        submissionRequestHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "followup.created",
        resourceType: "PatientFollowup",
        metadata: expect.objectContaining({ hospitalId, roundNumber: 1 }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("สะท้อนแบบต้นแบบ");
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("72.5");
  });

  it("enforces followup:record at the create mutation boundary", async () => {
    mockedFollowupAccessState.denyRecord = true;
    const { database, transaction } = createDatabase();

    await expect(createFollowup(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
  });

  it("validates a completed Appointment and exact Goal Plan activities before nested persistence", async () => {
    const { database, transaction } = createDatabase({
      appointment: { id: appointmentId, status: AppointmentStatus.COMPLETED },
      createResult: followupRecord({ appointmentId, sourceGoalPlanId: goalPlanId }),
    });

    await createFollowup(
      hospitalActor,
      validInput({
        appointmentId,
        sourceGoalPlanId: goalPlanId,
        activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE", note: "ทำได้" }],
      }),
      { database, now: () => now },
    );

    expect(transaction.patientAppointment.findFirst).toHaveBeenCalledWith({
      where: { id: appointmentId, patientHospitalRelationshipId: relationshipId },
      select: { id: true, status: true },
    });
    expect(mockedGoalContext).toHaveBeenCalledWith(
      hospitalActor,
      relationshipId,
      goalPlanId,
      expect.objectContaining({ database: expect.anything() }),
    );
    expect(transaction.patientFollowup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appointmentId,
        sourceGoalPlanId: goalPlanId,
        activityProgress: {
          create: [expect.objectContaining({ goalActivityCode: "exercise_walk", status: "DONE" })],
        },
      }),
      select: expect.anything(),
    });
  });

  it.each([
    ["missing Appointment", null],
    ["non-completed Appointment", { id: appointmentId, status: AppointmentStatus.SCHEDULED }],
  ] as const)("rejects %s", async (_label, appointment) => {
    const { database, transaction } = createDatabase({ appointment });

    await expect(
      createFollowup(hospitalActor, validInput({ appointmentId }), { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
  });

  it("rejects Goal activity codes absent from the selected immutable plan", async () => {
    const { database, transaction } = createDatabase({
      appointment: null,
    });

    await expect(
      createFollowup(
        hospitalActor,
        validInput({
          sourceGoalPlanId: goalPlanId,
          activityProgress: [{ goalActivityCode: "injected_activity", status: "DONE" }],
        }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
  });

  it("does not fabricate activity progress without a Goal Plan", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      createFollowup(
        hospitalActor,
        validInput({ activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE" }] }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockedGoalContext).not.toHaveBeenCalled();
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
  });

  it("allocates after the latest relationship-scoped round", async () => {
    const { database, transaction } = createDatabase({ latestRound: 3 });

    await createFollowup(
      hospitalActor,
      validInput({ submissionNonce: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      { database, now: () => now },
    );

    expect(transaction.patientFollowup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roundNumber: 4 }) }),
    );
  });

  it("allows progress for only a subset of activities in the selected Goal Plan", async () => {
    const { database, transaction } = createDatabase({
      createResult: followupRecord({ sourceGoalPlanId: goalPlanId }),
    });

    await createFollowup(
      hospitalActor,
      validInput({
        sourceGoalPlanId: goalPlanId,
        activityProgress: [{ goalActivityCode: "exercise_walk", status: "DONE" }],
      }),
      { database, now: () => now },
    );

    expect(transaction.patientFollowup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityProgress: {
          create: [expect.objectContaining({ goalActivityCode: "exercise_walk", status: "DONE" })],
        },
      }),
      select: expect.anything(),
    });
  });

  it("rejects a selected Goal Plan when the Goal-owned boundary denies access", async () => {
    mockedGoalContext.mockRejectedValueOnce(new ForbiddenError());
    const { database, transaction } = createDatabase();

    await expect(
      createFollowup(
        hospitalActor,
        validInput({ sourceGoalPlanId: goalPlanId }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
  });

  it("returns the existing round for the same nonce and immutable request", async () => {
    const input = validInput();
    const normalized = followupServiceInternals.normalizeFollowupInput(
      input as Parameters<typeof followupServiceInternals.normalizeFollowupInput>[0],
    );
    const existing = followupRecord({
      submissionRequestHash: followupServiceInternals.createFollowupRequestHash(
        hospitalActor,
        relationshipId,
        normalized,
      ),
      roundNumber: 4,
    });
    const { database, transaction } = createDatabase({ existing });

    await expect(createFollowup(hospitalActor, input, { database })).resolves.toMatchObject({
      followupId: existing.id,
      roundNumber: 4,
    });
    expect(transaction.patientFollowup.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["changed payload", validInput({ generalNote: "เปลี่ยน payload" }), hospitalActor],
    [
      "changed actor",
      validInput(),
      { ...hospitalActor, userId: otherHospitalUserId },
    ],
    ["changed Appointment provenance", validInput({ appointmentId: otherAppointmentId }), hospitalActor],
    ["changed Goal Plan provenance", validInput({ sourceGoalPlanId: otherGoalPlanId }), hospitalActor],
  ] as const)("conflicts when a nonce is reused with %s", async (_label, changedInput, changedActor) => {
    const originalInput = validInput();
    const normalized = followupServiceInternals.normalizeFollowupInput(
      originalInput as Parameters<typeof followupServiceInternals.normalizeFollowupInput>[0],
    );
    const existing = followupRecord({
      submissionRequestHash: followupServiceInternals.createFollowupRequestHash(
        hospitalActor,
        relationshipId,
        normalized,
      ),
    });
    const { database } = createDatabase({ existing });

    await expect(createFollowup(changedActor, changedInput, { database })).rejects.toBeInstanceOf(ConflictError);
  });

  it("conflicts when a nonce is reused for another relationship", async () => {
    const originalInput = validInput();
    const normalized = followupServiceInternals.normalizeFollowupInput(
      originalInput as Parameters<typeof followupServiceInternals.normalizeFollowupInput>[0],
    );
    const existing = followupRecord({
      submissionRequestHash: followupServiceInternals.createFollowupRequestHash(
        hospitalActor,
        relationshipId,
        normalized,
      ),
    });
    const { database } = createDatabase({ existing });

    await expect(
      createFollowup(
        hospitalActor,
        validInput({ patientHospitalRelationshipId: otherRelationshipId }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rolls back the local mutation when the required audit fails", async () => {
    mockedAudit.mockRejectedValueOnce(new InfrastructureError("audit unavailable"));
    const { database, transaction } = createDatabase();

    await expect(createFollowup(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    expect(transaction.patientFollowup.create).toHaveBeenCalledOnce();
  });

  it("does not mutate Appointment, Goal Plan, or Screening while creating the round", async () => {
    const { database, transaction } = createDatabase({
      appointment: { id: appointmentId, status: AppointmentStatus.COMPLETED },
    });

    await createFollowup(
      hospitalActor,
      validInput({ appointmentId, sourceGoalPlanId: goalPlanId }),
      { database },
    );

    expect(transaction.patientAppointment.findFirst).toHaveBeenCalledOnce();
    expect(transaction.patientFollowup.create).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveProperty("patientAppointment.update");
    expect(transaction).not.toHaveProperty("patientGoalPlan.update");
    expect(transaction).not.toHaveProperty("screeningAssessment.update");
  });
});
