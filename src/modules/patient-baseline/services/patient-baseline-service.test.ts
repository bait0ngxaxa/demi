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
import { ConflictError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

import {
  createPatientBaseline,
  type PatientBaselineDatabase,
} from "./patient-baseline-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientBaselineId = "33333333-3333-4333-8333-333333333333";
const hospitalUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
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
    recordedOn: "2026-08-17",
    weight: 72.5,
    waistCircumference: null,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: null,
    adaptationSummary: "สรุปการปรับตัว",
    adaptationObstacles: null,
    adaptationOpportunities: "โอกาส",
    confidenceScore: 7,
    confidenceImprovementPlan: null,
    summary: "สรุปข้อมูลตั้งต้น",
    recommendations: null,
    ...overrides,
  };
}

function actorRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: hospitalUserId,
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
    ...overrides,
  };
}

function relationshipRecord(): Record<string, unknown> {
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
  };
}

function baselineRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: patientBaselineId,
    patientHospitalRelationshipId: relationshipId,
    recordedByUserId: hospitalUserId,
    recordedOn: new Date("2026-08-17T00:00:00.000Z"),
    createdAt: now,
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: Record<string, unknown> | null;
  createResult?: Record<string, unknown>;
  createError?: unknown;
  authoritativeActor?: Record<string, unknown>;
} = {}): {
  database: PatientBaselineDatabase;
  transaction: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    patientHospitalRelationship: { findFirst: ReturnType<typeof vi.fn> };
    patientBaseline: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    patientProgram: { updateMany: ReturnType<typeof vi.fn> };
  };
} {
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue(input.authoritativeActor ?? actorRecord()),
    },
    patientHospitalRelationship: {
      findFirst: vi.fn().mockResolvedValue(relationshipRecord()),
    },
    patientBaseline: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      create: input.createError
        ? vi.fn().mockRejectedValue(input.createError)
        : vi.fn().mockResolvedValue(input.createResult ?? baselineRecord()),
    },
    patientProgram: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as PatientBaselineDatabase;

  return { database, transaction };
}

describe("Patient Baseline service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
  });

  it("creates a partial relationship-owned Baseline with an authoritative recorder and bounded audit", async () => {
    const { database, transaction } = createDatabase();

    const result = await createPatientBaseline(hospitalActor, validInput(), {
      database,
      now: () => now,
    });

    expect(result).toMatchObject({
      patientBaselineId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      recordedByUserId: hospitalUserId,
      recordedOn: new Date("2026-08-17T00:00:00.000Z"),
      createdAt: now,
    });
    expect(transaction.patientBaseline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        recordedByUserId: hospitalUserId,
        recordedOn: new Date("2026-08-17T00:00:00.000Z"),
        weight: 72.5,
        waistCircumference: null,
        bloodPressureSystolic: 120,
        bloodSugarDtx: null,
        createdAt: now,
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: hospitalUserId,
        action: "patient_baseline.created",
        resourceType: "PatientBaseline",
        resourceId: patientBaselineId,
        metadata: {
          patientBaselineId,
          patientHospitalRelationshipId: relationshipId,
        },
      }),
      transaction,
    );
    const auditInput = mockedAudit.mock.calls[0]?.[0] as { metadata?: Record<string, unknown> };
    expect(auditInput.metadata).not.toHaveProperty("weight");
    expect(auditInput.metadata).not.toHaveProperty("summary");
    expect(transaction).not.toHaveProperty("screeningAssessment");
    expect(transaction).not.toHaveProperty("patientGoalPlan");
    expect(transaction).not.toHaveProperty("patientAppointment");
    expect(transaction).not.toHaveProperty("patientFollowup");
  });

  it("does not accept a browser recorder and derives the actor from the server context", async () => {
    const { database } = createDatabase();

    await expect(
      createPatientBaseline(
        hospitalActor,
        validInput({ recordedByUserId: "66666666-6666-4666-8666-666666666666" }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a second Baseline without overwriting the existing row", async () => {
    const { database, transaction } = createDatabase({ existing: baselineRecord() });

    await expect(createPatientBaseline(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(transaction.patientBaseline.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("maps a concurrent database uniqueness conflict to a clean application conflict", async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.19.3",
    });
    const { database, transaction } = createDatabase({ createError: duplicateError });

    await expect(createPatientBaseline(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(transaction.patientBaseline.create).toHaveBeenCalledOnce();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("keeps Baseline and audit creation inside the same transaction boundary", async () => {
    mockedAudit.mockRejectedValueOnce(new InfrastructureError("audit unavailable"));
    const { database, transaction } = createDatabase();

    await expect(createPatientBaseline(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    expect(transaction.patientBaseline.create).toHaveBeenCalledOnce();
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(mockedAudit.mock.calls[0]?.[1]).toBe(transaction);
  });

  it("denies ADMIN-only actors through the server-side relationship policy", async () => {
    const adminActor = { ...hospitalActor, roles: [Role.ADMIN] } satisfies ActorContext;
    const { database, transaction } = createDatabase({
      authoritativeActor: actorRecord({ roles: [{ role: Role.ADMIN }], memberships: [] }),
    });

    await expect(createPatientBaseline(adminActor, validInput(), { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(transaction.patientBaseline.create).not.toHaveBeenCalled();
  });
});
