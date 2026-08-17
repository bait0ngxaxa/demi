import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  getPatientBaseline,
  getPatientBaselineNavigationState,
  getPatientBaselinePageContext,
  patientBaselineNavigationSelect,
  patientBaselineSelect,
  type PatientBaselineQueryDatabase,
} from "./patient-baseline-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const baselineId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const recordedOn = new Date("2026-08-17T00:00:00.000Z");
const createdAt = new Date("2026-08-17T05:00:00.000Z");

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

function createDatabase(input: {
  baseline?: Record<string, unknown> | null;
  membership?: boolean;
  relationship?: Record<string, unknown> | null;
} = {}): PatientBaselineQueryDatabase & {
  patientBaseline: { findUnique: ReturnType<typeof vi.fn> };
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
        input.relationship === undefined
          ? {
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
            }
          : input.relationship,
      ),
    },
    patientBaseline: {
      findUnique: vi.fn().mockResolvedValue(input.baseline ?? null),
    },
  } as unknown as PatientBaselineQueryDatabase & {
    patientBaseline: { findUnique: ReturnType<typeof vi.fn> };
  };

  return database;
}

function baselineRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: baselineId,
    patientHospitalRelationshipId: relationshipId,
    recordedOn,
    recordedBy: {
      id: actorUserId,
      person: { givenName: "ผู้บันทึก", familyName: "ข้อมูลตั้งต้น" },
    },
    weight: 72.5,
    waistCircumference: null,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: null,
    adaptationSummary: "สรุป",
    adaptationObstacles: null,
    adaptationOpportunities: "โอกาส",
    confidenceScore: 0,
    confidenceImprovementPlan: null,
    summary: null,
    recommendations: "คำแนะนำ",
    createdAt,
    ...overrides,
  };
}

describe("Patient Baseline query service", () => {
  it("reads through the exact relationship and returns a bounded projection", async () => {
    const database = createDatabase({ baseline: baselineRecord() });

    const result = await getPatientBaseline(actor, relationshipId, { database });

    expect(result).toMatchObject({
      id: baselineId,
      patientHospitalRelationshipId: relationshipId,
      recordedOn,
      recorder: { id: actorUserId, displayName: "ผู้บันทึก ข้อมูลตั้งต้น" },
      measurements: {
        weight: 72.5,
        waistCircumference: null,
        bloodPressureSystolic: 120,
        bloodPressureDiastolic: 80,
        bloodSugarDtx: null,
      },
      confidence: { score: 0, improvementPlan: null },
      summary: null,
      recommendations: "คำแนะนำ",
      createdAt,
    });
    expect(JSON.stringify(result)).not.toContain("authSubject");
    expect(JSON.stringify(result)).not.toContain("memberships");
    expect(database.patientHospitalRelationship.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: relationshipId,
        OR: expect.any(Array),
      }),
      select: expect.anything(),
    });
    expect(database.patientBaseline.findUnique).toHaveBeenCalledWith({
      where: { patientHospitalRelationshipId: relationshipId },
      select: patientBaselineSelect,
    });
  });

  it("returns null for an absent Baseline and keeps the navigation query small", async () => {
    const database = createDatabase();

    await expect(getPatientBaseline(actor, relationshipId, { database })).resolves.toBeNull();
    await expect(getPatientBaselineNavigationState(actor, relationshipId, { database })).resolves.toEqual({
      baseline: null,
      canCreate: true,
    });
    expect(database.patientBaseline.findUnique).toHaveBeenLastCalledWith({
      where: { patientHospitalRelationshipId: relationshipId },
      select: patientBaselineNavigationSelect,
    });
  });

  it("allows creation in page context when no Baseline exists", async () => {
    const database = createDatabase();

    await expect(getPatientBaselinePageContext(actor, relationshipId, { database })).resolves.toMatchObject({
      baseline: null,
      canCreate: true,
    });
  });

  it("marks navigation creation unavailable when the Baseline already exists", async () => {
    const database = createDatabase({ baseline: baselineRecord() });

    await expect(getPatientBaselineNavigationState(actor, relationshipId, { database })).resolves.toEqual({
      baseline: { recordedOn },
      canCreate: false,
    });
  });

  it("returns the page context without exposing unrelated actor data", async () => {
    const database = createDatabase({ baseline: baselineRecord() });

    const context = await getPatientBaselinePageContext(actor, relationshipId, { database });

    expect(context.patient).toMatchObject({
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
    });
    expect(context.baseline?.recorder).toEqual({
      id: actorUserId,
      displayName: "ผู้บันทึก ข้อมูลตั้งต้น",
    });
    expect(context.canCreate).toBe(false);
    expect(JSON.stringify(context)).not.toContain("roles");
    expect(JSON.stringify(context)).not.toContain("credentials");
  });

  it("returns NotFound when the exact relationship is outside the actor scope", async () => {
    const database = createDatabase({ relationship: null });

    await expect(getPatientBaseline(actor, relationshipId, { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(database.patientBaseline.findUnique).not.toHaveBeenCalled();
  });

  it("rechecks the authoritative actor before reading the Baseline", async () => {
    const database = createDatabase({ membership: false });

    await expect(getPatientBaseline(actor, relationshipId, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(database.patientBaseline.findUnique).not.toHaveBeenCalled();
  });
});
