import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
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
  acknowledgeAppointmentOnBehalfOfPatient,
  acknowledgeOwnPatientAppointment,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  markAppointmentNoShow,
  recordAppointmentCoordination,
  requestAppointmentCancellationOnBehalfOfPatient,
  requestOwnPatientAppointmentCancellation,
  reviewAppointmentCancellationRequest,
  rescheduleAppointment,
} from "@/modules/appointments/services/appointment-service";
import { getOwnPatientAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";
import { unassignOsmFromPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientAppointmentCoordinationEvent.deleteMany();
  await prisma.patientAppointmentCancellationRequest.deleteMany();
  await prisma.patientAppointmentAcknowledgement.deleteMany();
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
}): Promise<{ actor: ActorContext; userId: string; displayName: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `appointment-hospital-${sequence}`,
      givenName: "Staff",
      familyName: String(sequence),
    },
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
    displayName: `Staff ${sequence}`,
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

async function createOsmActor(hospitalId: string): Promise<{ actor: ActorContext; userId: string; displayName: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `appointment-osm-${sequence}`,
      givenName: "OSM",
      familyName: String(sequence),
    },
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
    displayName: `OSM ${sequence}`,
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

async function activateProvisionedPatient(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { status: UserStatus.ACTIVE, authSubject: randomUUID() },
  });
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

    const replayAfterReschedule = await createAppointment(owner.actor, input);
    expect(replayAfterReschedule).toMatchObject({
      appointmentId: first.appointmentId,
      status: AppointmentStatus.SCHEDULED,
    });
    const detailAfterReplay = await getAppointmentDetail(owner.actor, patient.relationshipId, first.appointmentId);
    expect(detailAfterReplay).toMatchObject({
      type: "FOLLOW_UP",
      locationType: "ONLINE",
      durationMinutes: 45,
      note: "หมายเหตุหลังเลื่อนนัด",
    });
    await expect(createAppointment(member.actor, input)).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createAppointment(owner.actor, { ...input, note: "เปลี่ยน payload เดิม" }),
    ).rejects.toBeInstanceOf(ConflictError);

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
    const otherHospitalOsm = await createOsmActor(otherHospital.id);
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
    await activateProvisionedPatient(patient.userId);
    const nonceInput = appointmentInput(patient.relationshipId);
    const appointment = await createAppointment(owner.actor, nonceInput);
    const foreignAppointment = await createAppointment(
      owner.actor,
      appointmentInput(secondPatient.relationshipId),
    );

    await expect(getAppointmentHistory(otherOwner.actor, patient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      getAppointmentDetail(owner.actor, secondPatient.relationshipId, appointment.appointmentId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createAppointment(owner.actor, { ...nonceInput, patientHospitalRelationshipId: secondPatient.relationshipId }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(createAppointment(otherOwner.actor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createAppointment(patientActor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(acknowledgeOwnPatientAppointment(patientActor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
      appointmentId: foreignAppointment.appointmentId,
      expectedUpdatedAt: foreignAppointment.updatedAt.toISOString(),
    })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestOwnPatientAppointmentCancellation(patientActor, {
      patientHospitalRelationshipId: secondPatient.relationshipId,
      appointmentId: foreignAppointment.appointmentId,
      expectedUpdatedAt: foreignAppointment.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAppointment(admin, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createAppointment(owner.actor, appointmentInput(patient.relationshipId, { responsibleUserId: otherOwner.userId })),
    ).rejects.toBeInstanceOf(ValidationError);

    const assignment = await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: osm.userId,
    });
    const osmHistory = await getAppointmentHistory(osm.actor, patient.relationshipId);
    expect(osmHistory.canManage).toBe(false);
    expect(osmHistory.canCreate).toBe(true);
    const osmCreatedAppointment = await createAppointment(osm.actor, appointmentInput(patient.relationshipId));
    expect(await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: osmCreatedAppointment.appointmentId },
      select: { osmAssignmentIdAtCreation: true },
    })).toEqual({ osmAssignmentIdAtCreation: assignment.assignmentId });
    const proxyInput = {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmCreatedAppointment.appointmentId,
      expectedUpdatedAt: osmCreatedAppointment.updatedAt.toISOString(),
    };
    await expect(rescheduleAppointment(osm.actor, rescheduleInput(
      patient.relationshipId,
      osmCreatedAppointment.appointmentId,
      osmCreatedAppointment.updatedAt,
    ))).rejects.toBeInstanceOf(ForbiddenError);
    for (const deniedOsm of [unassignedOsm, otherHospitalOsm]) {
      await expect(acknowledgeAppointmentOnBehalfOfPatient(deniedOsm.actor, proxyInput))
        .rejects.toBeInstanceOf(ForbiddenError);
      await expect(requestAppointmentCancellationOnBehalfOfPatient(deniedOsm.actor, {
        ...proxyInput,
        submissionNonce: randomUUID(),
      })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(recordAppointmentCoordination(deniedOsm.actor, {
        patientHospitalRelationshipId: patient.relationshipId,
        appointmentId: osmCreatedAppointment.appointmentId,
        submissionNonce: randomUUID(),
      })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(getAppointmentHistory(unassignedOsm.actor, patient.relationshipId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createAppointment(unassignedOsm.actor, appointmentInput(patient.relationshipId))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("keeps acknowledgement separate, records exact OSM actions, and atomically reviews cancellation", async () => {
    const hospital = await createHospital("INTERACTIONS");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const clinician = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.NURSE });
    const firstOsm = await createOsmActor(hospital.id);
    const secondOsm = await createOsmActor(hospital.id);
    const admin = await createAdminActor();
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "interaction-patient" },
      targetHospitalId: hospital.id,
      givenName: "ผู้ป่วย",
      familyName: "Interaction",
    });
    await activateProvisionedPatient(patient.userId);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    const legacyAppointment = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));
    const legacyRow = await prisma.patientAppointment.findUnique({
      where: { id: legacyAppointment.appointmentId },
      select: { osmAssignmentIdAtCreation: true },
    });
    expect(legacyRow?.osmAssignmentIdAtCreation).toBeNull();

    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: firstOsm.userId,
    });
    const assignmentAtCreation = await prisma.patientOsmAssignment.findFirstOrThrow({
      where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null },
      select: { id: true },
    });
    const osmAppointment = await createAppointment(
      firstOsm.actor,
      appointmentInput(patient.relationshipId, {
        responsibleUserId: clinician.userId,
        note: "Work-only appointment note",
      }),
    );
    const createdRow = await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: osmAppointment.appointmentId },
      select: { osmAssignmentIdAtCreation: true, status: true },
    });
    expect(createdRow).toMatchObject({
      osmAssignmentIdAtCreation: assignmentAtCreation.id,
      status: AppointmentStatus.SCHEDULED,
    });

    const acknowledgementInput = {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmAppointment.appointmentId,
      expectedUpdatedAt: osmAppointment.updatedAt.toISOString(),
    };
    const proxyAcknowledgement = await acknowledgeAppointmentOnBehalfOfPatient(
      firstOsm.actor,
      acknowledgementInput,
    );
    const patientRetry = await acknowledgeOwnPatientAppointment(patientActor, acknowledgementInput);
    expect(patientRetry).toMatchObject({
      source: AppointmentInteractionSource.OSM_PROXY,
      acknowledgedAt: proxyAcknowledgement.acknowledgedAt,
    });
    expect(await prisma.patientAppointmentAcknowledgement.count({
      where: { appointmentId: osmAppointment.appointmentId },
    })).toBe(1);
    expect(await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: osmAppointment.appointmentId },
      select: { status: true },
    })).toEqual({ status: AppointmentStatus.SCHEDULED });

    const legacyAcknowledgementInput = {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: legacyAppointment.appointmentId,
      expectedUpdatedAt: legacyAppointment.updatedAt.toISOString(),
    };
    const concurrentAcknowledgements = await Promise.all([
      acknowledgeOwnPatientAppointment(patientActor, legacyAcknowledgementInput),
      acknowledgeAppointmentOnBehalfOfPatient(firstOsm.actor, legacyAcknowledgementInput),
    ]);
    expect(concurrentAcknowledgements[0]).toMatchObject({
      source: concurrentAcknowledgements[1].source,
      acknowledgedAt: concurrentAcknowledgements[1].acknowledgedAt,
    });
    expect(await prisma.patientAppointmentAcknowledgement.count({
      where: { appointmentId: legacyAppointment.appointmentId },
    })).toBe(1);

    const patientProjection = await getOwnPatientAppointmentDetail(
      patientActor,
      patient.relationshipId,
      osmAppointment.appointmentId,
    );
    expect(patientProjection).toMatchObject({
      responsibleDisplayName: clinician.displayName,
      osmAtCreationDisplayName: firstOsm.displayName,
    });
    expect(JSON.stringify(patientProjection)).not.toContain("Work-only appointment note");
    expect(JSON.stringify(patientProjection)).not.toContain("createdByUserId");
    expect(JSON.stringify(patientProjection)).not.toContain("recordedByUserId");

    const coordinationInput = {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmAppointment.appointmentId,
      submissionNonce: randomUUID(),
    };
    const coordination = await recordAppointmentCoordination(firstOsm.actor, coordinationInput);
    const coordinationRetry = await recordAppointmentCoordination(firstOsm.actor, coordinationInput);
    expect(coordinationRetry.eventId).toBe(coordination.eventId);
    expect(await prisma.patientAppointmentCoordinationEvent.count({
      where: { appointmentId: osmAppointment.appointmentId },
    })).toBe(1);
    await expect(recordAppointmentCoordination(firstOsm.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: legacyAppointment.appointmentId,
      submissionNonce: coordinationInput.submissionNonce,
    })).rejects.toBeInstanceOf(ConflictError);

    const requestInput = {
      ...acknowledgementInput,
      submissionNonce: randomUUID(),
    };
    const proxyRequest = await requestAppointmentCancellationOnBehalfOfPatient(firstOsm.actor, requestInput);
    const patientRequestRetry = await requestOwnPatientAppointmentCancellation(patientActor, {
      ...requestInput,
      submissionNonce: randomUUID(),
    });
    expect(patientRequestRetry.requestId).toBe(proxyRequest.requestId);
    expect(patientRequestRetry.status).toBe(AppointmentCancellationRequestStatus.PENDING);
    expect(await prisma.patientAppointmentCancellationRequest.count({
      where: { appointmentId: osmAppointment.appointmentId, status: AppointmentCancellationRequestStatus.PENDING },
    })).toBe(1);
    for (const unauthorizedReviewer of [firstOsm.actor, patientActor, admin]) {
      await expect(reviewAppointmentCancellationRequest(unauthorizedReviewer, {
        patientHospitalRelationshipId: patient.relationshipId,
        appointmentId: osmAppointment.appointmentId,
        requestId: proxyRequest.requestId,
        decision: "REJECT",
      })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(
      cancelAppointment(patientActor, transitionInput(patient.relationshipId, osmAppointment.appointmentId, osmAppointment.updatedAt)),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await unassignOsmFromPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
    });
    await assignOsmToPatient(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      osmUserId: secondOsm.userId,
    });
    await expect(recordAppointmentCoordination(firstOsm.actor, {
      ...coordinationInput,
      submissionNonce: randomUUID(),
    })).rejects.toBeInstanceOf(ForbiddenError);
    const secondAssignment = await prisma.patientOsmAssignment.findFirstOrThrow({
      where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null },
      select: { id: true },
    });
    const secondOsmAppointment = await createAppointment(secondOsm.actor, appointmentInput(patient.relationshipId));
    expect(await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: secondOsmAppointment.appointmentId },
      select: { osmAssignmentIdAtCreation: true },
    })).toEqual({ osmAssignmentIdAtCreation: secondAssignment.id });
    expect(await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: legacyAppointment.appointmentId },
      select: { osmAssignmentIdAtCreation: true },
    })).toEqual({ osmAssignmentIdAtCreation: null });

    const workDetail = await getAppointmentDetail(owner.actor, patient.relationshipId, osmAppointment.appointmentId);
    expect(workDetail.osmAtCreationDisplayName).toBe(firstOsm.displayName);

    const review = await reviewAppointmentCancellationRequest(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmAppointment.appointmentId,
      requestId: proxyRequest.requestId,
      decision: "APPROVE",
    });
    expect(review).toMatchObject({
      requestStatus: AppointmentCancellationRequestStatus.APPROVED,
      appointmentStatus: AppointmentStatus.CANCELLED,
    });
    await expect(acknowledgeOwnPatientAppointment(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmAppointment.appointmentId,
      expectedUpdatedAt: review.updatedAt.toISOString(),
    })).rejects.toBeInstanceOf(ConflictError);
    await expect(requestOwnPatientAppointmentCancellation(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: osmAppointment.appointmentId,
      expectedUpdatedAt: review.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictError);
    const persistedRequest = await prisma.patientAppointmentCancellationRequest.findUniqueOrThrow({
      where: { id: proxyRequest.requestId },
      select: { status: true, resolvedByUserId: true, resolvedAt: true },
    });
    expect(persistedRequest).toMatchObject({
      status: AppointmentCancellationRequestStatus.APPROVED,
      resolvedByUserId: owner.userId,
    });
    expect(persistedRequest.resolvedAt).toBeInstanceOf(Date);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.acknowledged" } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.coordination_recorded" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.cancellation_requested" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.cancellation_request.approved" } })).toBe(1);
    const appointmentAuditMetadata = await prisma.auditEvent.findMany({
      select: { metadata: true },
      orderBy: { createdAt: "asc" },
    });
    expect(JSON.stringify(appointmentAuditMetadata)).not.toContain("Work-only appointment note");
  });

  it("rejects cancellation without changing status, supersedes stale requests, and preserves unchanged legacy responsibility", async () => {
    const hospital = await createHospital("REQUEST-LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const coordinator = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.COORDINATOR });
    const doctor = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.DOCTOR });
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "appointment-integration", value: "request-lifecycle-patient" },
      targetHospitalId: hospital.id,
      givenName: "ผู้ป่วย",
      familyName: "Lifecycle",
    });
    await activateProvisionedPatient(patient.userId);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    await prisma.userRole.create({ data: { userId: patient.userId, role: Role.HOSPITAL } });
    await prisma.hospitalMembership.create({
      data: {
        userId: patient.userId,
        hospitalId: hospital.id,
        membershipType: MembershipType.MEMBER,
        profession: Profession.DOCTOR,
        status: MembershipStatus.ACTIVE,
      },
    });

    await expect(
      createAppointment(owner.actor, appointmentInput(patient.relationshipId, { responsibleUserId: coordinator.userId })),
    ).rejects.toBeInstanceOf(ValidationError);

    const appointment = await createAppointment(owner.actor, appointmentInput(patient.relationshipId));
    const legacyResponsible = await prisma.patientAppointment.update({
      where: { id: appointment.appointmentId },
      data: { responsibleUserId: coordinator.userId },
      select: { updatedAt: true },
    });
    const currentAppointment = await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: appointment.appointmentId },
      select: { updatedAt: true },
    });
    expect(legacyResponsible.updatedAt).toEqual(currentAppointment.updatedAt);

    const acknowledged = await acknowledgeOwnPatientAppointment(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      expectedUpdatedAt: currentAppointment.updatedAt.toISOString(),
    });
    expect(acknowledged.source).toBe(AppointmentInteractionSource.PATIENT_SELF);

    const concurrentRequests = await Promise.all(
      [randomUUID(), randomUUID()].map((submissionNonce) =>
        requestOwnPatientAppointmentCancellation(patientActor, {
          patientHospitalRelationshipId: patient.relationshipId,
          appointmentId: appointment.appointmentId,
          expectedUpdatedAt: currentAppointment.updatedAt.toISOString(),
          submissionNonce,
        }),
      ),
    );
    const firstRequest = concurrentRequests[0];
    expect(concurrentRequests[1].requestId).toBe(firstRequest.requestId);
    const rejected = await reviewAppointmentCancellationRequest(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      requestId: firstRequest.requestId,
      decision: "REJECT",
    });
    expect(rejected).toMatchObject({
      requestStatus: AppointmentCancellationRequestStatus.REJECTED,
      appointmentStatus: AppointmentStatus.SCHEDULED,
      updatedAt: currentAppointment.updatedAt,
    });

    const secondRequest = await requestOwnPatientAppointmentCancellation(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      expectedUpdatedAt: currentAppointment.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    });
    expect(secondRequest.status).toBe(AppointmentCancellationRequestStatus.PENDING);

    const rescheduled = await rescheduleAppointment(patientActor, rescheduleInput(
      patient.relationshipId,
      appointment.appointmentId,
      currentAppointment.updatedAt,
      { responsibleUserId: coordinator.userId },
    ));
    expect(rescheduled.status).toBe(AppointmentStatus.SCHEDULED);
    expect(await prisma.patientAppointmentCancellationRequest.findUniqueOrThrow({
      where: { id: secondRequest.requestId },
      select: { status: true },
    })).toEqual({ status: AppointmentCancellationRequestStatus.SUPERSEDED });
    const staleReview = await reviewAppointmentCancellationRequest(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      requestId: secondRequest.requestId,
      decision: "APPROVE",
    });
    expect(staleReview).toMatchObject({
      requestStatus: AppointmentCancellationRequestStatus.SUPERSEDED,
      appointmentStatus: AppointmentStatus.SCHEDULED,
      wasSuperseded: true,
    });
    await expect(acknowledgeOwnPatientAppointment(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      expectedUpdatedAt: currentAppointment.updatedAt.toISOString(),
    })).rejects.toBeInstanceOf(ConflictError);

    const newAcknowledgement = await acknowledgeOwnPatientAppointment(patientActor, {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId: appointment.appointmentId,
      expectedUpdatedAt: rescheduled.updatedAt.toISOString(),
    });
    expect(newAcknowledgement.sourceAppointmentUpdatedAt).toEqual(rescheduled.updatedAt);
    expect(await prisma.patientAppointment.count({
      where: { id: appointment.appointmentId, responsibleUserId: coordinator.userId },
    })).toBe(1);

    await expect(rescheduleAppointment(patientActor, rescheduleInput(
      patient.relationshipId,
      appointment.appointmentId,
      rescheduled.updatedAt,
      { responsibleUserId: doctor.userId },
    ))).resolves.toMatchObject({ status: AppointmentStatus.SCHEDULED });

    const terminalTransitions = [
      { status: AppointmentStatus.CANCELLED, transition: cancelAppointment },
      { status: AppointmentStatus.COMPLETED, transition: completeAppointment },
      { status: AppointmentStatus.NO_SHOW, transition: markAppointmentNoShow },
    ];
    for (const scenario of terminalTransitions) {
      const scheduledAt = scenario.status === AppointmentStatus.NO_SHOW
        ? bangkokIso(new Date(Date.now() - 60 * 1000))
        : undefined;
      const terminalAppointment = await createAppointment(
        owner.actor,
        appointmentInput(patient.relationshipId, scheduledAt ? { scheduledAt } : {}),
      );
      const pendingRequest = await requestOwnPatientAppointmentCancellation(patientActor, {
        patientHospitalRelationshipId: patient.relationshipId,
        appointmentId: terminalAppointment.appointmentId,
        expectedUpdatedAt: terminalAppointment.updatedAt.toISOString(),
        submissionNonce: randomUUID(),
      });
      const transitioned = await scenario.transition(
        owner.actor,
        transitionInput(patient.relationshipId, terminalAppointment.appointmentId, terminalAppointment.updatedAt),
      );
      expect(transitioned.status).toBe(scenario.status);
      expect(await prisma.patientAppointmentCancellationRequest.findUniqueOrThrow({
        where: { id: pendingRequest.requestId },
        select: { status: true },
      })).toEqual({ status: AppointmentCancellationRequestStatus.SUPERSEDED });
    }
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

    const futureInput = appointmentInput(patient.relationshipId);
    const future = await createAppointment(owner.actor, futureInput);
    await expect(
      markAppointmentNoShow(owner.actor, transitionInput(patient.relationshipId, future.appointmentId, future.updatedAt)),
    ).rejects.toBeInstanceOf(ConflictError);

    const completed = await completeAppointment(
      owner.actor,
      transitionInput(patient.relationshipId, future.appointmentId, future.updatedAt),
    );
    expect(completed.status).toBe(AppointmentStatus.COMPLETED);
    const completedReplay = await createAppointment(owner.actor, futureInput);
    expect(completedReplay).toMatchObject({
      appointmentId: future.appointmentId,
      status: AppointmentStatus.COMPLETED,
    });
    expect(await prisma.auditEvent.count({ where: { action: "appointment.created" } })).toBe(1);
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
