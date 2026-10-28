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

const mockedLockProgram = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-program/services/patient-program-lifecycle-service", () => ({
  lockActivePatientProgram: mockedLockProgram,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitalUserId = "33333333-3333-4333-8333-333333333333";
const osmUserId = "44444444-4444-4444-8444-444444444444";
const screeningId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-08-16T05:00:00.000Z");

const pamAnswers = { "pam-1": 3, "pam-2": 3, "pam-3": 3, "pam-4": 3, "pam-5": 2 };
const pamResult = { total: 14, group: "INTENSIVE" } as const;
const promsAnswers = { "proms-1": 4, "proms-2": 2, "proms-3": 5, "proms-4": 3 };

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
    instrument: "PAM",
    responses: { answers: pamAnswers },
    ...overrides,
  };
}

function existingPam(overrides: Record<string, unknown> = {}) {
  return {
    id: screeningId,
    patientHospitalRelationshipId: relationshipId,
    conductedByUserId: hospitalUserId,
    patientProgramId: null,
    instrument: "PAM",
    questionSetKey: "demi-pam",
    questionSetVersion: "booklet-v1",
    scoringVersion: "pam-booklet-v1",
    responses: { answers: pamAnswers },
    result: pamResult,
    submittedAt: now,
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: Record<string, unknown> | null;
  programScreening?: { id: string } | null;
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
    patientProgramRoundActivity: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "99999999-9999-4999-8999-999999999999" }),
    },
    patientProgramRoundCompletion: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // ADR-0022: round 1 opens with the Program.
    patientProgramRound: {
      findUnique: vi.fn().mockResolvedValue({ id: "99999999-9999-4999-8999-999999999998" }),
    },
    screeningAssessment: {
      findUnique: vi.fn().mockResolvedValue(input.existing ?? null),
      findFirst: vi.fn().mockResolvedValue(input.programScreening ?? null),
      create: vi.fn(async ({ data }: { data: { result: unknown } }) => ({
        id: screeningId,
        submittedAt: now,
        result: data.result,
      })),
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

  it("rechecks scope, scores PAM with the booklet groups, persists a snapshot, and audits", async () => {
    const { database, transaction } = createDatabase();

    const result = await submitScreening(hospitalActor(), validInput(), {
      database,
      now: () => now,
    });

    expect(result).toMatchObject({
      screeningAssessmentId: screeningId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      instrument: "PAM",
      outcome: { kind: "PAM", total: 14, group: "INTENSIVE" },
    });
    expect(transaction.screeningAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        conductedByUserId: hospitalUserId,
        instrument: "PAM",
        questionSetKey: "demi-pam",
        questionSetVersion: "booklet-v1",
        scoringVersion: "pam-booklet-v1",
        responses: { answers: pamAnswers },
        result: pamResult,
      }),
      select: { id: true, submittedAt: true, result: true },
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "screening.submitted",
        resourceType: "ScreeningAssessment",
        metadata: expect.objectContaining({ hospitalId, instrument: "PAM", questionSetVersion: "booklet-v1" }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("answers");
  });

  it("scores PROMs per item with no total (R2-B)", async () => {
    const { database, transaction } = createDatabase();

    const result = await submitScreening(
      hospitalActor(),
      validInput({ instrument: "PROMS", responses: { answers: promsAnswers } }),
      { database, now: () => now },
    );

    expect(result.outcome).toEqual({
      kind: "PROMS",
      itemScores: promsAnswers,
      hasProblem: true,
      problemItemKeys: ["proms-2"],
    });
    expect(transaction.screeningAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          instrument: "PROMS",
          questionSetKey: "demi-proms",
          scoringVersion: "proms-booklet-v1",
        }),
      }),
    );
  });

  it.each([
    ["an unanswered question", validInput({ responses: { answers: { "pam-1": 3, "pam-2": 3, "pam-3": 3, "pam-4": 3 } } })],
    ["the legacy combined shape", validInput({ responses: { pam: pamAnswers, proms: promsAnswers, confidenceScore: 7 } })],
    ["no instrument", { ...validInput(), instrument: undefined }],
  ])("refuses %s", async (_label, input) => {
    const { database, transaction } = createDatabase();

    await expect(submitScreening(hospitalActor(), input, { database, now: () => now })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(transaction.screeningAssessment.create).not.toHaveBeenCalled();
  });

  it("returns the existing assessment for the same retry nonce without writing again", async () => {
    const { database, transaction } = createDatabase({ existing: existingPam() });

    await expect(submitScreening(hospitalActor(), validInput(), { database, now: () => now })).resolves.toMatchObject({
      screeningAssessmentId: screeningId,
      outcome: { kind: "PAM", total: 14 },
    });
    expect(transaction.screeningAssessment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("compares retry snapshots independent of PostgreSQL JSONB key order", async () => {
    const { database } = createDatabase({
      existing: existingPam({
        responses: { answers: { "pam-5": 2, "pam-4": 3, "pam-3": 3, "pam-2": 3, "pam-1": 3 } },
        result: { group: "INTENSIVE", total: 14 },
      }),
    });

    await expect(submitScreening(hospitalActor(), validInput(), { database })).resolves.toMatchObject({
      screeningAssessmentId: screeningId,
    });
  });

  it("does not let a reused nonce submit changed responses or another instrument", async () => {
    const changed = createDatabase({ existing: existingPam({ responses: { answers: { ...pamAnswers, "pam-1": 4 } } }) });
    await expect(submitScreening(hospitalActor(), validInput(), { database: changed.database })).rejects.toBeInstanceOf(
      ConflictError,
    );

    const otherInstrument = createDatabase({ existing: existingPam() });
    await expect(
      submitScreening(hospitalActor(), validInput({ instrument: "PROMS", responses: { answers: promsAnswers } }), {
        database: otherInstrument.database,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
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
        { ...validInput(), result: { total: 20, group: "CHAMPION" } },
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
    const osmUser = {
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
    };
    const assigned = createDatabase({ assignedOsmUserId: osmUserId });
    assigned.transaction.user.findUnique.mockResolvedValue(osmUser);

    await expect(submitScreening(osm, validInput(), { database: assigned.database })).resolves.toBeDefined();

    const unassigned = createDatabase();
    unassigned.transaction.user.findUnique.mockResolvedValue(osmUser);

    await expect(submitScreening(osm, validInput({ submissionNonce: "99999999-9999-4999-8999-999999999999" }), { database: unassigned.database })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Screening submission from round 1 of a Program (WB-DF-01, R2-C)", () => {
  const programId = "88888888-8888-4888-8888-888888888888";

  function lockedProgram(overrides: { relationshipId?: string } = {}): Record<string, unknown> {
    return {
      access: { patient: { patientHospitalRelationshipId: overrides.relationshipId ?? relationshipId } },
      program: { id: programId },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
    mockedLockProgram.mockResolvedValue(lockedProgram());
  });

  it("refuses a Program screening once round 1 is completed (SR-D5)", async () => {
    const { database, transaction } = createDatabase();
    transaction.patientProgramRoundCompletion.findMany.mockResolvedValue([{ roundNumber: 1 }]);

    await expect(
      submitScreening(hospitalActor(), validInput({ patientProgramId: programId }), { database, now: () => now }),
    ).rejects.toMatchObject({ name: "RoundConflictError" });
    expect(transaction.screeningAssessment.create).not.toHaveBeenCalled();
  });

  it.each(["PAM", "PROMS"] as const)("links a %s screening to the Program and ledgers only that step", async (instrument) => {
    const { database, transaction } = createDatabase();
    const answers = instrument === "PAM" ? pamAnswers : promsAnswers;

    await submitScreening(
      hospitalActor(),
      validInput({ patientProgramId: programId, instrument, responses: { answers } }),
      { database, now: () => now },
    );

    expect(mockedLockProgram).toHaveBeenCalledWith(expect.anything(), hospitalActor(), programId);
    // One result per instrument; a legacy combined screening already answers both.
    expect(transaction.screeningAssessment.findFirst).toHaveBeenCalledWith({
      where: { patientProgramId: programId, instrument: { in: ["COMBINED", instrument] } },
      select: { id: true },
    });
    expect(transaction.screeningAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ patientProgramId: programId, instrument }) }),
    );
    const ledgerCalls = transaction.patientProgramRoundActivity.create.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );
    expect(ledgerCalls).toEqual([
      expect.objectContaining({
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        roundNumber: 1,
        toolCode: instrument,
        source: "PLANNED",
        mode: "RECORDED",
        linkedRecordType: "SCREENING_ASSESSMENT",
        linkedRecordId: screeningId,
        recordedByUserId: hospitalUserId,
      }),
    ]);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "screening.submitted",
        metadata: expect.objectContaining({ patientProgramId: programId, instrument }) as unknown,
      }),
      expect.anything(),
    );
  });

  it("does not touch the ledger for a screening outside a Program round", async () => {
    const { database, transaction } = createDatabase();

    await submitScreening(hospitalActor(), validInput(), { database, now: () => now });

    expect(mockedLockProgram).not.toHaveBeenCalled();
    expect(transaction.patientProgramRoundActivity.create).not.toHaveBeenCalled();
    expect(transaction.screeningAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ patientProgramId: null }) }),
    );
  });

  it("rejects a second result for the instrument (or a legacy combined one) and a Program of another relationship", async () => {
    const duplicate = createDatabase({ programScreening: { id: screeningId } });
    await expect(
      submitScreening(hospitalActor(), validInput({ patientProgramId: programId }), {
        database: duplicate.database,
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(duplicate.transaction.screeningAssessment.create).not.toHaveBeenCalled();

    mockedLockProgram.mockResolvedValue(
      lockedProgram({ relationshipId: "99999999-9999-4999-8999-000000000000" }),
    );
    const foreign = createDatabase();
    await expect(
      submitScreening(hospitalActor(), validInput({ patientProgramId: programId }), {
        database: foreign.database,
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(foreign.transaction.screeningAssessment.create).not.toHaveBeenCalled();
  });

  it("fails closed when the Program lock denies the actor", async () => {
    mockedLockProgram.mockRejectedValue(new ForbiddenError());
    const { database, transaction } = createDatabase();

    await expect(
      submitScreening(hospitalActor(), validInput({ patientProgramId: programId }), { database, now: () => now }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.screeningAssessment.create).not.toHaveBeenCalled();
  });
});
