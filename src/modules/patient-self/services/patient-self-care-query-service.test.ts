import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  AppointmentLocationType,
  AppointmentStatus,
  AppointmentType,
  FollowupActivityProgressStatus,
  HospitalStatus,
  PatientProgramStatus,
  Profession,
  Role,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  getOwnPatientAppointmentDetail,
  getOwnPatientAppointmentHistory,
  getOwnPatientCareJourney,
  getOwnPatientFollowupDetail,
  getOwnPatientGoalPlanDetail,
  getOwnPatientProgramDetail,
  patientSelfCareQueryInternals,
  type PatientSelfCareQueryDatabase,
} from "./patient-self-care-query-service";

const userId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const relationshipId = "44444444-4444-4444-8444-444444444444";
const foreignRelationshipId = "55555555-5555-4555-8555-555555555555";
const programId = "66666666-6666-4666-8666-666666666666";
const goalPlanId = "77777777-7777-4777-8777-777777777777";
const followupId = "88888888-8888-4888-8888-888888888888";
const appointmentId = "99999999-9999-4999-8999-999999999999";

const recordedAt = new Date("2026-08-05T10:30:00.000Z");
const startedAt = new Date("2026-01-03T00:00:00.000Z");

function appointmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: appointmentId,
    type: AppointmentType.CONSULTATION,
    scheduledAt: recordedAt,
    durationMinutes: 30,
    locationType: AppointmentLocationType.CLINIC,
    locationDetail: "อาคารผู้ป่วยนอก",
    status: AppointmentStatus.SCHEDULED,
    updatedAt: recordedAt,
    responsibleUser: {
      person: { givenName: "Care", familyName: "Clinician" },
      memberships: [{ profession: Profession.DOCTOR }],
    },
    osmAssignmentAtCreation: {
      osmUser: { person: { givenName: "Assigned", familyName: "OSM" } },
    },
    acknowledgements: [{
      sourceAppointmentUpdatedAt: recordedAt,
      source: AppointmentInteractionSource.OSM_PROXY,
      acknowledgedAt: recordedAt,
      recordedByUserId: "internal-user-id",
    }],
    cancellationRequests: [{
      source: AppointmentInteractionSource.OSM_PROXY,
      status: AppointmentCancellationRequestStatus.PENDING,
      submittedAt: recordedAt,
      submittedByUserId: "internal-user-id",
    }],
    note: "internal note",
    createdByUserId: "internal-creator-id",
    ...overrides,
  };
}

function actor(roles: readonly Role[] = [Role.PATIENT]): ActorContext {
  return {
    userId,
    personId,
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

function ownRelationshipRecord(): Record<string, unknown> {
  return {
    patientProfile: {
      hospitalRelationships: [
        {
          id: relationshipId,
          hospitalNumber: "HN-001",
          hospital: {
            hospitalCode: "H-001",
            name: "โรงพยาบาล ก",
            status: HospitalStatus.SUSPENDED,
          },
        },
      ],
    },
  };
}

function goalPlanHistoryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: goalPlanId,
    roundNumber: 7,
    createdAt: recordedAt,
    primaryGoalCode: "weight",
    templateKey: "demi-goals",
    templateVersion: "legacy-prototype-v1",
    patientProgram: {
      status: PatientProgramStatus.COMPLETED,
      startedAt,
      completedAt: recordedAt,
    },
    ...overrides,
  };
}

function followupHistoryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: followupId,
    roundNumber: 7,
    recordedAt,
    patientProgram: {
      status: PatientProgramStatus.COMPLETED,
      startedAt,
      completedAt: recordedAt,
    },
    ...overrides,
  };
}

