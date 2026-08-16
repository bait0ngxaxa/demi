import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import { submitScreening, type ScreeningDatabase } from "./screening-service";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitalUserId = "33333333-3333-4333-8333-333333333333";
const osmUserId = "44444444-4444-4444-8444-444444444444";
const screeningId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-08-16T05:00:00.000Z");

function hospitalActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: hospitalUserId,
    personId: "66666666-6666-4666-8666-666666666666",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: "77777777-7777-4777-8777-777777777777",
    responses: {
      pam: {
        "pam-1": 2,
        "pam-2": 2,
        "pam-3": 2,
        "pam-4": 2,
        "pam-5": 2,
      },
      proms: {
        "proms-1": 3,
        "proms-2": 3,
        "proms-3": 3,
        "proms-4": 3,
      },
      confidenceScore: 7,
      confidenceImprovementPlan: "ขอคำแนะนำเพิ่มเติม",
    },
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: {
    id: string;
    patientHospitalRelationshipId: string;
    conductedByUserId: string;
    questionSetKey: string;
    questionSetVersion: string;
    scoringVersion: string;
    responses: unknown;
    result: unknown;
    submittedAt: Date;
  } | null;
  assignedOsmUserId?: string | null;
} = {}): { database: ScreeningDatabase; transaction: Record<string, Record<string, ReturnType<typeof vi.fn>>> } {
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: hospitalUserId,
        personId: "66666666-6666-4666-8666-666666666666",
        status: "ACTIVE",
        roles: [{ role: Role.HOSPITAL }],
        memberships: [
          {
            hospitalId,
            membershipType: MembershipType.OWNER,
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
        hospital: {
          id: hospitalId,
          name: "โรงพยาบาล ก",
          status: HospitalStatus.ACTIVE,
        },
        patientProfile: {
          person: {
            givenName: "สมชาย",
            familyName: "ผู้ป่วย",
            user: { roles: [{ role: Role.PATIENT }] },
          },
        },
        osmAssignments: input.assignedOsmUserId
          ? [{ osmUserId: input.assignedOsmUserId }]
          : [],
      }),
    },
    screeningAssessment: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      create: vi.fn().mockResolvedValue({
        id: screeningId,
        submittedAt: now,
        result: {
          pamTotal: 10,
          promsTotal: 12,
          promsMin: 3,
          combinedTotal: 22,
          percentage: 50,
          level: "L3",
          zone: "YELLOW",
        },
      }),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as ScreeningDatabase;

  return { database, transaction };
}

