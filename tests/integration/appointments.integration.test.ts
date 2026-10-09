import {
  AppointmentLineNotificationEventKind,
  AppointmentLineNotificationState,
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  AppointmentStatus,
  HospitalStatus,
  LineReachability,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
  UserStatus,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
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
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import {
  drainAppointmentLineNotificationOutbox,
  purgeTerminalAppointmentLineNotifications,
} from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import {
  signAppointmentLineNotificationInvocation,
  verifyAndConsumeAppointmentLineNotificationInvocation,
} from "@/modules/appointments/services/appointment-line-notification-invocation-service";
import { getOwnPatientAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";
import { executeLineReactiveAppointment } from "@/modules/line/services/line-reactive-appointment-service";
import { unassignOsmFromPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.appointmentLineNotificationWorkerState.updateMany({
    where: { id: 1 },
    data: { lastInvocationAt: new Date(0) },
  });
  await prisma.appointmentLineNotification.deleteMany();
  await prisma.lineAppointmentNotificationPreference.deleteMany();
  await prisma.lineAuthorizationLifecycle.deleteMany();
  await prisma.lineAccountActionIntent.deleteMany();
  await prisma.lineAccountBinding.deleteMany();
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

async function createAppointmentNotificationSubject(label: string): Promise<{
  hospitalId: string;
  owner: ActorContext;
  patient: Awaited<ReturnType<typeof provisionPatient>>;
  patientActor: ActorContext;
  lineUserId: string;
  bindingId: string;
}> {
  const hospital = await createHospital(`NOTIF-${label.slice(0, 12)}`);
  const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
  const patient = await provisionPatient(owner.actor, {
    identity: { namespace: "appointment-line-notification-integration", value: randomUUID() },
    targetHospitalId: hospital.id,
    givenName: "ผู้ป่วยทดสอบสังเคราะห์",
    familyName: `Notification ${label}`,
  });
  await activateProvisionedPatient(patient.userId);
  const patientActor: ActorContext = {
    userId: patient.userId,
    personId: patient.personId,
    roles: [Role.PATIENT],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
  const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
  const binding = await prisma.lineAccountBinding.create({
    data: {
      userId: patient.userId,
      lineUserId,
      lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
      lineSubjectFingerprintKeyId: "synthetic-integration-v1",
      reachability: LineReachability.FRIEND,
      reachabilityObservedAt: new Date(),
    },
    select: { id: true },
  });
  await setOwnAppointmentLineNotificationPreference(patientActor, true, { database: prisma });
  return { hospitalId: hospital.id, owner: owner.actor, patient, patientActor, lineUserId, bindingId: binding.id };
}

const notificationRollout = {
  enabled: true,
  generation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;

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
      responsibleProfession: Profession.NURSE,
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

  it("resolves current LINE authority and reads one own next appointment from PostgreSQL", async () => {
    const hospital = await createHospital("LINE-REACTIVE");
    const owner = await createHospitalActor({
      hospitalId: hospital.id,
      membershipType: MembershipType.OWNER,
      profession: Profession.DOCTOR,
    });
    const hospitalNumber = `HN-${randomUUID().slice(0, 8)}`;
    const patient = await provisionPatient(owner.actor, {
      identity: { namespace: "line-reactive-integration", value: randomUUID() },
      targetHospitalId: hospital.id,
      givenName: "ผู้ป่วยทดสอบ",
      familyName: "LINE",
      hospitalNumber,
    });
    await activateProvisionedPatient(patient.userId);
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const created = await createAppointment(
      owner.actor,
      appointmentInput(patient.relationshipId, { scheduledAt: bangkokIso(scheduledAt) }),
    );
    const currentHospitalName = "โรงพยาบาลเปลี่ยนชื่อก่อน LINE อ่าน";
    await prisma.hospital.update({
      where: { id: hospital.id },
      data: { name: currentHospitalName, status: HospitalStatus.SUSPENDED },
    });

    const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
    const binding = await prisma.lineAccountBinding.create({
      data: {
        userId: patient.userId,
        lineUserId,
        lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
        lineSubjectFingerprintKeyId: "integration-key-v1",
      },
      select: { id: true },
    });
    const asOf = new Date(Date.now());
    let captureAsOfCount = 0;
    const captureAsOf = (): Date => {
      captureAsOfCount += 1;
      return asOf;
    };
    let reply = "";

    try {
      const outcome = await executeLineReactiveAppointment({
        intent: "PATIENT_NEXT_APPOINTMENT",
        webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        eventOccurredAt: new Date("2000-01-01T00:00:00.000Z"),
        localExecutionDeadline: 45_000,
        lineUserId,
        replyToken: "integration-only-reply-token",
        isRedelivery: true,
      }, {
        database: prisma,
        monotonicNow: () => 1_000,
        captureAsOf,
        replyText: async (_replyToken, text) => { reply = text; },
      });

      expect(outcome).toBe("COMPLETED_WITH_APPOINTMENT");
      expect(captureAsOfCount).toBe(1);
      expect(reply).toContain("นัดหมายถัดไปของคุณ");
      expect(reply).toContain(currentHospitalName);
      expect(reply).not.toContain("ผู้ป่วยทดสอบ");
      expect(reply).not.toContain(hospitalNumber);
      expect(reply).not.toContain(created.appointmentId);
    } finally {
      await prisma.lineAccountBinding.deleteMany({ where: { id: binding.id } });
    }
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
      responsibleProfession: Profession.NURSE,
      osmAtCreationDisplayName: firstOsm.displayName,
    });
    const serializedPatientProjection = JSON.stringify(patientProjection);
    for (const withheld of [
      "Work-only appointment note",
      "responsibleUserId",
      "createdByUserId",
      "createdBy",
      "membershipType",
      "assignmentId",
      "phone",
      "email",
      "recordedByUserId",
      "submittedByUserId",
      "resolvedByUserId",
    ]) {
      expect(serializedPatientProjection).not.toContain(withheld);
    }

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
    const otherCoordinator = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.COORDINATOR });
    const doctor = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.DOCTOR });
    const nurse = await createHospitalActor({ hospitalId: hospital.id, profession: Profession.NURSE });
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
      { responsibleUserId: otherCoordinator.userId },
    ))).rejects.toBeInstanceOf(ValidationError);

    const doctorRescheduled = await rescheduleAppointment(patientActor, rescheduleInput(
      patient.relationshipId,
      appointment.appointmentId,
      rescheduled.updatedAt,
      { responsibleUserId: doctor.userId },
    ));
    expect(doctorRescheduled.status).toBe(AppointmentStatus.SCHEDULED);

    await expect(rescheduleAppointment(patientActor, rescheduleInput(
      patient.relationshipId,
      appointment.appointmentId,
      doctorRescheduled.updatedAt,
      { responsibleUserId: nurse.userId },
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

  it("persists only canonical appointment events and makes Hospital cancellation approval emit one cancellation intent", async () => {
    const subject = await createAppointmentNotificationSubject("CANONICAL");
    const now = new Date();
    const dependencies = {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    };
    const firstInput = appointmentInput(subject.patient.relationshipId);
    const created = await createAppointment(subject.owner, firstInput, dependencies);
    const replay = await createAppointment(subject.owner, firstInput, dependencies);
    expect(replay.appointmentId).toBe(created.appointmentId);
    expect(await prisma.appointmentLineNotification.count()).toBe(1);

    await acknowledgeOwnPatientAppointment(subject.patientActor, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: created.appointmentId,
      expectedUpdatedAt: created.updatedAt.toISOString(),
    }, dependencies);
    const rejectedRequest = await requestOwnPatientAppointmentCancellation(subject.patientActor, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: created.appointmentId,
      expectedUpdatedAt: created.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    }, dependencies);
    await reviewAppointmentCancellationRequest(subject.owner, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: created.appointmentId,
      requestId: rejectedRequest.requestId,
      decision: "REJECT",
    }, dependencies);
    expect(await prisma.appointmentLineNotification.count()).toBe(1);

    const rescheduled = await rescheduleAppointment(subject.owner, rescheduleInput(
      subject.patient.relationshipId,
      created.appointmentId,
      created.updatedAt,
    ), dependencies);
    expect(await prisma.appointmentLineNotification.count()).toBe(2);

    const approvalAppointment = await createAppointment(
      subject.owner,
      appointmentInput(subject.patient.relationshipId),
      dependencies,
    );
    const cancellationRequest = await requestOwnPatientAppointmentCancellation(subject.patientActor, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: approvalAppointment.appointmentId,
      expectedUpdatedAt: approvalAppointment.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    }, dependencies);
    const approved = await reviewAppointmentCancellationRequest(subject.owner, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: approvalAppointment.appointmentId,
      requestId: cancellationRequest.requestId,
      decision: "APPROVE",
    }, dependencies);
    await reviewAppointmentCancellationRequest(subject.owner, {
      patientHospitalRelationshipId: subject.patient.relationshipId,
      appointmentId: approvalAppointment.appointmentId,
      requestId: cancellationRequest.requestId,
      decision: "APPROVE",
    }, dependencies);

    const events = await prisma.appointmentLineNotification.findMany({
      orderBy: [{ appointmentId: "asc" }, { sourceUpdatedAt: "asc" }],
      select: { appointmentId: true, eventKind: true, sourceUpdatedAt: true, state: true, recipientUserId: true },
    });
    expect(events).toHaveLength(4);
    expect(events.map(({ eventKind }) => eventKind).sort()).toEqual([
      AppointmentLineNotificationEventKind.CANCELLED,
      AppointmentLineNotificationEventKind.CREATED,
      AppointmentLineNotificationEventKind.CREATED,
      AppointmentLineNotificationEventKind.RESCHEDULED,
    ]);
    expect(events.every(({ state, recipientUserId }) =>
      state === AppointmentLineNotificationState.PENDING && recipientUserId === subject.patient.userId,
    )).toBe(true);
    expect(approved).toMatchObject({ requestStatus: AppointmentCancellationRequestStatus.APPROVED, appointmentStatus: AppointmentStatus.CANCELLED });
    expect(rescheduled.status).toBe(AppointmentStatus.SCHEDULED);
  });

  it("keeps disabled-period mutations silent and suppresses pending work across an OFF cutover", async () => {
    const subject = await createAppointmentNotificationSubject("CUTOVER");
    const base = new Date();
    const disabled = { enabled: false, generation: null } as const;
    const disabledDependencies = {
      database: prisma,
      now: () => base,
      appointmentLineNotificationRollout: disabled,
    };
    const oldInput = appointmentInput(subject.patient.relationshipId);
    const oldAppointment = await createAppointment(subject.owner, oldInput, disabledDependencies);
    const oldReschedule = await rescheduleAppointment(subject.owner, rescheduleInput(
      subject.patient.relationshipId,
      oldAppointment.appointmentId,
      oldAppointment.updatedAt,
    ), disabledDependencies);
    await cancelAppointment(subject.owner, transitionInput(
      subject.patient.relationshipId,
      oldAppointment.appointmentId,
      oldReschedule.updatedAt,
    ), disabledDependencies);
    expect(await prisma.appointmentLineNotification.count()).toBe(0);

    const pending = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => base,
      appointmentLineNotificationRollout: notificationRollout,
    });
    expect(await prisma.appointmentLineNotification.count({ where: { appointmentId: pending.appointmentId } })).toBe(1);
    let providerCalls = 0;
    await drainAppointmentLineNotificationOutbox({
      database: prisma,
      now: () => base,
      rollout: () => disabled,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    expect(providerCalls).toBe(0);
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: pending.appointmentId },
      select: { state: true },
    })).toEqual({ state: AppointmentLineNotificationState.SUPPRESSED });

    const afterCutover = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => base,
      appointmentLineNotificationRollout: {
        enabled: true,
        generation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    });
    const drain = await drainAppointmentLineNotificationOutbox({
      database: prisma,
      now: () => base,
      rollout: () => ({ enabled: true, generation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    expect(drain.providerAccepted).toBe(1);
    expect(providerCalls).toBe(1);
    expect(await prisma.appointmentLineNotification.findMany({
      where: { appointmentId: { in: [pending.appointmentId, afterCutover.appointmentId] } },
      orderBy: { appointmentId: "asc" },
      select: { appointmentId: true, rolloutGeneration: true, state: true },
    })).toHaveLength(2);
  });

  it("rolls back an appointment when its enabled outbox intent cannot be persisted", async () => {
    const subject = await createAppointmentNotificationSubject("ATOMICITY");
    const input = appointmentInput(subject.patient.relationshipId);
    await expect(createAppointment(subject.owner, input, {
      database: prisma,
      appointmentLineNotificationRollout: { enabled: true, generation: "invalid-uuid" },
    })).rejects.toBeTruthy();
    expect(await prisma.patientAppointment.count({ where: { submissionNonce: String(input.submissionNonce) } })).toBe(0);
    expect(await prisma.appointmentLineNotification.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "appointment.created" } })).toBe(0);
  });

  it("enforces the database source-event uniqueness constraint", async () => {
    const subject = await createAppointmentNotificationSubject("UNIQUE");
    const appointment = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    const source = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: appointment.appointmentId },
    });
    await expect(prisma.appointmentLineNotification.create({
      data: {
        appointmentId: source.appointmentId,
        patientHospitalRelationshipId: source.patientHospitalRelationshipId,
        sourceUpdatedAt: source.sourceUpdatedAt,
        eventKind: source.eventKind,
        recipientUserId: source.recipientUserId,
        bindingId: source.bindingId,
        bindingLifecycleVersion: source.bindingLifecycleVersion,
        preferenceVersion: source.preferenceVersion,
        rolloutGeneration: source.rolloutGeneration,
        state: AppointmentLineNotificationState.PENDING,
        dueAt: source.dueAt,
        retryKey: randomUUID(),
        updatedAt: new Date(),
      },
    })).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.appointmentLineNotification.count({ where: { appointmentId: appointment.appointmentId } })).toBe(1);
  });

  it("retries ambiguous Push outcomes with one retry key and exact payload, then records acceptance only", async () => {
    const subject = await createAppointmentNotificationSubject("RETRY");
    let now = new Date();
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    const calls: Array<{ lineUserId: string; text: string; retryKey: string }> = [];
    let pushCount = 0;
    const push = async (lineUserId: string, text: string, retryKey: string) => {
      calls.push({ lineUserId, text, retryKey });
      pushCount += 1;
      return pushCount === 1 ? { kind: "AMBIGUOUS_TRANSPORT_FAILURE" as const } : { kind: "DUPLICATE_ACCEPTED" as const };
    };
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push,
      random: () => 0.5,
      batchSize: 1,
      logSummary: () => undefined,
    };
    const firstDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    const retry = await prisma.appointmentLineNotification.findFirstOrThrow({ where: { appointmentId: created.appointmentId } });
    expect(firstDrain.retryScheduled).toBe(1);
    expect(retry.state).toBe(AppointmentLineNotificationState.RETRY_SCHEDULED);
    expect(retry.attemptCount).toBe(1);

    now = retry.dueAt;
    const secondDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    const completed = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: retry.id } });
    expect(secondDrain.providerAccepted).toBe(1);
    expect(completed.state).toBe(AppointmentLineNotificationState.PROVIDER_ACCEPTED);
    expect(completed.attemptCount).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]).toMatchObject({ lineUserId: subject.lineUserId, retryKey: retry.retryKey });
    expect(calls[0]?.text).toBe("มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
    expect(completed.safeOutcome).toBe("DUPLICATE_ACCEPTED");

    await prisma.appointmentLineNotification.update({
      where: { id: completed.id },
      data: { terminalAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000) },
    });
    expect(await purgeTerminalAppointmentLineNotifications({ database: prisma, now: new Date(now.getTime() + 1), batchSize: 1 })).toBe(1);
    expect(await prisma.appointmentLineNotification.findUnique({ where: { id: completed.id } })).toBeNull();
  });

  it("bounds repeated temporary Push rate limits to three attempts with the same key and payload", async () => {
    const subject = await createAppointmentNotificationSubject("RATE_LIMIT");
    let now = new Date();
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    const calls: Array<{ lineUserId: string; text: string; retryKey: string }> = [];
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push: async (lineUserId: string, text: string, retryKey: string) => {
        calls.push({ lineUserId, text, retryKey });
        return { kind: "RETRYABLE_HTTP_FAILURE" as const };
      },
      random: () => 0.5,
      batchSize: 1,
      logSummary: () => undefined,
    };

    const firstDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    let notification = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
    });
    expect(firstDrain.retryScheduled).toBe(1);
    expect(notification.attemptCount).toBe(1);

    now = notification.dueAt;
    const secondDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(secondDrain.retryScheduled).toBe(1);
    expect(notification.attemptCount).toBe(2);

    now = notification.dueAt;
    const thirdDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(thirdDrain.permanentFailure).toBe(1);
    expect(notification.state).toBe(AppointmentLineNotificationState.PERMANENT_FAILURE);
    expect(notification.safeOutcome).toBe("TRANSIENT_HTTP_FAILURE");
    expect(notification.attemptCount).toBe(3);

    const afterExhaustion = await drainAppointmentLineNotificationOutbox(dependencies);
    expect(afterExhaustion.claimed).toBe(0);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[1]).toEqual(calls[2]);
    expect(calls[0]).toMatchObject({ lineUserId: subject.lineUserId, retryKey: notification.retryKey });
    expect(calls[0]?.text).toBe("มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ");
  });

  it("records a permanent provider rejection separately from exhausted transient retries", async () => {
    const subject = await createAppointmentNotificationSubject("PERMANENT-REJECTION");
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });

    const result = await drainAppointmentLineNotificationOutbox({
      database: prisma,
      rollout: () => notificationRollout,
      push: async () => ({ kind: "PERMANENT_FAILURE" }),
      logSummary: () => undefined,
    });
    const notification = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
      select: { state: true, safeOutcome: true, attemptCount: true },
    });

    expect(result.permanentFailure).toBe(1);
    expect(notification).toEqual({
      state: AppointmentLineNotificationState.PERMANENT_FAILURE,
      safeOutcome: "PERMANENT_HTTP_FAILURE",
      attemptCount: 1,
    });
  });

  it("preserves an ambiguous Push outcome while later rate-limit responses exhaust retries", async () => {
    const subject = await createAppointmentNotificationSubject("AMBIGUOUS-RATE-LIMIT");
    let now = new Date();
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let pushCount = 0;
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push: async () => {
        pushCount += 1;
        return pushCount === 1
          ? { kind: "AMBIGUOUS_TRANSPORT_FAILURE" as const }
          : { kind: "RETRYABLE_HTTP_FAILURE" as const };
      },
      random: () => 0.5,
      batchSize: 1,
      logSummary: () => undefined,
    };

    await drainAppointmentLineNotificationOutbox(dependencies);
    let notification = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
    });
    expect(notification.safeOutcome).toBe("AMBIGUOUS_TRANSPORT_FAILURE");

    now = notification.dueAt;
    await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(notification.state).toBe(AppointmentLineNotificationState.RETRY_SCHEDULED);
    expect(notification.safeOutcome).toBe("AMBIGUOUS_TRANSPORT_FAILURE");

    now = notification.dueAt;
    const finalDrain = await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(finalDrain.unknownOutcome).toBe(1);
    expect(notification.state).toBe(AppointmentLineNotificationState.OUTCOME_UNKNOWN);
    expect(notification.safeOutcome).toBe("AMBIGUOUS_TRANSPORT_FAILURE");
    expect(notification.attemptCount).toBe(3);
  });

  it("preserves an unobserved reserved attempt across lease recovery and later rate limits", async () => {
    const subject = await createAppointmentNotificationSubject("LEASE-UNKNOWN-OUTCOME");
    let now = new Date();
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let signalProvider: (() => void) | null = null;
    let releaseFirst: ((value: { kind: "ACCEPTED" }) => void) | null = null;
    const providerEntered = new Promise<void>((resolve) => { signalProvider = resolve; });
    let providerCalls = 0;
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push: async () => {
        providerCalls += 1;
        if (providerCalls === 1) {
          signalProvider?.();
          return new Promise<{ kind: "ACCEPTED" }>((resolve) => { releaseFirst = resolve; });
        }
        return { kind: "RETRYABLE_HTTP_FAILURE" as const };
      },
      random: () => 0.5,
      batchSize: 1,
      logSummary: () => undefined,
    };

    const firstWorker = drainAppointmentLineNotificationOutbox(dependencies);
    await providerEntered;
    let notification = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
    });
    expect(notification.safeOutcome).toBe("PROCESS_OUTCOME_UNKNOWN");

    now = notification.leaseExpiresAt ?? now;
    const recoveredWorker = await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(recoveredWorker.retryScheduled).toBe(1);
    expect(notification.safeOutcome).toBe("AMBIGUOUS_TRANSPORT_FAILURE");

    now = notification.dueAt;
    const finalWorker = await drainAppointmentLineNotificationOutbox(dependencies);
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(finalWorker.unknownOutcome).toBe(1);
    expect(notification.state).toBe(AppointmentLineNotificationState.OUTCOME_UNKNOWN);
    expect(notification.safeOutcome).toBe("AMBIGUOUS_TRANSPORT_FAILURE");
    expect(notification.attemptCount).toBe(3);

    const completeFirst = releaseFirst as ((value: { kind: "ACCEPTED" }) => void) | null;
    if (!completeFirst) throw new Error("Expected the first provider attempt to be waiting");
    completeFirst({ kind: "ACCEPTED" });
    await firstWorker;
    notification = await prisma.appointmentLineNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(notification.state).toBe(AppointmentLineNotificationState.OUTCOME_UNKNOWN);
    expect(providerCalls).toBe(3);
  });

  it("suppresses stale, opted-out, unlinked, and relinked intents before Push", async () => {
    const subject = await createAppointmentNotificationSubject("REVOKE");
    const base = new Date();
    const first = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => base,
      appointmentLineNotificationRollout: notificationRollout,
    });
    await setOwnAppointmentLineNotificationPreference(subject.patientActor, false, { database: prisma, now: () => base });
    let providerCalls = 0;
    const drain = (now: Date) => drainAppointmentLineNotificationOutbox({
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    await drain(base);
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: first.appointmentId }, select: { state: true, safeOutcome: true },
    })).toEqual({ state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "OPT_IN_REVOKED" });

    await setOwnAppointmentLineNotificationPreference(subject.patientActor, true, { database: prisma, now: () => base });
    const relinkedIntent = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => base,
      appointmentLineNotificationRollout: notificationRollout,
    });
    await prisma.lineAccountBinding.update({
      where: { id: subject.bindingId },
      data: { unlinkedAt: base, lineUserId: null, lifecycleVersion: { increment: 1 }, reachability: LineReachability.UNKNOWN, reachabilityObservedAt: null },
    });
    const noBindingPreference = await getOwnAppointmentLineNotificationPreference(subject.patientActor, prisma);
    expect(noBindingPreference).toEqual({ enabled: false, canEnable: false });
    await prisma.lineAccountBinding.update({
      where: { id: subject.bindingId },
      data: { unlinkedAt: null, lineUserId: subject.lineUserId, reachability: LineReachability.FRIEND, reachabilityObservedAt: base },
    });
    await setOwnAppointmentLineNotificationPreference(subject.patientActor, true, { database: prisma, now: () => base });
    await drain(base);
    const relinkedOutcome = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: relinkedIntent.appointmentId }, select: { state: true, safeOutcome: true },
    });
    expect(relinkedOutcome).toEqual({ state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "LINE_INELIGIBLE" });
    expect(providerCalls).toBe(0);
  });

  it("suppresses an appointment intent when the exact relationship resolves to a different Patient User", async () => {
    const subject = await createAppointmentNotificationSubject("IDENTITY-SCOPE");
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    sequence += 1;
    const replacementPerson = await prisma.person.create({
      data: {
        identityKeyHash: `appointment-replacement-patient-${sequence}`,
        givenName: "Synthetic replacement",
        familyName: String(sequence),
      },
      select: { id: true },
    });
    const replacementUser = await prisma.user.create({
      data: { personId: replacementPerson.id, status: UserStatus.ACTIVE, authSubject: randomUUID() },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: replacementUser.id, role: Role.PATIENT } });
    const relationship = await prisma.patientHospitalRelationship.findUniqueOrThrow({
      where: { id: subject.patient.relationshipId },
      select: { patientProfileId: true },
    });
    await prisma.patientProfile.update({
      where: { id: relationship.patientProfileId },
      data: { personId: replacementPerson.id },
    });

    let providerCalls = 0;
    await drainAppointmentLineNotificationOutbox({
      database: prisma,
      rollout: () => notificationRollout,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
      select: { state: true, safeOutcome: true, recipientUserId: true },
    })).toEqual({
      state: AppointmentLineNotificationState.SUPPRESSED,
      safeOutcome: "AUTHORITY_CHANGED",
      recipientUserId: subject.patient.userId,
    });
    expect(providerCalls).toBe(0);
  });

  it("denies both reactive and proactive Patient access after the Patient role is revoked", async () => {
    const subject = await createAppointmentNotificationSubject("ROLE-REVOKED");
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    await prisma.userRole.deleteMany({
      where: { userId: subject.patient.userId, role: Role.PATIENT },
    });

    const reactiveReplies: string[] = [];
    const reactiveResult = await executeLineReactiveAppointment({
      intent: "PATIENT_NEXT_APPOINTMENT",
      webhookEventId: "01ARZ3NDEKTSV4RRFFQ69G5F10",
      eventOccurredAt: new Date(),
      localExecutionDeadline: 45_000,
      lineUserId: subject.lineUserId,
      replyToken: "synthetic-reactive-reply-token",
      isRedelivery: false,
    }, {
      database: prisma,
      monotonicNow: () => 0,
      replyText: async (_replyToken, text) => { reactiveReplies.push(text); },
    });

    let providerCalls = 0;
    await drainAppointmentLineNotificationOutbox({
      database: prisma,
      rollout: () => notificationRollout,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });

    expect(reactiveResult).toBe("REFUSED_INELIGIBLE");
    expect(reactiveReplies).toHaveLength(1);
    expect(reactiveReplies[0]).not.toContain("โรงพยาบาล Appointment");
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
      select: { state: true, safeOutcome: true },
    })).toEqual({ state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "AUTHORITY_CHANGED" });
    expect(providerCalls).toBe(0);
  });

  it("suppresses an appointment intent when its Hospital is no longer active", async () => {
    const subject = await createAppointmentNotificationSubject("HOSPITAL-SCOPE");
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    await prisma.hospital.update({
      where: { id: subject.hospitalId },
      data: { status: HospitalStatus.SUSPENDED },
    });

    let providerCalls = 0;
    await drainAppointmentLineNotificationOutbox({
      database: prisma,
      rollout: () => notificationRollout,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: created.appointmentId },
      select: { state: true, safeOutcome: true },
    })).toEqual({ state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "AUTHORITY_CHANGED" });
    expect(providerCalls).toBe(0);
  });

  it("suppresses a superseded source version while the current reschedule remains eligible", async () => {
    const subject = await createAppointmentNotificationSubject("STALE-SOURCE");
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    await rescheduleAppointment(subject.owner, rescheduleInput(
      subject.patient.relationshipId,
      created.appointmentId,
      created.updatedAt,
    ), {
      database: prisma,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let providerCalls = 0;
    await drainAppointmentLineNotificationOutbox({
      database: prisma,
      rollout: () => notificationRollout,
      push: async () => { providerCalls += 1; return { kind: "ACCEPTED" }; },
      logSummary: () => undefined,
    });
    expect(await prisma.appointmentLineNotification.findMany({
      where: { appointmentId: created.appointmentId },
      orderBy: { sourceUpdatedAt: "asc" },
      select: { eventKind: true, state: true, safeOutcome: true },
    })).toEqual([
      { eventKind: AppointmentLineNotificationEventKind.CREATED, state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "STALE_SOURCE" },
      { eventKind: AppointmentLineNotificationEventKind.RESCHEDULED, state: AppointmentLineNotificationState.PROVIDER_ACCEPTED, safeOutcome: "ACCEPTED" },
    ]);
    expect(providerCalls).toBe(1);
  });

  it("suppresses pending old-generation work across a concurrent cutover without recalling an in-flight Push", async () => {
    const subject = await createAppointmentNotificationSubject("CONCURRENT-CUTOVER");
    let now = new Date();
    const first = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    now = new Date(now.getTime() + 1_000);
    const second = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let rollout: { enabled: boolean; generation: string | null } = notificationRollout;
    let releaseFirst: ((value: { kind: "ACCEPTED" }) => void) | null = null;
    let signalProvider: () => void = () => undefined;
    const providerEntered = new Promise<void>((resolve) => { signalProvider = resolve; });
    let calls = 0;
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => rollout,
      batchSize: 1,
      push: async () => {
        calls += 1;
        if (calls === 1) {
          signalProvider();
          return new Promise<{ kind: "ACCEPTED" }>((resolve) => { releaseFirst = resolve; });
        }
        return { kind: "ACCEPTED" as const };
      },
      logSummary: () => undefined,
    };
    const inFlight = drainAppointmentLineNotificationOutbox(dependencies);
    await providerEntered;
    rollout = { enabled: true, generation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    const afterCutover = await drainAppointmentLineNotificationOutbox(dependencies);
    expect(afterCutover.suppressed).toBe(1);
    const completePush = releaseFirst as ((value: { kind: "ACCEPTED" }) => void) | null;
    if (!completePush) throw new Error("Expected the first provider attempt to be in flight");
    completePush({ kind: "ACCEPTED" });
    await inFlight;

    const outcomes = await prisma.appointmentLineNotification.findMany({
      where: { appointmentId: { in: [first.appointmentId, second.appointmentId] } },
      orderBy: { createdAt: "asc" },
      select: { state: true, safeOutcome: true },
    });
    expect(outcomes).toEqual([
      { state: AppointmentLineNotificationState.PROVIDER_ACCEPTED, safeOutcome: "ACCEPTED" },
      { state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "ROLLOUT_CLOSED" },
    ]);
    expect(calls).toBe(1);
  });

  it("keeps opt-out and unlink/relink races from authorizing a later retry", async () => {
    const subject = await createAppointmentNotificationSubject("PREFERENCE-RACE");
    let now = new Date();
    const firstAppointment = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let releaseFirst: ((value: { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }) => void) | null = null;
    let signalProvider: () => void = () => undefined;
    let providerEntered = new Promise<void>((resolve) => { signalProvider = resolve; });
    let providerCalls = 0;
    const dependencies = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      batchSize: 1,
      push: async () => {
        providerCalls += 1;
        signalProvider();
        return new Promise<{ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }>((resolve) => { releaseFirst = resolve; });
      },
      logSummary: () => undefined,
    };
    const optOutRace = drainAppointmentLineNotificationOutbox(dependencies);
    await providerEntered;
    await setOwnAppointmentLineNotificationPreference(subject.patientActor, false, { database: prisma, now: () => now });
    const finishFirst = releaseFirst as ((value: { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }) => void) | null;
    if (!finishFirst) throw new Error("Expected the first provider attempt to be in flight");
    finishFirst({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" });
    await optOutRace;
    const optedOutRow = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: firstAppointment.appointmentId },
      select: { dueAt: true },
    });
    now = optedOutRow.dueAt;
    const afterOptOut = await drainAppointmentLineNotificationOutbox(dependencies);
    expect(afterOptOut.suppressed).toBe(1);
    expect(providerCalls).toBe(1);

    await setOwnAppointmentLineNotificationPreference(subject.patientActor, true, { database: prisma, now: () => now });
    const secondAppointment = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    releaseFirst = null;
    providerEntered = new Promise<void>((resolve) => { signalProvider = resolve; });
    const relinkRace = drainAppointmentLineNotificationOutbox(dependencies);
    await providerEntered;
    await prisma.lineAccountBinding.update({
      where: { id: subject.bindingId },
      data: {
        unlinkedAt: now,
        lineUserId: null,
        lifecycleVersion: { increment: 1 },
        reachability: LineReachability.UNKNOWN,
        reachabilityObservedAt: null,
      },
    });
    await prisma.lineAccountBinding.update({
      where: { id: subject.bindingId },
      data: {
        unlinkedAt: null,
        lineUserId: subject.lineUserId,
        reachability: LineReachability.FRIEND,
        reachabilityObservedAt: now,
      },
    });
    await setOwnAppointmentLineNotificationPreference(subject.patientActor, true, { database: prisma, now: () => now });
    const finishRelink = releaseFirst as ((value: { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }) => void) | null;
    if (!finishRelink) throw new Error("Expected the relink-race provider attempt to be in flight");
    finishRelink({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" });
    await relinkRace;
    const relinkedRow = await prisma.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: secondAppointment.appointmentId },
      select: { dueAt: true },
    });
    now = relinkedRow.dueAt;
    const afterRelink = await drainAppointmentLineNotificationOutbox(dependencies);
    expect(afterRelink.suppressed).toBe(1);
    expect(providerCalls).toBe(2);
    expect(await prisma.appointmentLineNotification.findMany({
      where: { appointmentId: { in: [firstAppointment.appointmentId, secondAppointment.appointmentId] } },
      orderBy: { createdAt: "asc" },
      select: { state: true, safeOutcome: true },
    })).toEqual([
      { state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "OPT_IN_REVOKED" },
      { state: AppointmentLineNotificationState.SUPPRESSED, safeOutcome: "LINE_INELIGIBLE" },
    ]);
  });

  it("allows only one active worker claim and fences a stale worker after lease expiry", async () => {
    const subject = await createAppointmentNotificationSubject("FENCING");
    let now = new Date();
    const created = await createAppointment(subject.owner, appointmentInput(subject.patient.relationshipId), {
      database: prisma,
      now: () => now,
      appointmentLineNotificationRollout: notificationRollout,
    });
    let resolveFirst: ((value: { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }) => void) | null = null;
    let callCount = 0;
    const calls: Array<{ lineUserId: string; text: string; retryKey: string }> = [];
    const push = (lineUserId: string, text: string, retryKey: string) => {
      calls.push({ lineUserId, text, retryKey });
      callCount += 1;
      if (callCount === 1) {
        enteredProvider();
        return new Promise<{ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }>((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve({ kind: "ACCEPTED" as const });
    };
    const deps = {
      database: prisma,
      now: () => now,
      rollout: () => notificationRollout,
      push,
      batchSize: 1,
      logSummary: () => undefined,
    };
    let enteredProvider = (): void => undefined;
    const providerEntered = new Promise<void>((resolve) => { enteredProvider = resolve; });
    const firstWorker = drainAppointmentLineNotificationOutbox(deps);
    await providerEntered;
    const overlapping = await drainAppointmentLineNotificationOutbox(deps);
    expect(overlapping.claimed).toBe(0);
    now = new Date(now.getTime() + 31_000);
    const replacementWorker = await drainAppointmentLineNotificationOutbox(deps);
    expect(replacementWorker.providerAccepted).toBe(1);
    const finishFirst = resolveFirst as ((value: { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }) => void) | null;
    if (!finishFirst) throw new Error("Expected the first provider attempt to be waiting");
    finishFirst({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" });
    await firstWorker;

    const settled = await prisma.appointmentLineNotification.findFirstOrThrow({ where: { appointmentId: created.appointmentId } });
    expect(settled.state).toBe(AppointmentLineNotificationState.PROVIDER_ACCEPTED);
    expect(settled.attemptCount).toBe(2);
    expect(callCount).toBe(2);
    expect(calls[0]).toEqual(calls[1]);
  });

  it("authenticates internal worker invocations and rejects a replayed timestamp", async () => {
    const now = new Date();
    const secret = "synthetic-internal-worker-secret-with-over-32-characters";
    const timestamp = String(now.getTime());
    const nonce = randomUUID();
    const signature = signAppointmentLineNotificationInvocation({ timestamp, nonce, secret });
    const headers = { timestamp, nonce, signature };

    await expect(verifyAndConsumeAppointmentLineNotificationInvocation(headers, { database: prisma, now, secret }))
      .resolves.toBeUndefined();
    await expect(verifyAndConsumeAppointmentLineNotificationInvocation(headers, { database: prisma, now, secret }))
      .rejects.toBeInstanceOf(ConflictError);
    await expect(verifyAndConsumeAppointmentLineNotificationInvocation(
      { ...headers, signature: "0".repeat(64) },
      { database: prisma, now: new Date(now.getTime() + 1), secret },
    )).rejects.toBeInstanceOf(ForbiddenError);
  });
});