function createDatabase() {
  const database = {
    person: { findFirst: vi.fn().mockResolvedValue(ownRelationshipRecord()) },
    screeningAssessment: {
      findMany: vi.fn().mockResolvedValue([{ submittedAt: recordedAt, result: { pamTotal: 20 } }]),
    },
    patientBaseline: {
      findUnique: vi.fn().mockResolvedValue({
        recordedOn: new Date("2026-01-02T00:00:00.000Z"),
        weight: 72,
        heightCm: 165,
        waistCircumference: 88,
        bloodPressureSystolic: 120,
        bloodPressureDiastolic: 80,
        bloodSugarDtx: 106,
        hba1c: 5.6,
        recommendations: "คำแนะนำที่ยังไม่เปิดเผย",
        confidenceScore: 9,
        recordedByUserId: "internal-user-id",
      }),
    },
    patientProgram: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: programId,
          status: PatientProgramStatus.COMPLETED,
          startedAt,
          completedAt: recordedAt,
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: programId,
        status: PatientProgramStatus.COMPLETED,
        startedAt,
        completedAt: recordedAt,
        serviceOneRoutine: { recordedAt },
        serviceOneFloatingChart: null,
        serviceOneDreamCard: { recordedAt },
        serviceOneConfidence: { recordedAt, score: 10, improvementPlan: "gated" },
        finalAssessment: {
          recordedAt,
          weight: 68,
          waistCircumference: 84,
          systolicBloodPressure: 118,
          diastolicBloodPressure: 78,
          bloodSugar: 101,
          recordedByUserId: "internal-user-id",
        },
      }),
    },
    patientGoalPlan: {
      findMany: vi.fn().mockResolvedValue([goalPlanHistoryRecord()]),
      findFirst: vi.fn().mockResolvedValue({
        ...goalPlanHistoryRecord({
          primaryGoalNote: "บันทึกเป้าหมาย",
          weeklyNote: "บันทึกรายสัปดาห์",
          sourceScreeningAssessmentId: "screening-id-must-not-be-selected",
          items: [
            {
              activityCode: "exercise_walk",
              targetDays: 3,
              targetValue: 15,
              targetUnit: "minutes",
            },
          ],
        }),
      }),
    },
    patientFollowup: {
      findMany: vi.fn().mockResolvedValue([followupHistoryRecord()]),
      findFirst: vi.fn().mockResolvedValue({
        ...followupHistoryRecord({
          weight: 70,
          waistCircumference: 87,
          systolicBloodPressure: 121,
          diastolicBloodPressure: 81,
          bloodSugar: 109,
          confidenceScore: 10,
          reflectionNote: "gated reflection",
          confidencePlan: "gated plan",
          generalNote: "not in the patient view",
          sourceGoalPlan: {
            templateKey: "demi-goals",
            templateVersion: "legacy-prototype-v1",
          },
          activityProgress: [
            {
              goalActivityCode: "exercise_walk",
              status: FollowupActivityProgressStatus.DONE,
              note: "not in the patient view",
            },
          ],
        }),
      }),
    },
    patientAppointment: {
      findMany: vi.fn().mockResolvedValue([appointmentRecord()]),
      findFirst: vi.fn().mockResolvedValue(appointmentRecord()),
    },
  } as unknown as PatientSelfCareQueryDatabase;

  return database;
}

