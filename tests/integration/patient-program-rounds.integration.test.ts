import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createFollowupForProgram } from "@/modules/followups/services/followup-service";
import { createGoalPlanForProgram } from "@/modules/goals/services/goal-service";
import {
  assignOsmToPatient,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { createPatientFinalAssessment } from "@/modules/patient-final-assessment/services/patient-final-assessment-service";
import {
  getProgramRoundDetail,
  getProgramRoundsOverview,
} from "@/modules/patient-program-rounds/services/round-query-service";
import {
  recordPatientProgramRoundReview,
  recordPatientProgramRoundVitals,
} from "@/modules/patient-program-rounds/services/round-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import {
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;
const previousCursorSecret = process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;

async function clearDatabase(): Promise<void> {
  await prisma.patientProgramRoundActivity.deleteMany();
  await prisma.patientProgramRoundVitals.deleteMany();
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientGoalPlan.updateMany({ where: { sourceFollowupId: { not: null } }, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany();
  await prisma.patientFinalAssessment.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  // Program-linked screenings reference the Program, so they are removed first.
  await prisma.screeningAssessment.deleteMany();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.patientEvidenceArtifact.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(code: string): Promise<{ id: string }> {
  sequence += 1;
  return prisma.hospital.create({
    data: {
      hospitalCode: `ROUND-${code}-${sequence}`,
      name: `โรงพยาบาล Round ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createUser(label: string): Promise<{ userId: string; personId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `round-${label}-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  return { userId: user.id, personId: person.id };
}

async function createOwner(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  const { userId, personId } = await createUser("owner");

  await prisma.userRole.create({ data: { userId, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: { userId, hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });

  return {
    userId,
    actor: {
      userId,
      personId,
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
    },
  };
}

async function createOsm(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  const { userId, personId } = await createUser("osm");

  await prisma.userRole.create({ data: { userId, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return {
    userId,
    actor: {
      userId,
      personId,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    },
  };
}

async function createPatient(actor: ActorContext, hospitalId: string, value: string): Promise<string> {
  const result = await provisionPatient(actor, {
    identity: { namespace: "round-integration", value },
    targetHospitalId: hospitalId,
    givenName: "สมชาย",
    familyName: "รอบบริการ",
    hospitalNumber: `HN-ROUND-${value}`,
  });

  return result.relationshipId;
}

type Fixture = {
  hospitalId: string;
  owner: Awaited<ReturnType<typeof createOwner>>;
  osm: Awaited<ReturnType<typeof createOsm>>;
  relationshipId: string;
  programId: string;
};

async function createFixture(label: string): Promise<Fixture> {
  const hospital = await createHospital(label);
  const owner = await createOwner(hospital.id);
  const osm = await createOsm(hospital.id);
  const relationshipId = await createPatient(owner.actor, hospital.id, label);

  await assignOsmToPatient(owner.actor, {
    patientHospitalRelationshipId: relationshipId,
    osmUserId: osm.userId,
  });
  const program = await openPatientProgram(owner.actor, { patientHospitalRelationshipId: relationshipId });

  return { hospitalId: hospital.id, owner, osm, relationshipId, programId: program.patientProgramId };
}

function vitalsInput(programId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientProgramId: programId,
    roundNumber: 1,
    submissionNonce: randomUUID(),
    serviceDate: "2026-08-17",
    weight: 74,
    heightCm: 162,
    waistCircumference: 92,
    systolicBloodPressure: 130,
    diastolicBloodPressure: 85,
    bloodSugar: 118,
    ...overrides,
  };
}

function reviewInput(
  programId: string,
  roundNumber: number,
  toolCode: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { patientProgramId: programId, roundNumber, toolCode, submissionNonce: randomUUID(), ...overrides };
}

function screeningInput(
  relationshipId: string,
  programId?: string,
): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    ...(programId ? { patientProgramId: programId } : {}),
    submissionNonce: randomUUID(),
    responses: {
      pam: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 },
      proms: { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
      confidenceScore: 7,
      confidenceImprovementPlan: null,
    },
  };
}

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof ForbiddenError || error instanceof NotFoundError,
  );
}

describe("Program six-round navigator (Phase A)", () => {
  beforeAll(async () => {
    process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = "synthetic-round-navigator-integration-secret";
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    if (previousCursorSecret === undefined) delete process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET;
    else process.env.DEMI_HOSPITAL_REPORTING_CURSOR_SECRET = previousCursorSecret;
    await prisma.$disconnect();
  });

  it("walks an assigned OSM through round 1: vitals, screening and Service 1 tools link into the ledger", async () => {
    const fixture = await createFixture("walk");

    const initial = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId);
    expect(initial.rounds).toHaveLength(6);
    expect(initial.rounds.every((round) => round.status === "NOT_RECORDED")).toBe(true);
    expect(initial.after.status).toBe("NOT_RECORDED");

    const emptyRound = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "1");
    expect(emptyRound.vitalsForm).toMatchObject({ canRecord: true, heightEditable: true, latestHeightCm: null });
    expect(emptyRound.activities.map((row) => row.toolCode)).toEqual(
      expect.arrayContaining(["PAM", "FLOATING_CHART", "KNOW_SELF"]),
    );
    expect(emptyRound.activities.find((row) => row.toolCode === "KNOW_SELF")?.status).toBe("AWAITING_FORM");

    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId));
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId));
    await recordPatientProgramServiceOneRoutine(fixture.osm.actor, { patientProgramId: fixture.programId });
    await recordPatientProgramServiceOneFloatingChart(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      summary: "ลอยจม",
    });

    const ledger = (
      await prisma.patientProgramRoundActivity.findMany({ where: { patientProgramId: fixture.programId } })
    ).sort((left, right) => left.toolCode.localeCompare(right.toolCode));
    expect(ledger.map((row) => [row.roundNumber, row.toolCode, row.source, row.mode, row.linkedRecordType])).toEqual([
      [1, "FLOATING_CHART", "PLANNED", "RECORDED", "SERVICE_ONE_FLOATING_CHART"],
      [1, "PAM", "PLANNED", "RECORDED", "SCREENING_ASSESSMENT"],
      [1, "PROMS", "PLANNED", "RECORDED", "SCREENING_ASSESSMENT"],
      [1, "ROUTINE", "EXTRA", "RECORDED", "SERVICE_ONE_ROUTINE"],
    ]);
    expect(ledger.every((row) => row.linkedRecordId !== null && row.recordedByUserId === fixture.osm.userId)).toBe(true);

    const overview = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId);
    expect(overview.rounds[0]).toMatchObject({ status: "RECORDED", hasVitals: true, activityCount: 4 });
    expect(overview.rounds[1]?.status).toBe("NOT_RECORDED");

    const round = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "1");
    expect(round.vitals).toMatchObject({ source: "ROUND_VITALS", weight: 74, heightCm: 162, bmi: 28.2 });
    expect(round.vitalsForm.canRecord).toBe(false);
    expect(round.activities.find((row) => row.toolCode === "PAM")).toMatchObject({ status: "DONE", mode: "RECORDED" });
    expect(round.addOptions.find((row) => row.toolCode === "DREAM_CARD")).toMatchObject({
      status: "NOT_DONE",
      recommended: false,
    });
  });

  it("records a repeated Service 1 tool in a later round as REVIEWED without a second Service 1 record", async () => {
    const fixture = await createFixture("review");
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      description: "ความฝัน",
    });

    const nonce = randomUUID();
    const first = await recordPatientProgramRoundReview(
      fixture.osm.actor,
      reviewInput(fixture.programId, 3, "DREAM_CARD", { submissionNonce: nonce }),
    );
    const replay = await recordPatientProgramRoundReview(
      fixture.osm.actor,
      reviewInput(fixture.programId, 3, "DREAM_CARD", { submissionNonce: nonce }),
    );
    const secondToken = await recordPatientProgramRoundReview(
      fixture.osm.actor,
      reviewInput(fixture.programId, 3, "DREAM_CARD"),
    );

    expect(first).toMatchObject({ operation: "RECORDED", source: "PLANNED", roundNumber: 3 });
    expect(replay).toMatchObject({ operation: "ALREADY_RECORDED", roundActivityId: first.roundActivityId });
    expect(secondToken).toMatchObject({ operation: "ALREADY_RECORDED", roundActivityId: first.roundActivityId });
    expect(await prisma.patientProgramServiceOneDreamCard.count({ where: { patientProgramId: fixture.programId } })).toBe(1);
    expect(
      await prisma.patientProgramRoundActivity.count({
        where: { patientProgramId: fixture.programId, roundNumber: 3, toolCode: "DREAM_CARD" },
      }),
    ).toBe(1);

    const round = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "3");
    expect(round.activities.find((row) => row.toolCode === "DREAM_CARD")).toMatchObject({
      status: "DONE",
      mode: "REVIEWED",
      source: "PLANNED",
    });
    expect((await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId)).rounds[2])
      .toMatchObject({ status: "RECORDED", hasVitals: false, activityCount: 1 });

    await expect(
      recordPatientProgramRoundReview(fixture.osm.actor, reviewInput(fixture.programId, 3, "FLOATING_CHART")),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      recordPatientProgramRoundReview(fixture.osm.actor, reviewInput(fixture.programId, 1, "DREAM_CARD")),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("stores an extra activity as EXTRA and keeps it visible in the round history", async () => {
    const fixture = await createFixture("extra");
    await recordPatientProgramServiceOneDreamCard(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      description: "ความฝัน",
    });

    // DREAM_CARD is not on the round 2 list, so adding it is an extra activity.
    const added = await recordPatientProgramRoundReview(
      fixture.osm.actor,
      reviewInput(fixture.programId, 2, "DREAM_CARD"),
    );
    expect(added.source).toBe("EXTRA");

    const stored = await prisma.patientProgramRoundActivity.findFirstOrThrow({ where: { id: added.roundActivityId } });
    expect(stored).toMatchObject({ source: "EXTRA", mode: "REVIEWED", roundNumber: 2, toolCode: "DREAM_CARD" });

    const round = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "2");
    expect(round.activities.find((row) => row.toolCode === "DREAM_CARD")).toMatchObject({
      status: "DONE",
      source: "EXTRA",
      mode: "REVIEWED",
    });
    expect(round.addOptions.some((row) => row.toolCode === "DREAM_CARD")).toBe(false);
  });

  it("maps the Goal Plan to round 2 and Follow-ups to rounds 3-6 with the plan's due items", async () => {
    const fixture = await createFixture("followup");
    await createGoalPlanForProgram(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      submissionNonce: randomUUID(),
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: null,
      weeklyNote: null,
      items: [
        { activityCode: "stop_sweet", targetDays: 4 },
        { activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" },
      ],
    });

    const dueBefore = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "3");
    expect(dueBefore.followupId).toBeNull();
    expect(dueBefore.canStartFollowup).toBe(true);
    expect(dueBefore.dueItems?.map((item) => item.activityCode)).toEqual(["stop_sweet", "exercise_walk"]);
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "4")).canStartFollowup)
      .toBe(false);

    const followup = await createFollowupForProgram(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      submissionNonce: randomUUID(),
      appointmentId: null,
      sourceGoalPlanId: null,
      weight: 72,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: 105,
      confidenceScore: null,
      reflectionNote: null,
      confidencePlan: null,
      generalNote: null,
      serviceDate: "2026-08-20",
      planAdjusted: false,
      hasObstacle: false,
      activityProgress: [],
    });
    expect(followup.roundNumber).toBe(1);

    const overview = await getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId);
    expect(overview.rounds.map((round) => round.status)).toEqual([
      "NOT_RECORDED",
      "RECORDED",
      "RECORDED",
      "NOT_RECORDED",
      "NOT_RECORDED",
      "NOT_RECORDED",
    ]);

    const round3 = await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "3");
    expect(round3.followupId).toBe(followup.followupId);
    expect(round3.vitals).toMatchObject({ source: "FOLLOWUP", weight: 72, bloodSugar: 105 });
    expect(round3.activities.find((row) => row.toolCode === "HEALTH_PLAN_REVIEW")).toMatchObject({
      status: "DONE",
      linkedRecord: { type: "FOLLOWUP", id: followup.followupId },
    });
    expect((await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "4")).canStartFollowup)
      .toBe(true);
    expect(
      (await getProgramRoundDetail(fixture.osm.actor, fixture.relationshipId, fixture.programId, "2")).activities.find(
        (row) => row.toolCode === "HEALTHY_PLAN",
      ),
    ).toMatchObject({ status: "DONE", source: "EXTRA", linkedRecord: { type: "GOAL_PLAN" } });
  });

  it("never creates duplicate round-vitals rows under concurrency and is idempotent by nonce", async () => {
    const fixture = await createFixture("concurrent");

    const results = await Promise.allSettled([
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId)),
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId, { weight: 80 })),
      recordPatientProgramRoundVitals(fixture.owner.actor, vitalsInput(fixture.programId, { weight: 81 })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toBeInstanceOf(ConflictError);
    }
    expect(await prisma.patientProgramRoundVitals.count({ where: { patientProgramId: fixture.programId } })).toBe(1);

    const sameNonce = vitalsInput(fixture.programId, { roundNumber: 2 });
    const replays = await Promise.all([
      recordPatientProgramRoundVitals(fixture.osm.actor, sameNonce),
      recordPatientProgramRoundVitals(fixture.osm.actor, sameNonce),
    ]);
    expect(replays.map((result) => result.operation).sort()).toEqual(["ALREADY_RECORDED", "RECORDED"]);
    expect(
      await prisma.patientProgramRoundVitals.count({ where: { patientProgramId: fixture.programId, roundNumber: 2 } }),
    ).toBe(1);

    const reused = vitalsInput(fixture.programId, { roundNumber: 2, weight: 99, submissionNonce: sameNonce.submissionNonce });
    await expect(recordPatientProgramRoundVitals(fixture.osm.actor, reused)).rejects.toBeInstanceOf(ConflictError);
  });

  it("denies unassigned, other-hospital, suspended and unassigned-after-the-fact actors", async () => {
    const fixture = await createFixture("authz");
    const otherOsm = await createOsm(fixture.hospitalId);
    const otherHospital = await createHospital("other");
    const outsideOwner = await createOwner(otherHospital.id);
    const outsideOsm = await createOsm(otherHospital.id);

    for (const actor of [otherOsm.actor, outsideOwner.actor, outsideOsm.actor]) {
      await expectDenied(getProgramRoundsOverview(actor, fixture.relationshipId, fixture.programId));
      await expectDenied(getProgramRoundDetail(actor, fixture.relationshipId, fixture.programId, "1"));
      await expectDenied(recordPatientProgramRoundVitals(actor, vitalsInput(fixture.programId)));
      await expectDenied(recordPatientProgramRoundReview(actor, reviewInput(fixture.programId, 3, "DREAM_CARD")));
    }
    expect(await prisma.patientProgramRoundVitals.count()).toBe(0);
    expect(await prisma.patientProgramRoundActivity.count()).toBe(0);

    // The assigned OSM works, then loses access when the OSM relationship is suspended.
    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId));
    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: fixture.osm.userId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expectDenied(
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId, { roundNumber: 2 })),
    );
    await expectDenied(getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId));
    await prisma.osmHospitalRelationship.updateMany({
      where: { userId: fixture.osm.userId },
      data: { status: MembershipStatus.ACTIVE },
    });

    // Ending the assignment removes the OSM's access to this patient.
    await unassignOsmFromPatient(fixture.owner.actor, { patientHospitalRelationshipId: fixture.relationshipId });
    await expectDenied(getProgramRoundsOverview(fixture.osm.actor, fixture.relationshipId, fixture.programId));
    await expectDenied(
      recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId, { roundNumber: 2 })),
    );
    // Hospital staff of the exact hospital still reads and writes.
    await expect(
      getProgramRoundsOverview(fixture.owner.actor, fixture.relationshipId, fixture.programId),
    ).resolves.toMatchObject({ patientProgramId: fixture.programId });
    expect(await prisma.patientProgramRoundVitals.count()).toBe(1);
  });

  it("links the screening to one Program only and rejects a Program of another relationship", async () => {
    const fixture = await createFixture("screening");
    const otherRelationshipId = await createPatient(fixture.owner.actor, fixture.hospitalId, "screening-other");

    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId));
    await expect(
      submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId)),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      submitScreening(fixture.owner.actor, screeningInput(otherRelationshipId, fixture.programId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    // A screening outside a Program round stays unlinked and is not a round activity.
    await submitScreening(fixture.owner.actor, screeningInput(fixture.relationshipId));

    expect(await prisma.screeningAssessment.count({ where: { patientProgramId: fixture.programId } })).toBe(1);
    expect(await prisma.screeningAssessment.count({ where: { patientHospitalRelationshipId: fixture.relationshipId } })).toBe(2);
    expect(await prisma.patientProgramRoundActivity.count({ where: { toolCode: "PAM" } })).toBe(1);
  });

  it("fills the Dashboard report gaps from round vitals, BMI, After HbA1c and the Program screening", async () => {
    const fixture = await createFixture("report");
    await recordPatientProgramRoundVitals(fixture.osm.actor, vitalsInput(fixture.programId));
    await recordPatientProgramRoundVitals(
      fixture.osm.actor,
      vitalsInput(fixture.programId, { roundNumber: 2, weight: 73, heightCm: 163, bloodSugar: 112 }),
    );
    await submitScreening(fixture.osm.actor, screeningInput(fixture.relationshipId, fixture.programId));
    await createPatientFinalAssessment(fixture.osm.actor, {
      patientProgramId: fixture.programId,
      patientHospitalRelationshipId: fixture.relationshipId,
      serviceDate: "2026-08-21",
      weight: 69,
      bloodSugar: 100,
      hba1c: 6.8,
    });

    const dataset = await getHospitalReportingDatasetForExport(fixture.owner.actor, { hospitalId: fixture.hospitalId });
    const row = dataset.programs.find((program) => program.patientProgramId === fixture.programId);

    expect(row?.roundVitals.round1).toMatchObject({
      state: "PRESENT",
      value: { measurements: { bloodSugar: { value: 118 }, weight: { value: 74 } } },
    });
    expect(row?.roundVitals.round2).toMatchObject({
      state: "PRESENT",
      value: { measurements: { bloodSugar: { value: 112 }, weight: { value: 73 } } },
    });
    expect(row?.latestHeightCm).toEqual({ state: "RECORDED", value: 163 });
    // No Baseline in this fixture, so only the After BMI is derivable.
    expect(row?.bmi.baseline).toEqual({ state: "NOT_RECORDED" });
    expect(row?.bmi.after).toEqual({ state: "RECORDED", value: 26 });
    expect(row?.finalAssessment).toMatchObject({ state: "PRESENT", value: { hba1c: { state: "RECORDED", value: 6.8 } } });
    expect(row?.screening).toMatchObject({ state: "PRESENT", value: { pamScore: expect.any(Number) as unknown } });
  });

  it("enforces round shape in the database", async () => {
    const fixture = await createFixture("constraints");
    const base = {
      patientProgramId: fixture.programId,
      patientHospitalRelationshipId: fixture.relationshipId,
      recordedByUserId: fixture.osm.userId,
    };

    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...base, roundNumber: 3, serviceDate: new Date("2026-08-17"), weight: 70, submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundVitals.create({
        data: { ...base, roundNumber: 1, serviceDate: new Date("2026-08-17"), submissionNonce: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundActivity.create({
        data: {
          ...base,
          roundNumber: 7,
          toolCode: "PAM",
          source: "PLANNED",
          mode: "RECORDED",
          performedAt: new Date(),
          submissionNonce: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.patientProgramRoundActivity.create({
        data: {
          ...base,
          roundNumber: 3,
          toolCode: "PAM",
          source: "PLANNED",
          mode: "REVIEWED",
          linkedRecordType: "SCREENING_ASSESSMENT",
          performedAt: new Date(),
          submissionNonce: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});
