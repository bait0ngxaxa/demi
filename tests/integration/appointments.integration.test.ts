import {
  AppointmentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  getAppointmentDetail,
  getAppointmentHistory,
} from "@/modules/appointments/services/appointment-query-service";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
} from "@/modules/appointments/services/appointment-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
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
      hospitalCode: `APPT-${code}-${sequence}`,
      name: `โรงพยาบาล Appointment ${code}`,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  profession?: Profession | null;
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `appointment-hospital-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      profession: input.profession ?? null,
      status: membershipStatus,
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
          profession: input.profession ?? null,
          status: membershipStatus,
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
    data: { identityKeyHash: `appointment-osm-${sequence}` },
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
    data: { identityKeyHash: `appointment-admin-${sequence}` },
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

function appointmentInput(relationshipId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    scheduledAt: bangkokIso(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    type: "CONSULTATION",
    responsibleUserId: null,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจต้นแบบ",
    note: "หมายเหตุสำหรับการตรวจ workflow",
    ...overrides,
  };
}

function rescheduleInput(
  relationshipId: string,
  appointmentId: string,
  expectedUpdatedAt: Date,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    appointmentId,
    expectedUpdatedAt: expectedUpdatedAt.toISOString(),
    scheduledAt: bangkokIso(new Date(Date.now() + 48 * 60 * 60 * 1000)),
    type: "FOLLOW_UP",
    responsibleUserId: null,
    durationMinutes: 45,
    locationType: "ONLINE",
    locationDetail: "ห้องประชุมออนไลน์",
    note: "หมายเหตุหลังเลื่อนนัด",
    ...overrides,
  };
}

function transitionInput(
  relationshipId: string,
  appointmentId: string,
  expectedUpdatedAt: Date,
): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    appointmentId,
    expectedUpdatedAt: expectedUpdatedAt.toISOString(),
  };
}

describe("Phase 9B.0 Appointment PostgreSQL workflow", () => {
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

  it("persists relationship-scoped history, retries by nonce, reschedules, and cancels atomically", async () => {
    const hospital = await createHospital("WORKFLOW");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
      profession: Profession.DOCTOR,
    });
    const member = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.MEMBER,
      profession: Profession.NURSE,
    });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "workflow-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "Appointment",
      hospitalNumber: "HN-APPT-001",
    });
    const input = appointmentInput(patient.relationshipId, { responsibleUserId: member.userId });

    const first = await createAppointment(owner.actor, input);
    const retry = await createAppointment(owner.actor, input);

    expect(retry.appointmentId).toBe(first.appointmentId);
    expect(await prisma.patientAppointment.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.created" } })).toBe(1);

    const history = await getAppointmentHistory(owner.actor, patient.relationshipId);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ appointmentId: first.appointmentId, status: AppointmentStatus.SCHEDULED });
    expect(JSON.stringify(history)).not.toContain("ห้องตรวจต้นแบบ");

    const detail = await getAppointmentDetail(owner.actor, patient.relationshipId, first.appointmentId);
    expect(detail).toMatchObject({
      type: "CONSULTATION",
      status: AppointmentStatus.SCHEDULED,
      responsibleUserId: member.userId,
      note: "หมายเหตุสำหรับการตรวจ workflow",
    });
    expect(detail.patient.patientHospitalRelationshipId).toBe(patient.relationshipId);

    const rescheduled = await rescheduleAppointment(
      owner.actor,
      rescheduleInput(patient.relationshipId, first.appointmentId, first.updatedAt),
    );
    expect(rescheduled.status).toBe(AppointmentStatus.SCHEDULED);
    const afterReschedule = await getAppointmentDetail(owner.actor, patient.relationshipId, first.appointmentId);
    expect(afterReschedule).toMatchObject({ type: "FOLLOW_UP", locationType: "ONLINE", durationMinutes: 45 });

    const cancelled = await cancelAppointment(
      owner.actor,
      transitionInput(patient.relationshipId, first.appointmentId, rescheduled.updatedAt),
    );
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
    await expect(
      cancelAppointment(
        owner.actor,
        transitionInput(patient.relationshipId, first.appointmentId, rescheduled.updatedAt),
      ),
    ).resolves.toMatchObject({ status: AppointmentStatus.CANCELLED });
    await expect(
      completeAppointment(owner.actor, transitionInput(patient.relationshipId, first.appointmentId, cancelled.updatedAt)),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await prisma.auditEvent.count({ where: { action: "appointment.created" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.rescheduled" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.cancelled" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.completed" } })).toBe(0);
    expect(await prisma.patientGoalPlan.count()).toBe(0);
    expect(await prisma.screeningAssessment.count()).toBe(0);
  });

  it("enforces direct Hospital scope, exact OSM assignment, and responsible-member validation", async () => {
    const hospital = await createHospital("SCOPE");
    const otherHospital = await createHospital("OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({
      hospitalId: otherHospital.id,
      membershipType: MembershipType.OWNER,
    });
    const osm = await createOsmActor(hospital.id);
    const unassignedOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "scope-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมหญิง",
      familyName: "ขอบเขต",
    });
    const secondPatient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "scope-patient-2" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "อีกความสัมพันธ์",
    });
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const appointment = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));

    await expect(getAppointmentHistory(otherOwner.actor, patient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      getAppointmentDetail(owner.actor, secondPatient.relationshipId, appointment.appointmentId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(createAppointment(otherOwner.actor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createAppointment(patientActor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createAppointment(admin, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createAppointment(owner.actor, appointmentInput(patient.relationshipId, { responsibleUserId: otherOwner.userId })),
    ).rejects.toBeInstanceOf(ValidationError);

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const osmHistory = await getAppointmentHistory(osm.actor, patient.relationshipId);
    expect(osmHistory.canManage).toBe(false);
    await expect(createAppointment(osm.actor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getAppointmentHistory(unassignedOsm.actor, patient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("uses server time for no-show and prevents stale or competing terminal updates", async () => {
    const hospital = await createHospital("LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "lifecycle-patient" },
      targetHospitalId: hospital.id,
      givenName: "สมชาย",
      familyName: "วงจรสถานะ",
    });

    const future = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));
    await expect(
      markAppointmentNoShow(owner.actor, transitionInput(patient.relationshipId, future.appointmentId, future.updatedAt)),
    ).rejects.toBeInstanceOf(ConflictError);

    const completed = await completeAppointment(
      owner.actor,
      transitionInput(patient.relationshipId, future.appointmentId, future.updatedAt),
    );
    expect(completed.status).toBe(AppointmentStatus.COMPLETED);
    await expect(
      cancelAppointment(owner.actor, transitionInput(patient.relationshipId, future.appointmentId, completed.updatedAt)),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      completeAppointment(owner.actor, transitionInput(patient.relationshipId, future.appointmentId, future.updatedAt)),
    ).resolves.toMatchObject({ status: AppointmentStatus.COMPLETED });

    const past = await createAppointment(
      owner.actor,
      appointmentInput(patient.relationshipId, {
        scheduledAt: bangkokIso(new Date(Date.now() - 60 * 1000)),
      }),
    );
    const noShow = await markAppointmentNoShow(
      owner.actor,
      transitionInput(patient.relationshipId, past.appointmentId, past.updatedAt),
    );
    expect(noShow.status).toBe(AppointmentStatus.NO_SHOW);

    const competing = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));
    const outcomes = await Promise.allSettled([
      completeAppointment(owner.actor, transitionInput(patient.relationshipId, competing.appointmentId, competing.updatedAt)),
      cancelAppointment(owner.actor, transitionInput(patient.relationshipId, competing.appointmentId, competing.updatedAt)),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const competingRow = await prisma.patientAppointment.findUnique({
      where: { id: competing.appointmentId },
      select: { status: true },
    });
    expect([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED]).toContain(competingRow?.status);

    const rescheduleTarget = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));
    const rescheduled = await rescheduleAppointment(
      owner.actor,
      rescheduleInput(patient.relationshipId, rescheduleTarget.appointmentId, rescheduleTarget.updatedAt),
    );
    await expect(
      rescheduleAppointment(
        owner.actor,
        rescheduleInput(patient.relationshipId, rescheduleTarget.appointmentId, rescheduleTarget.updatedAt),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(rescheduled.status).toBe(AppointmentStatus.SCHEDULED);

    expect(await prisma.auditEvent.count({ where: { action: "appointment.completed" } })).toBe(
      competingRow?.status === AppointmentStatus.COMPLETED ? 2 : 1,
    );
    expect(await prisma.auditEvent.count({ where: { action: "appointment.cancelled" } })).toBe(
      competingRow?.status === AppointmentStatus.CANCELLED ? 1 : 0,
    );
    expect(await prisma.auditEvent.count({ where: { action: "appointment.no_show" } })).toBe(1);
    expect(await prisma.patientGoalPlan.count()).toBe(0);
    expect(await prisma.screeningAssessment.count()).toBe(0);
  });
});
