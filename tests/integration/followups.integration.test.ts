import {
  AppointmentStatus,
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
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { completeAppointment, createAppointment } from "@/modules/appointments/services/appointment-service";
import { createGoalPlan } from "@/modules/goals/services/goal-service";
import { getFollowupDetail, getFollowupHistory } from "@/modules/followups/services/followup-query-service";
import { createFollowup } from "@/modules/followups/services/followup-service";
import { ForbiddenError, ConflictError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientFollowupActivityProgress.deleteMany();
  await prisma.patientFollowup.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.patientGoalItem.deleteMany();
  await prisma.patientGoalPlan.deleteMany();
  await prisma.screeningAssessment.deleteMany();
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
      hospitalCode: `FOLLOWUP-${code}-${sequence}`,
      name: `โรงพยาบาล Follow-up ${code}`,
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
    data: { identityKeyHash: `followup-hospital-${sequence}` },
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
    data: { identityKeyHash: `followup-osm-${sequence}` },
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
    data: { identityKeyHash: `followup-admin-${sequence}` },
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

function bangkokIso(date: Date): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, -1)}+07:00`;
}

function followupInput(relationshipId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    appointmentId: null,
    sourceGoalPlanId: null,
    weight: 72.5,
    waistCircumference: 90,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    bloodSugar: 95,
    confidenceScore: 7,
    reflectionNote: "ข้อความสะท้อนที่ไม่ควรอยู่ใน audit",
    confidencePlan: "แผนความมั่นใจแบบต้นแบบ",
    generalNote: "หมายเหตุทั่วไปที่ไม่ควรอยู่ใน audit",
    activityProgress: [],
    ...overrides,
  };
}

describe("Phase 9C.0 Follow-up PostgreSQL workflow", () => {
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

  it("persists an immutable relationship-scoped round with completed Appointment and exact Goal Plan provenance", async () => {
    const hospital = await createHospital("WORKFLOW");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "followup-integration", value: "workflow-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "Follow-up",
      hospitalNumber: "HN-FOLLOWUP-001",
    });
    const goal = await createGoalPlan(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      sourceScreeningAssessmentId: null,
      primaryGoalCode: "weight",
      primaryGoalNote: "เป้าหมายต้นแบบ",
      weeklyNote: "หมายเหตุแผน",
      items: [
        { activityCode: "stop_sweet", targetDays: 4 },
        { activityCode: "exercise_walk", targetDays: 3, targetValue: 30, targetUnit: "minutes" },
      ],
    });
    const appointment = await createAppointment(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      scheduledAt: bangkokIso(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      type: "FOLLOW_UP",
      responsibleUserId: null,
      durationMinutes: 30,
      locationType: "CLINIC",
      locationDetail: "ห้องตรวจต้นแบบ",
      note: "นัดหมายต้นแบบ",
    });
    const completed = await completeAppointment(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      expectedUpdatedAt: appointment.updatedAt.toISOString(),
    });
    const input = followupInput(patient.relationshipId, {
      submissionNonce: randomUUID(),
      appointmentId: appointment.appointmentId,
      sourceGoalPlanId: goal.goalPlanId,
      activityProgress: [
        { goalActivityCode: "stop_sweet", status: "PARTIAL", note: "ทำได้บางส่วน" },
        { goalActivityCode: "exercise_walk", status: "DONE", note: null },
      ],
    });

    const first = await createFollowup(owner.actor, input);
    const retry = await createFollowup(owner.actor, input);

    expect(retry.followupId).toBe(first.followupId);
    expect(retry.roundNumber).toBe(1);
    expect(completed.status).toBe(AppointmentStatus.COMPLETED);
    expect(await prisma.patientFollowup.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.patientFollowupActivityProgress.count({ where: { followupId: first.followupId } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "followup.created" } })).toBe(1);

    const detail = await getFollowupDetail(owner.actor, patient.relationshipId, first.followupId);
    expect(detail).toMatchObject({
      followupId: first.followupId,
      roundNumber: 1,
      appointment: { appointmentId: appointment.appointmentId },
      sourceGoalPlan: { goalPlanId: goal.goalPlanId, roundNumber: goal.roundNumber },
      activityProgress: [
        { goalActivityCode: "stop_sweet", status: "PARTIAL" },
        { goalActivityCode: "exercise_walk", status: "DONE" },
      ],
    });
    const audit = await prisma.auditEvent.findFirst({ where: { action: "followup.created" } });
    expect(JSON.stringify(audit?.metadata)).not.toContain("ข้อความสะท้อนที่ไม่ควรอยู่ใน audit");
    expect(JSON.stringify(audit?.metadata)).not.toContain("72.5");
    expect(await prisma.patientAppointment.findUnique({ where: { id: appointment.appointmentId }, select: { status: true } })).toEqual({
      status: AppointmentStatus.COMPLETED,
    });
    expect(await prisma.patientGoalPlan.count({ where: { id: goal.goalPlanId } })).toBe(1);
    expect(await prisma.screeningAssessment.count()).toBe(0);
  });

  it("enforces direct scope, exact OSM assignment, and nonce conflict behavior", async () => {
    const hospital = await createHospital("SCOPE");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "followup-integration", value: "scope-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ขอบเขต",
    });
    const input = followupInput(patient.relationshipId);
    const first = await createFollowup(owner.actor, input);

    await expect(getFollowupHistory(otherOwner.actor, patient.relationshipId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getFollowupHistory(unassignedOsm.actor, patient.relationshipId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getFollowupHistory(admin, patient.relationshipId)).rejects.toBeInstanceOf(ForbiddenError);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    await expect(getFollowupHistory(patientActor, patient.relationshipId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createFollowup(owner.actor, { ...input, generalNote: "payload เปลี่ยน" })).rejects.toBeInstanceOf(
      ConflictError,
    );

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const osmHistory = await getFollowupHistory(osm.actor, patient.relationshipId);
    expect(osmHistory.items).toHaveLength(1);
    const osmRound = await createFollowup(osm.actor, followupInput(patient.relationshipId));
    expect(osmRound.roundNumber).toBe(2);
    expect(first.roundNumber).toBe(1);
  });

  it("allocates distinct relationship rounds for concurrent submissions with different nonces", async () => {
    const hospital = await createHospital("CONCURRENT-ROUNDS");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "followup-integration", value: "concurrent-rounds-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "พร้อมกัน",
    });

    const [first, second] = await Promise.all([
      createFollowup(owner.actor, followupInput(patient.relationshipId)),
      createFollowup(owner.actor, followupInput(patient.relationshipId)),
    ]);

    expect(new Set([first.followupId, second.followupId]).size).toBe(2);
    expect(new Set([first.roundNumber, second.roundNumber])).toEqual(new Set([1, 2]));
    expect(
      await prisma.patientFollowup.count({
        where: { patientHospitalRelationshipId: patient.relationshipId },
      }),
    ).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "followup.created" } })).toBe(2);
  });

  it("replays one committed Follow-up for concurrent identical nonce and payload", async () => {
    const hospital = await createHospital("CONCURRENT-REPLAY");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "followup-integration", value: "concurrent-replay-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ส่งซ้ำ",
    });
    const input = followupInput(patient.relationshipId);

    const [first, second] = await Promise.all([
      createFollowup(owner.actor, input),
      createFollowup(owner.actor, input),
    ]);

    expect(first.followupId).toBe(second.followupId);
    expect(first.roundNumber).toBe(1);
    expect(second.roundNumber).toBe(1);
    expect(
      await prisma.patientFollowup.count({
        where: { patientHospitalRelationshipId: patient.relationshipId },
      }),
    ).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "followup.created" } })).toBe(1);
  });

  it("conflicts safely when concurrent requests reuse a nonce with changed payload", async () => {
    const hospital = await createHospital("CONCURRENT-CONFLICT");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "followup-integration", value: "concurrent-conflict-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "ขัดแย้ง",
    });
    const submissionNonce = randomUUID();
    const firstInput = followupInput(patient.relationshipId, {
      submissionNonce,
      generalNote: "payload หนึ่ง",
    });
    const secondInput = followupInput(patient.relationshipId, {
      submissionNonce,
      generalNote: "payload สอง",
    });

    const outcomes = await Promise.allSettled([
      createFollowup(owner.actor, firstInput),
      createFollowup(owner.actor, secondInput),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof createFollowup>>> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.patientFollowup.count({ where: { submissionNonce } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "followup.created" } })).toBe(1);
  });
});
