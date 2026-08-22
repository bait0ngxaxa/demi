import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient, unassignOsmFromPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import { createPatientFinalAssessment } from "@/modules/patient-final-assessment/services/patient-final-assessment-service";
import { createGoalPlan, createGoalPlanForProgram } from "@/modules/goals/services/goal-service";
import { createFollowup, createFollowupForProgram } from "@/modules/followups/services/followup-service";
import {
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { completePatientProgram, openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { getProgramReportingProjection } from "@/modules/reporting/services/program-report-query-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientProgramServiceOneArtifactAssociation.deleteMany();
  await prisma.patientProgramServiceOneConfidence.deleteMany();
  await prisma.patientProgramServiceOneDreamCard.deleteMany();
  await prisma.patientProgramServiceOneFloatingChart.deleteMany();
  await prisma.patientProgramServiceOneRoutine.deleteMany();
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientFinalAssessment.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.patientProgram.deleteMany();
  await prisma.patientBaseline.deleteMany();
  await prisma.screeningAssessment.deleteMany();
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
      hospitalCode: `REPORT-${code}-${sequence}`,
      name: `โรงพยาบาล Report ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `report-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: input.hospitalId,
          membershipType,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `report-osm-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    },
  };
}

async function createAdminActor(): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `report-admin-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.ADMIN],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

async function createPatient(
  actor: ActorContext,
  hospitalId: string,
  value: string,
): Promise<{ relationshipId: string; userId: string; personId: string }> {
  return provisionPatient(actor, {
    identity: { namespace: "program-reporting-integration", value },
    targetHospitalId: hospitalId,
    givenName: "สมชาย",
    familyName: `Report ${value}`,
    hospitalNumber: `HN-REPORT-${value}`,
  });
}

function baselineInput(relationshipId: string): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: "2026-08-16",
    weight: 72.5,
    waistCircumference: 90,
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
    bloodSugarDtx: 95,
  };
}

function goalInput(patientProgramId: string, primaryGoalCode = "weight"): Record<string, unknown> {
  return {
    patientProgramId,
    submissionNonce: randomUUID(),
    sourceScreeningAssessmentId: null,
    primaryGoalCode,
    primaryGoalNote: "เป้าหมายของ Program",
    weeklyNote: "บันทึกแผน",
    items: [{ activityCode: "exercise_walk", targetDays: 3, targetValue: 15, targetUnit: "minutes" }],
  };
}

function relationshipGoalInput(relationshipId: string): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    sourceScreeningAssessmentId: null,
    primaryGoalCode: "weight",
    primaryGoalNote: "แผนก่อน Program",
    weeklyNote: null,
    items: [{ activityCode: "stop_sweet", targetDays: 4 }],
  };
}

function followupInput(
  patientProgramId: string,
  weight: number,
): Record<string, unknown> {
  return {
    patientProgramId,
    submissionNonce: randomUUID(),
    appointmentId: null,
    sourceGoalPlanId: null,
    weight,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    confidenceScore: null,
    reflectionNote: null,
    confidencePlan: null,
    generalNote: null,
    activityProgress: [],
  };
}

function relationshipFollowupInput(relationshipId: string): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    appointmentId: null,
    sourceGoalPlanId: null,
    weight: 60,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
    confidenceScore: null,
    reflectionNote: null,
    confidencePlan: null,
    generalNote: "ประวัติก่อน Program",
    activityProgress: [],
  };
}

function finalInput(
  patientProgramId: string,
  relationshipId: string,
  weight: number,
): Record<string, unknown> {
  return {
    patientProgramId,
    patientHospitalRelationshipId: relationshipId,
    weight,
    waistCircumference: null,
    systolicBloodPressure: null,
    diastolicBloodPressure: null,
    bloodSugar: null,
  };
}