describe("Patient SELF care read projections", () => {
  it("reads only factual Screening and Baseline fields from the exact relationship", async () => {
    const database = createDatabase();

    const result = await getOwnPatientCareJourney(actor([Role.OSM, Role.PATIENT]), relationshipId, {
      database,
    });

    expect(result.relationship).toEqual({
      relationshipId,
      hospitalCode: "H-001",
      hospitalName: "โรงพยาบาล ก",
      hospitalNumber: "HN-001",
      hospitalStatus: HospitalStatus.SUSPENDED,
    });
    expect(database.screeningAssessment.findMany).toHaveBeenCalledWith({
      where: { patientHospitalRelationshipId: relationshipId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 51,
      select: patientSelfCareQueryInternals.screeningPatientSelect,
    });
    expect(database.patientBaseline.findUnique).toHaveBeenCalledWith({
      where: { patientHospitalRelationshipId: relationshipId },
      select: patientSelfCareQueryInternals.baselinePatientSelect,
    });
    expect(result.screenings).toEqual([{ submittedAt: recordedAt, status: "RECORDED" }]);
    expect(result.historyPages).toEqual({
      screenings: { page: 1, hasMore: false },
      programs: { page: 1, hasMore: false },
      goalPlans: { page: 1, hasMore: false },
      followups: { page: 1, hasMore: false },
    });
    expect(result.baseline).toEqual({
      recordedOn: new Date("2026-01-02T00:00:00.000Z"),
      measurements: {
        weight: 72,
        heightCm: 165,
        waistCircumference: 88,
        systolicBloodPressure: 120,
        diastolicBloodPressure: 80,
        bloodSugarDtx: 106,
        hba1c: 5.6,
      },
    });

    const projection = JSON.stringify({ screenings: result.screenings, baseline: result.baseline });
    for (const withheld of ["pamTotal", "promsTotal", "level", "zone", "responses", "recommendations", "confidenceScore", "recordedByUserId"]) {
      expect(projection).not.toContain(withheld);
    }
    expect(projection).not.toContain("BMI");
    expect(projection).not.toContain("diagnosis");
  });

  it("does not query any care record when the located relationship is foreign", async () => {
    const database = createDatabase();

    await expect(
      getOwnPatientCareJourney(actor(), foreignRelationshipId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(database.screeningAssessment.findMany).not.toHaveBeenCalled();
    expect(database.patientBaseline.findUnique).not.toHaveBeenCalled();
    expect(database.patientProgram.findMany).not.toHaveBeenCalled();
    expect(database.patientGoalPlan.findMany).not.toHaveBeenCalled();
    expect(database.patientFollowup.findMany).not.toHaveBeenCalled();
  });

  it("bounds care history queries and can continue Follow-up history after round six", async () => {
    const database = createDatabase();
    database.patientFollowup.findMany = vi.fn().mockResolvedValue(
      Array.from({ length: 51 }, (_, index) =>
        followupHistoryRecord({ roundNumber: index + 1 }),
      ),
    );

    const firstPage = await getOwnPatientCareJourney(
      actor(),
      relationshipId,
      { database },
      { followupPage: "1" },
    );

    expect(database.patientProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 51 }),
    );
    expect(database.patientGoalPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 51 }),
    );
    expect(database.patientFollowup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 51 }),
    );
    expect(firstPage.followups).toHaveLength(50);
    expect(firstPage.followups.at(-1)?.roundNumber).toBe(50);
    expect(firstPage.historyPages.followups).toEqual({ page: 1, hasMore: true });

    database.patientFollowup.findMany = vi
      .fn()
      .mockResolvedValue([followupHistoryRecord({ roundNumber: 51 })]);
    const secondPage = await getOwnPatientCareJourney(
      actor(),
      relationshipId,
      { database },
      { followupPage: "2" },
    );

    expect(database.patientFollowup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 51 }),
    );
    expect(secondPage.followups).toMatchObject([{ roundNumber: 51 }]);
    expect(secondPage.historyPages.followups).toEqual({ page: 2, hasMore: false });
  });

  it("rejects malformed history page requests before querying care records", async () => {
    const database = createDatabase();

    await expect(
      getOwnPatientCareJourney(actor(), relationshipId, { database }, { followupPage: "0" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(database.screeningAssessment.findMany).not.toHaveBeenCalled();
    expect(database.patientFollowup.findMany).not.toHaveBeenCalled();
  });

  it("returns Program lifecycle, factual Service 1 dates, Goal/Follow-up history, and raw Final facts", async () => {
    const database = createDatabase();

    const result = await getOwnPatientProgramDetail(actor(), relationshipId, programId, { database });

    expect(database.patientProgram.findFirst).toHaveBeenCalledWith({
      where: { id: programId, patientHospitalRelationshipId: relationshipId },
      select: patientSelfCareQueryInternals.programDetailSelect,
    });
    expect(database.patientGoalPlan.findMany).toHaveBeenCalledWith({
      where: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 51,
      select: patientSelfCareQueryInternals.goalPlanHistorySelect,
    });
    expect(database.patientFollowup.findMany).toHaveBeenCalledWith({
      where: { patientProgramId: programId, patientHospitalRelationshipId: relationshipId },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 51,
      select: patientSelfCareQueryInternals.followupHistorySelect,
    });
    expect(result.status).toBe(PatientProgramStatus.COMPLETED);
    expect(result.serviceOne).toEqual([
      { label: "Routine", recordedAt },
      { label: "Floating Chart", recordedAt: null },
      { label: "Dream Card", recordedAt },
      { label: "Confidence", recordedAt },
    ]);
    expect(result.goalPlans[0]).toMatchObject({
      goalPlanId,
      roundNumber: 7,
      primaryGoalLabel: "น้ำหนักลด",
    });
    expect(result.followups[0]).toMatchObject({ followupId, roundNumber: 7 });
    expect(result.finalAssessment).toEqual({
      recordedAt,
      measurements: {
        weight: 68,
        waistCircumference: 84,
        systolicBloodPressure: 118,
        diastolicBloodPressure: 78,
      },
    });
    expect(result.historyPages).toEqual({
      goalPlans: { page: 1, hasMore: false },
      followups: { page: 1, hasMore: false },
    });
    expect(JSON.stringify(patientSelfCareQueryInternals.programDetailSelect)).not.toContain(
      "bloodSugar",
    );

    const projection = JSON.stringify(result);
    for (const withheld of ["canManage", "canOpen", "score", "confidenceScore", "improvementPlan", "evidence", "pamTotal", "zone", "responses"]) {
      expect(projection).not.toContain(withheld);
    }
  });

  it("reads Goal Plan notes and activity targets without joining Screening context", async () => {
    const database = createDatabase();

    const result = await getOwnPatientGoalPlanDetail(actor(), relationshipId, goalPlanId, { database });

    expect(database.patientGoalPlan.findFirst).toHaveBeenCalledWith({
      where: { id: goalPlanId, patientHospitalRelationshipId: relationshipId },
      select: patientSelfCareQueryInternals.goalPlanDetailSelect,
    });
    expect(result).toMatchObject({
      goalPlanId,
      roundNumber: 7,
      primaryGoalLabel: "น้ำหนักลด",
      primaryGoalNote: "บันทึกเป้าหมาย",
      weeklyNote: "บันทึกรายสัปดาห์",
      items: [
        {
          activityLabel: "เดินออกกำลังกาย",
          targetDays: 3,
          targetValue: 15,
          targetUnit: "minutes",
        },
      ],
    });
    expect(JSON.stringify(patientSelfCareQueryInternals.goalPlanDetailSelect)).not.toContain(
      "sourceScreening",
    );
    expect(JSON.stringify(result)).not.toContain("sourceScreening");
  });

  it("reads round 7 Follow-up facts and safe progress while withholding gated fields", async () => {
    const database = createDatabase();

    const result = await getOwnPatientFollowupDetail(actor(), relationshipId, followupId, { database });

    expect(database.patientFollowup.findFirst).toHaveBeenCalledWith({
      where: { id: followupId, patientHospitalRelationshipId: relationshipId },
      select: patientSelfCareQueryInternals.followupDetailSelect,
    });
    expect(result).toMatchObject({
      followupId,
      roundNumber: 7,
      measurements: {
        weight: 70,
        waistCircumference: 87,
        systolicBloodPressure: 121,
        diastolicBloodPressure: 81,
      },
      activityProgress: [
        { activityLabel: "เดินออกกำลังกาย", status: FollowupActivityProgressStatus.DONE },
      ],
    });
    const projection = JSON.stringify(result);
    for (const withheld of ["confidenceScore", "reflectionNote", "confidencePlan", "generalNote", "note"]) {
      expect(projection).not.toContain(withheld);
    }
    expect(JSON.stringify(patientSelfCareQueryInternals.followupDetailSelect)).not.toContain(
      "bloodSugar",
    );
  });

  it("fails safely when Follow-up activity labels cannot be resolved", async () => {
    const database = createDatabase();

    database.patientFollowup.findFirst = vi.fn().mockResolvedValue(
      followupHistoryRecord({
        sourceGoalPlan: null,
        activityProgress: [],
      }),
    );
    const unlinked = await getOwnPatientFollowupDetail(actor(), relationshipId, followupId, {
      database,
    });
    expect(unlinked.activityProgress).toEqual([]);

    database.patientFollowup.findFirst = vi.fn().mockResolvedValue(
      followupHistoryRecord({
        sourceGoalPlan: { templateKey: "demi-goals", templateVersion: "missing-version" },
        activityProgress: [],
      }),
    );
    await expect(
      getOwnPatientFollowupDetail(actor(), relationshipId, followupId, { database }),
    ).rejects.toBeInstanceOf(InfrastructureError);

    database.patientFollowup.findFirst = vi.fn().mockResolvedValue(
      followupHistoryRecord({
        sourceGoalPlan: {
          templateKey: "demi-goals",
          templateVersion: "legacy-prototype-v1",
        },
        activityProgress: [
          {
            goalActivityCode: "missing_activity",
            status: FollowupActivityProgressStatus.DONE,
          },
        ],
      }),
    );
    await expect(
      getOwnPatientFollowupDetail(actor(), relationshipId, followupId, { database }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("reads only approved appointment fields and scopes detail by both IDs", async () => {
    const database = createDatabase();

    const history = await getOwnPatientAppointmentHistory(actor(), relationshipId, { database });

    expect(database.patientAppointment.findMany).toHaveBeenCalledWith({
      where: { patientHospitalRelationshipId: relationshipId },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 51,
      select: patientSelfCareQueryInternals.appointmentPatientSelect(relationshipId),
    });
    expect(history.appointments).toMatchObject([
      {
        appointmentId,
        type: AppointmentType.CONSULTATION,
        scheduledAt: recordedAt,
        durationMinutes: 30,
        locationType: AppointmentLocationType.CLINIC,
        locationDetail: "อาคารผู้ป่วยนอก",
        status: AppointmentStatus.SCHEDULED,
        updatedAt: recordedAt,
        responsibleDisplayName: "Care Clinician",
        responsibleProfession: Profession.DOCTOR,
        osmAtCreationDisplayName: "Assigned OSM",
        acknowledgement: {
          source: AppointmentInteractionSource.OSM_PROXY,
          acknowledgedAt: recordedAt,
        },
        cancellationRequests: [{
          source: AppointmentInteractionSource.OSM_PROXY,
          status: AppointmentCancellationRequestStatus.PENDING,
          submittedAt: recordedAt,
        }],
      },
    ]);
    expect(history.historyPage).toEqual({ page: 1, hasMore: false });
    expect(JSON.stringify(history)).not.toMatch(/responsibleUser|createdBy|internal note|canManage/);

    const detail = await getOwnPatientAppointmentDetail(actor(), relationshipId, appointmentId, {
      database,
    });

    expect(database.patientAppointment.findFirst).toHaveBeenCalledWith({
      where: { id: appointmentId, patientHospitalRelationshipId: relationshipId },
      select: patientSelfCareQueryInternals.appointmentPatientSelect(relationshipId),
    });
    expect(detail).toMatchObject({
      updatedAt: recordedAt,
      responsibleDisplayName: "Care Clinician",
      responsibleProfession: Profession.DOCTOR,
      osmAtCreationDisplayName: "Assigned OSM",
      acknowledgement: {
        source: AppointmentInteractionSource.OSM_PROXY,
        acknowledgedAt: recordedAt,
      },
      cancellationRequests: [{
        source: AppointmentInteractionSource.OSM_PROXY,
        status: AppointmentCancellationRequestStatus.PENDING,
        submittedAt: recordedAt,
      }],
    });
    expect(JSON.stringify(detail)).not.toMatch(/responsibleUser|createdBy|internal note/);
  });

  it("bounds appointment history and reads older pages on request", async () => {
    const database = createDatabase();
    database.patientAppointment.findMany = vi.fn().mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => appointmentRecord({
        scheduledAt: new Date(recordedAt.getTime() - index),
        locationDetail: null,
      })),
    );

    const firstPage = await getOwnPatientAppointmentHistory(actor(), relationshipId, { database });
    expect(firstPage.appointments).toHaveLength(50);
    expect(firstPage.historyPage).toEqual({ page: 1, hasMore: true });

    database.patientAppointment.findMany = vi.fn().mockResolvedValue([
      appointmentRecord({ locationDetail: null }),
    ]);
    const secondPage = await getOwnPatientAppointmentHistory(
      actor(),
      relationshipId,
      { database },
      "2",
    );

    expect(database.patientAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 51 }),
    );
    expect(secondPage.appointments).toHaveLength(1);
    expect(secondPage.historyPage).toEqual({ page: 2, hasMore: false });
  });

  it.each([
    ["COORDINATOR", Profession.COORDINATOR],
    ["OTHER", Profession.OTHER],
    ["null profession", null],
  ] as const)("keeps historical %s responsibility readable in the Patient projection", async (_label, profession) => {
    const database = createDatabase();
    database.patientAppointment.findMany = vi.fn().mockResolvedValue([
      appointmentRecord({
        responsibleUser: {
          person: { givenName: "History", familyName: "Coordinator" },
          memberships: [{ profession }],
        },
      }),
    ]);

    const history = await getOwnPatientAppointmentHistory(actor(), relationshipId, { database });

    expect(history.appointments[0]).toMatchObject({
      responsibleDisplayName: "History Coordinator",
      responsibleProfession: profession,
    });
    expect(JSON.stringify(history)).not.toMatch(
      /responsibleUserId|membershipType|createdByUser|note|phone|email|assignmentId|actorUserId|resolverUserId/,
    );
  });

  it("shows an unassigned responsible person as not specified", async () => {
    const database = createDatabase();
    database.patientAppointment.findMany = vi.fn().mockResolvedValue([
      appointmentRecord({ responsibleUser: null }),
    ]);

    const history = await getOwnPatientAppointmentHistory(actor(), relationshipId, { database });

    expect(history.appointments[0]).toMatchObject({
      responsibleDisplayName: null,
      responsibleProfession: null,
    });
  });

  it("returns the same not-found result for foreign Program, Goal Plan, Follow-up, and Appointment IDs", async () => {
    const database = createDatabase();
    database.patientProgram.findFirst = vi.fn().mockResolvedValue(null);
    database.patientGoalPlan.findFirst = vi.fn().mockResolvedValue(null);
    database.patientFollowup.findFirst = vi.fn().mockResolvedValue(null);
    database.patientAppointment.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      getOwnPatientProgramDetail(actor(), relationshipId, programId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOwnPatientGoalPlanDetail(actor(), relationshipId, goalPlanId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOwnPatientFollowupDetail(actor(), relationshipId, followupId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOwnPatientAppointmentDetail(actor(), relationshipId, appointmentId, { database }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(database.patientProgram.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: programId, patientHospitalRelationshipId: relationshipId },
      }),
    );
    expect(database.patientAppointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: appointmentId, patientHospitalRelationshipId: relationshipId },
      }),
    );
  });

  it("keeps the Patient DTOs allowlisted and structurally free of operator/clinical fields", () => {
    const selectors = JSON.stringify(patientSelfCareQueryInternals);

    for (const withheld of [
      "pamTotal",
      "promsTotal",
      "level",
      "zone",
      "responses",
      "scoringVersion",
      "recommendations",
      "confidenceScore",
      "confidencePlan",
      "reflectionNote",
      "generalNote",
      "responsibleUserId",
      "createdByUser",
      "recordedByUser",
      "serviceOneArtifact",
      "patientEvidenceArtifact",
      "sourceScreeningAssessmentId",
    ]) {
      expect(selectors).not.toContain(withheld);
    }

    const appointmentSelector = JSON.stringify(
      patientSelfCareQueryInternals.appointmentPatientSelect(relationshipId),
    );
    for (const withheld of [
      "responsibleUserId",
      "createdByUser",
      "recordedByUser",
      "submittedByUser",
      "resolvedByUser",
      "submissionNonce",
      "internal note",
      "phone",
      "email",
      "assignmentId",
      "recordedByUserId",
      "submittedByUserId",
      "resolvedByUserId",
      "membershipType",
      "hospitalId",
      "userId",
    ]) {
      expect(appointmentSelector).not.toContain(withheld);
    }
  });
});