describe("Screening submission service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
  });

  it("rechecks scope, calculates the canonical result, persists a snapshot, and audits", async () => {
    const { database, transaction } = createDatabase();

    const result = await submitScreening(hospitalActor(), validInput(), {
      database,
      now: () => now,
    });

    expect(result).toMatchObject({
      screeningAssessmentId: screeningId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      result: {
        pamTotal: 10,
        promsTotal: 12,
        promsMin: 3,
        combinedTotal: 22,
        percentage: 50,
        level: "L3",
        zone: "YELLOW",
      },
    });
    expect(transaction.screeningAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        conductedByUserId: hospitalUserId,
        questionSetKey: "demi-screening",
        questionSetVersion: "legacy-prototype-v1",
        scoringVersion: "legacy-prototype-v1",
        responses: expect.objectContaining({ confidenceScore: 7 }),
        result: expect.objectContaining({ level: "L3", zone: "YELLOW" }),
      }),
      select: { id: true, submittedAt: true, result: true },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "screening.submitted",
        resourceType: "ScreeningAssessment",
        metadata: expect.objectContaining({ hospitalId, questionSetVersion: "legacy-prototype-v1" }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("ขอคำแนะนำ");
  });

  it("returns the existing assessment for the same retry nonce without writing again", async () => {
    const input = validInput();
    const { database, transaction } = createDatabase({
      existing: {
        id: screeningId,
        patientHospitalRelationshipId: relationshipId,
        conductedByUserId: hospitalUserId,
        questionSetKey: "demi-screening",
        questionSetVersion: "legacy-prototype-v1",
        scoringVersion: "legacy-prototype-v1",
        responses: input.responses,
        result: {
          pamTotal: 10,
          promsTotal: 12,
          promsMin: 3,
          combinedTotal: 22,
          percentage: 50,
          level: "L3",
          zone: "YELLOW",
        },
        submittedAt: now,
      },
    });

    await expect(submitScreening(hospitalActor(), input, { database, now: () => now })).resolves.toMatchObject({
      screeningAssessmentId: screeningId,
    });
    expect(transaction.screeningAssessment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("compares retry snapshots independent of PostgreSQL JSONB key order", async () => {
    const input = validInput();
    const { database } = createDatabase({
      existing: {
        id: screeningId,
        patientHospitalRelationshipId: relationshipId,
        conductedByUserId: hospitalUserId,
        questionSetKey: "demi-screening",
        questionSetVersion: "legacy-prototype-v1",
        scoringVersion: "legacy-prototype-v1",
        responses: {
          confidenceImprovementPlan: "ขอคำแนะนำเพิ่มเติม",
          confidenceScore: 7,
          proms: input.responses.proms,
          pam: input.responses.pam,
        },
        result: {
          zone: "YELLOW",
          level: "L3",
          percentage: 50,
          combinedTotal: 22,
          promsMin: 3,
          promsTotal: 12,
          pamTotal: 10,
        },
        submittedAt: now,
      },
    });

    await expect(submitScreening(hospitalActor(), input, { database })).resolves.toMatchObject({
      screeningAssessmentId: screeningId,
    });
  });

  it("does not let a reused nonce submit changed responses", async () => {
    const input = validInput();
    const { database } = createDatabase({
      existing: {
        id: screeningId,
        patientHospitalRelationshipId: relationshipId,
        conductedByUserId: hospitalUserId,
        questionSetKey: "demi-screening",
        questionSetVersion: "legacy-prototype-v1",
        scoringVersion: "legacy-prototype-v1",
        responses: { ...input.responses, confidenceScore: 6 },
        result: {
          pamTotal: 10,
          promsTotal: 12,
          promsMin: 3,
          combinedTotal: 22,
          percentage: 50,
          level: "L3",
          zone: "YELLOW",
        },
        submittedAt: now,
      },
    });

    await expect(submitScreening(hospitalActor(), input, { database })).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a deliberate second assessment with a new nonce", async () => {
    const { database, transaction } = createDatabase();

    await submitScreening(
      hospitalActor(),
      validInput({ submissionNonce: "88888888-8888-4888-8888-888888888888" }),
      { database, now: () => now },
    );

    expect(transaction.screeningAssessment.create).toHaveBeenCalledOnce();
  });

  it("rejects client-supplied canonical result fields", async () => {
    const { database } = createDatabase();

    await expect(
      submitScreening(
        hospitalActor(),
        { ...validInput(), result: { level: "L4", zone: "GREEN" } },
        { database },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces OSM assignment scope in the authoritative database context", async () => {
    const osm = hospitalActor({
      userId: osmUserId,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    });
    const assigned = createDatabase({ assignedOsmUserId: osmUserId });
    assigned.transaction.user.findUnique.mockResolvedValue({
      id: osmUserId,
      personId: "66666666-6666-4666-8666-666666666666",
      status: "ACTIVE",
      roles: [{ role: Role.OSM }],
      memberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      ],
    });

    await expect(submitScreening(osm, validInput(), { database: assigned.database })).resolves.toBeDefined();

    const unassigned = createDatabase();
    unassigned.transaction.user.findUnique.mockResolvedValue({
      id: osmUserId,
      personId: "66666666-6666-4666-8666-666666666666",
      status: "ACTIVE",
      roles: [{ role: Role.OSM }],
      memberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      ],
    });

    await expect(submitScreening(osm, validInput({ submissionNonce: "99999999-9999-4999-8999-999999999999" }), { database: unassigned.database })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