describe("Phase 15E.1 Program reporting projection PostgreSQL boundary", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("projects exact Program history with neutral missing states and explicit pagination", async () => {
    const hospital = await createHospital("ISOLATION");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await createPatient(owner.actor, hospital.id, "A-B");

    await createPatientBaseline(owner.actor, baselineInput(patient.relationshipId));
    await createGoalPlan(owner.actor, relationshipGoalInput(patient.relationshipId));
    await createFollowup(owner.actor, relationshipFollowupInput(patient.relationshipId));

    const programA = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await recordPatientProgramServiceOneRoutine(owner.actor, {
      patientProgramId: programA.patientProgramId,
    });
    await createGoalPlanForProgram(owner.actor, goalInput(programA.patientProgramId));
    await createGoalPlanForProgram(owner.actor, goalInput(programA.patientProgramId, "glucose"));

    for (let round = 1; round <= 7; round += 1) {
      await createFollowupForProgram(owner.actor, followupInput(programA.patientProgramId, 60 + round));
    }

    await createPatientFinalAssessment(
      owner.actor,
      finalInput(programA.patientProgramId, patient.relationshipId, 70),
    );
    await completePatientProgram(owner.actor, { patientProgramId: programA.patientProgramId });

    const programB = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await recordPatientProgramServiceOneDreamCard(owner.actor, {
      patientProgramId: programB.patientProgramId,
      description: "ข้อมูลของ Program B",
    });
    await createGoalPlanForProgram(owner.actor, goalInput(programB.patientProgramId, "medication"));
    await createFollowupForProgram(owner.actor, followupInput(programB.patientProgramId, 81));
    await createPatientFinalAssessment(
      owner.actor,
      finalInput(programB.patientProgramId, patient.relationshipId, 80),
    );

    const firstFollowupPage = await getProgramReportingProjection(
      owner.actor,
      patient.relationshipId,
      programA.patientProgramId,
      { goalPlans: { pageSize: 1 }, followups: { pageSize: 5 } },
    );
    const secondFollowupPage = await getProgramReportingProjection(
      owner.actor,
      patient.relationshipId,
      programA.patientProgramId,
      { followups: { pageSize: 5, cursor: firstFollowupPage.followups.nextCursor } },
    );
    const secondGoalPage = await getProgramReportingProjection(
      owner.actor,
      patient.relationshipId,
      programA.patientProgramId,
      { goalPlans: { pageSize: 1, cursor: firstFollowupPage.goalPlans.nextCursor } },
    );
    const programBReport = await getProgramReportingProjection(
      owner.actor,
      patient.relationshipId,
      programB.patientProgramId,
    );

    expect(firstFollowupPage).toMatchObject({
      patientProgramId: programA.patientProgramId,
      patientHospitalRelationshipId: patient.relationshipId,
      lifecycle: { status: PatientProgramStatus.COMPLETED, completedAt: expect.any(Date) },
      linkedBaseline: {
        state: "PRESENT",
        measurements: { weight: { state: "RECORDED", value: 72.5 } },
      },
      serviceOne: {
        routine: { state: "PRESENT", recorded: true },
        floatingChart: { state: "MISSING", recorded: false },
        dreamCard: { state: "MISSING", recorded: false },
      },
      goalPlans: { totalCount: 2, items: [{ roundNumber: 1 }], hasMore: true },
      followups: { totalCount: 7, items: expect.any(Array), hasMore: true },
      finalAssessment: {
        state: "PRESENT",
        measurements: { weight: { state: "RECORDED", value: 70 } },
      },
    });
    expect(firstFollowupPage.followups.items).toHaveLength(5);
    expect(firstFollowupPage.followups.items.map((item) => item.roundNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(firstFollowupPage.followups.nextCursor).not.toBeNull();
    expect(secondFollowupPage.followups.items.map((item) => item.roundNumber)).toEqual([6, 7]);
    expect(secondFollowupPage.followups.hasMore).toBe(false);
    expect(secondGoalPage.goalPlans.items.map((item) => item.roundNumber)).toEqual([2]);
    expect(secondGoalPage.goalPlans.hasMore).toBe(false);

    expect(programBReport).toMatchObject({
      patientProgramId: programB.patientProgramId,
      linkedBaseline: { state: "MISSING", reason: "PROGRAM_HAS_NO_LINKED_BASELINE" },
      serviceOne: {
        routine: { state: "MISSING" },
        dreamCard: { state: "PRESENT", recorded: true },
      },
      goalPlans: { totalCount: 1, items: [{ roundNumber: 1 }] },
      followups: {
        totalCount: 1,
        items: [{ roundNumber: 1, measurements: { weight: { state: "RECORDED", value: 81 } } }],
      },
      finalAssessment: {
        state: "PRESENT",
        measurements: { weight: { state: "RECORDED", value: 80 } },
      },
    });
    expect(programBReport.goalPlans.items.map((item) => item.primaryGoalCode)).toEqual(["medication"]);
    expect(JSON.stringify(programBReport)).not.toContain("ประวัติแผนก่อน Program");
    expect(JSON.stringify(programBReport)).not.toContain("Program A");
    expect(JSON.stringify(programBReport)).not.toContain("hospitalNumber");
    expect(JSON.stringify(programBReport)).not.toContain("HN-REPORT-A-B");
    expect(JSON.stringify(programBReport)).not.toContain("BMI");
    expect(JSON.stringify(programBReport)).not.toContain("CVD");
    expect(JSON.stringify(programBReport)).not.toContain("HbA1c");
    expect(JSON.stringify(programBReport)).not.toContain("Height");
    expect(JSON.stringify(programBReport)).not.toContain("achievement");
    expect(JSON.stringify(programBReport)).not.toContain("success");
    expect(JSON.stringify(programBReport)).not.toContain("failure");
  });

  it("requires exact relationship ownership and current actor scope", async () => {
    const hospital = await createHospital("AUTH");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await createPatient(owner.actor, hospital.id, "auth");
    const otherPatient = await createPatient(owner.actor, hospital.id, "other");
    const program = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    const otherProgram = await openPatientProgram(owner.actor, {
      patientHospitalRelationshipId: otherPatient.relationshipId,
    });

    await expect(
      getProgramReportingProjection(member.actor, patient.relationshipId, program.patientProgramId),
    ).resolves.toMatchObject({ patientProgramId: program.patientProgramId });
    await expect(
      getProgramReportingProjection(otherOwner.actor, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getProgramReportingProjection(owner.actor, patient.relationshipId, otherProgram.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getProgramReportingProjection(admin, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    await expect(
      getProgramReportingProjection(osm.actor, patient.relationshipId, program.patientProgramId),
    ).resolves.toMatchObject({ patientProgramId: program.patientProgramId });
    await expect(
      getProgramReportingProjection(unassignedOsm.actor, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);

    await unassignOsmFromPatient(owner.actor, { patientHospitalRelationshipId: patient.relationshipId });
    await expect(
      getProgramReportingProjection(osm.actor, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);

    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    await expect(
      getProgramReportingProjection(patientActor, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await prisma.hospitalMembership.updateMany({
      where: { userId: owner.userId, hospitalId: hospital.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(
      getProgramReportingProjection(owner.actor, patient.relationshipId, program.patientProgramId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
