import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import { questionSetRegistry } from "../domain/question-sets";

const { alternateScoringVersion } = vi.hoisted(() => ({
  alternateScoringVersion: "customer-approved-test-v1",
}));

vi.mock("../domain/scoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../domain/scoring")>();
  const prototypeDefinition = actual.getScoringDefinition(actual.LEGACY_PROTOTYPE_SCORING_VERSION);

  if (!prototypeDefinition) {
    throw new Error("The source registry must contain the prototype scoring definition");
  }

  return {
    ...actual,
    getScoringDefinition: (version: string) => version === alternateScoringVersion
      ? { ...prototypeDefinition, version }
      : actual.getScoringDefinition(version),
  };
});

import {
  getAccessibleScreeningSummaries,
  getLatestAccessibleScreeningSummary,
  getScreeningDetail,
  getScreeningHistory,
  type ScreeningQueryDatabase,
} from "./screening-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const screeningId = "33333333-3333-4333-8333-333333333333";
const secondScreeningId = "66666666-6666-4666-8666-666666666666";
const actorUserId = "44444444-4444-4444-8444-444444444444";

const actor: ActorContext = {
  userId: actorUserId,
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

const result = {
  pamTotal: 10,
  promsTotal: 12,
  promsMin: 3,
  combinedTotal: 22,
  percentage: 50,
  level: "L3",
  zone: "YELLOW",
} as const;

function createDatabase(overrides: {
  hospitalMembership?: boolean;
  questionSetKey?: string;
  questionSetVersion?: string;
  scoringVersion?: string;
  summaryRecords?: Array<{
    id: string;
    submittedAt: Date;
    result: unknown;
  }>;
  records?: Array<{
    id: string;
    submittedAt: Date;
    result: unknown;
    conductedByUser: { person: { givenName: string | null; familyName: string | null } };
  }>;
} = {}): { database: ScreeningQueryDatabase; screeningAssessment: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> } } {
  const database = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: actorUserId,
        personId: actor.personId,
        status: UserStatus.ACTIVE,
        roles: [{ role: Role.HOSPITAL }],
        memberships: overrides.hospitalMembership === false
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
    screeningAssessment: {
      findMany: vi.fn().mockResolvedValue(overrides.summaryRecords ?? overrides.records ?? []),
      findFirst: vi.fn().mockResolvedValue({
        id: screeningId,
        submittedAt: new Date("2026-08-16T05:00:00.000Z"),
        questionSetKey: overrides.questionSetKey ?? "demi-screening",
        questionSetVersion: overrides.questionSetVersion ?? "legacy-prototype-v1",
        scoringVersion: overrides.scoringVersion ?? "legacy-prototype-v1",
        responses: {
          pam: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 },
          proms: { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
          confidenceScore: 7,
          confidenceImprovementPlan: null,
        },
        result,
        conductedByUser: { person: { givenName: "ผู้ทำ", familyName: "แบบประเมิน" } },
      }),
    },
  };

  return {
    database: database as unknown as ScreeningQueryDatabase,
    screeningAssessment: database.screeningAssessment,
  };
}

describe("Screening query service", () => {
  it("returns only the minimal latest summary through the Screening read boundary", async () => {
    const { database } = createDatabase();

    const summary = await getLatestAccessibleScreeningSummary(actor, relationshipId, { database });

    expect(summary).toEqual({
      screeningAssessmentId: screeningId,
      submittedAt: new Date("2026-08-16T05:00:00.000Z"),
      result: { level: "L3", zone: "YELLOW" },
    });
    expect(summary).not.toHaveProperty("responses");
    expect(summary).not.toHaveProperty("result.pamTotal");
  });

  it("returns deduplicated, relationship-scoped minimal summaries in request order", async () => {
    const { database, screeningAssessment } = createDatabase({
      summaryRecords: [
        {
          id: screeningId,
          submittedAt: new Date("2026-08-16T05:00:00.000Z"),
          result,
        },
        {
          id: secondScreeningId,
          submittedAt: new Date("2026-08-16T06:00:00.000Z"),
          result,
        },
      ],
    });

    const summaries = await getAccessibleScreeningSummaries(
      actor,
      relationshipId,
      [secondScreeningId, screeningId, screeningId],
      { database },
    );

    expect(summaries.map((summary) => summary.screeningAssessmentId)).toEqual([
      secondScreeningId,
      screeningId,
    ]);
    expect(summaries[0]).toEqual({
      screeningAssessmentId: secondScreeningId,
      submittedAt: new Date("2026-08-16T06:00:00.000Z"),
      result: { level: "L3", zone: "YELLOW" },
    });
    expect(summaries[0]).not.toHaveProperty("responses");
    expect(summaries[0]).not.toHaveProperty("result.pamTotal");
    expect(screeningAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientHospitalRelationshipId: relationshipId,
          id: { in: [secondScreeningId, screeningId] },
        },
      }),
    );
  });

  it("omits a requested Screening that is absent from the authorized relationship result", async () => {
    const { database } = createDatabase({
      summaryRecords: [
        {
          id: screeningId,
          submittedAt: new Date("2026-08-16T05:00:00.000Z"),
          result,
        },
      ],
    });

    await expect(
      getAccessibleScreeningSummaries(actor, relationshipId, [secondScreeningId], { database }),
    ).resolves.toEqual([]);
  });

  it("returns no summaries without querying or authorizing an empty request", async () => {
    const { database, screeningAssessment } = createDatabase();

    await expect(getAccessibleScreeningSummaries(actor, relationshipId, [], { database })).resolves.toEqual([]);
    expect(screeningAssessment.findMany).not.toHaveBeenCalled();
    expect(vi.mocked(database.patientHospitalRelationship.findUnique)).not.toHaveBeenCalled();
    expect(vi.mocked(database.user.findUnique)).not.toHaveBeenCalled();
  });

  it("keeps the Screening read boundary authoritative for batch summaries", async () => {
    const { database, screeningAssessment } = createDatabase({ hospitalMembership: false });

    await expect(
      getAccessibleScreeningSummaries(actor, relationshipId, [screeningId], { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(screeningAssessment.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when a persisted batch summary result is invalid", async () => {
    const { database } = createDatabase({
      summaryRecords: [
        {
          id: screeningId,
          submittedAt: new Date("2026-08-16T05:00:00.000Z"),
          result: { level: "L3", zone: "YELLOW" },
        },
      ],
    });

    await expect(
      getAccessibleScreeningSummaries(actor, relationshipId, [screeningId], { database }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("returns relationship-scoped minimal history projections", async () => {
    const { database, screeningAssessment } = createDatabase({
      records: [
        {
          id: screeningId,
          submittedAt: new Date("2026-08-16T05:00:00.000Z"),
          result,
          conductedByUser: { person: { givenName: "ผู้ทำ", familyName: "แบบประเมิน" } },
        },
      ],
    });

    const history = await getScreeningHistory(actor, relationshipId, { database });

    expect(history.patient).toMatchObject({ patientHospitalRelationshipId: relationshipId, hospital: { id: hospitalId } });
    expect(history.items).toEqual([
      expect.objectContaining({
        screeningAssessmentId: screeningId,
        status: "SUBMITTED",
        conductedByDisplayName: "ผู้ทำ แบบประเมิน",
        result: { pamTotal: 10, promsTotal: 12, level: "L3", zone: "YELLOW" },
      }),
    ]);
    expect(history.items[0]).not.toHaveProperty("responses");
    expect(screeningAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientHospitalRelationshipId: relationshipId } }),
    );
  });

  it("returns validated detail answers including a nullable confidence plan", async () => {
    const { database } = createDatabase();

    const detail = await getScreeningDetail(actor, relationshipId, screeningId, { database });

    expect(detail).toMatchObject({
      screeningAssessmentId: screeningId,
      questionSetVersion: "legacy-prototype-v1",
      scoringVersion: "legacy-prototype-v1",
      responses: { confidenceScore: 7, confidenceImprovementPlan: null },
      result,
    });
  });

  it("resolves persisted definitions through the source registries", async () => {
    const questionSet = questionSetRegistry[0];

    if (!questionSet) {
      throw new Error("The source registry must contain the prototype question set");
    }

    const { database } = createDatabase({
      questionSetKey: questionSet.key,
      questionSetVersion: questionSet.version,
      scoringVersion: alternateScoringVersion,
    });

    const detail = await getScreeningDetail(actor, relationshipId, screeningId, { database });

    expect(detail.questionSetVersion).toBe(questionSet.version);
    expect(detail.scoringVersion).toBe(alternateScoringVersion);
  });

  it.each([
    ["question set version", { questionSetVersion: "unknown-question-set-version" }],
    ["scoring version", { scoringVersion: "unknown-scoring-version" }],
  ])("fails closed when the persisted %s is unavailable", async (_label, overrides) => {
    const { database } = createDatabase(overrides);

    await expect(getScreeningDetail(actor, relationshipId, screeningId, { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });

  it("denies a Hospital actor without a direct active membership", async () => {
    const { database } = createDatabase({ hospitalMembership: false });

    await expect(getScreeningHistory(actor, relationshipId, { database })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getLatestAccessibleScreeningSummary(actor, relationshipId, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
