import { createHash, randomUUID } from "node:crypto";
import { HospitalStatus, LineReachability, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { APPOINTMENT_ACKNOWLEDGE_CAPABILITY, APPOINTMENT_READ_CAPABILITY } from "@/modules/appointments/policies/appointment-policy";
import { resolveAppointmentAccessContext } from "@/modules/appointments/services/appointment-access-service";
import { drainAppointmentLineNotificationOutbox } from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { acknowledgeOwnPatientAppointment, createAppointment } from "@/modules/appointments/services/appointment-service";
import { listOwnPatientHospitalContacts } from "@/modules/hospital-contact/services/hospital-contact-service";
import { listPatientHospitalContent } from "@/modules/hospital-content/services/hospital-content-patient-query-service";
import { findPatientActivationCandidates } from "@/modules/patient-activation/services/patient-activation-query-service";
import { getPatientClassificationCounts } from "@/modules/patient-classification/services/patient-classification-query-service";
import { listOwnSupportHospitals } from "@/modules/support/services/support-report-service";
import { getAppointmentGrantManagement } from "@/modules/family/services/appointment-grant-management-query-service";
import { acceptAppointmentGrant, proposeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import { listDelegatedAppointments } from "@/modules/family/services/delegated-appointment-query-service";
import { resolveFollowupAccessContext } from "@/modules/followups/services/followup-access-service";
import { resolveGoalAccessContext } from "@/modules/goals/services/goal-access-service";
import { getHospitalPatientAccessRequestDetail } from "@/modules/patient-access-requests/services/patient-access-request-service";
import { assignOsmToPatient, assignOsmToPatients } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { PATIENT_BASELINE_READ_CAPABILITY } from "@/modules/patient-baseline/policies/patient-baseline-policy";
import { resolvePatientBaselineAccessContext } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import { PATIENT_CLASSIFICATION_READ_CAPABILITY } from "@/modules/patient-classification/policies/patient-classification-policy";
import { resolvePatientClassificationAccessContext } from "@/modules/patient-classification/services/patient-classification-access-service";
import {
  findAssignedPatientDirectory,
  findPatientDirectory,
  getPatientDirectoryDetail,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import { PATIENT_ARTIFACT_READ_CAPABILITY } from "@/modules/patient-evidence/policies/patient-evidence-policy";
import { resolvePatientEvidenceAccessContext } from "@/modules/patient-evidence/services/patient-evidence-access-service";
import { correctPatientName } from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { getStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  endPatientHospitalRelationship,
  getPatientHospitalRelationshipEndStatus,
} from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import { resolvePatientProgramAccessContext } from "@/modules/patient-program/services/patient-program-access-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { PatientProvisioningConflictError } from "@/modules/patient-provisioning/services/patient-provisioning-transaction";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { getOwnPatientAppointmentDetail, getOwnPatientAppointmentHistory, getOwnPatientCareJourney } from "@/modules/patient-self/services/patient-self-care-query-service";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import { createPatientServiceRequest, listOwnPatientServiceRequests } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { getHospitalReportingPage } from "@/modules/reporting/services/hospital-report-query-service";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { setHospitalMembershipReportExportGrant } from "@/modules/workforce/services/workforce-service";
import { resolveScreeningAccessContext } from "@/modules/screening/services/screening-access-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const db = getPrisma();
const now = new Date("2026-10-16T03:00:00Z");
const dependencies = { database: db, now: () => now };
const familyDeps = { database: db, enabled: true, now: () => now };
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];
const IDENTITY_NAMESPACE = "phase-f";

async function account(roles: Role[]): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "Phase F" } });
  people.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } } });
  users.push(user.id);
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function staff(hospitalId: string, membershipType: MembershipType): Promise<ActorContext> {
  const actor = await account([Role.HOSPITAL]);
  await db.hospitalMembership.create({ data: { userId: actor.userId, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  return { ...actor, hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
}

async function osm(hospitalId: string): Promise<ActorContext> {
  const actor = await account([Role.OSM]);
  await db.osmHospitalRelationship.create({ data: { userId: actor.userId, hospitalId, status: MembershipStatus.ACTIVE } });
  return { ...actor, osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] };
}

async function hospital(): Promise<string> {
  const row = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 32), name: "โรงพยาบาล Phase F", status: HospitalStatus.ACTIVE } });
  hospitals.push(row.id);
  return row.id;
}

async function provision(owner: ActorContext, hospitalId: string, identity: string) {
  const provisioned = await provisionPatient(owner, { identity: { namespace: IDENTITY_NAMESPACE, value: identity }, targetHospitalId: hospitalId, givenName: "ผู้ป่วย", familyName: "ทดสอบ" });
  if (!users.includes(provisioned.userId)) users.push(provisioned.userId);
  if (!people.includes(provisioned.personId)) people.push(provisioned.personId);
  return provisioned;
}

/** Hospital A (ended below) and Hospital B (untouched) share one Patient; A has an assigned OSM. */
async function fixture() {
  const hospitalId = await hospital();
  const otherHospitalId = await hospital();
  const owner = await staff(hospitalId, MembershipType.OWNER);
  const member = await staff(hospitalId, MembershipType.MEMBER);
  const otherOwner = await staff(otherHospitalId, MembershipType.OWNER);
  const assignedOsm = await osm(hospitalId);
  const identity = randomUUID();
  const provisioned = await provision(owner, hospitalId, identity);
  await db.user.update({ where: { id: provisioned.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  const other = await provision(otherOwner, otherHospitalId, identity);
  await assignOsmToPatient(owner, { patientHospitalRelationshipId: provisioned.relationshipId, osmUserId: assignedOsm.userId });
  const patient: ActorContext = { userId: provisioned.userId, personId: provisioned.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
  return { hospitalId, otherHospitalId, owner, member, otherOwner, osm: assignedOsm, patient, identity,
    relationshipId: provisioned.relationshipId, otherRelationshipId: other.relationshipId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function caregiverWithGrant(f: Fixture): Promise<{ caregiver: ActorContext; grantId: string }> {
  const caregiver = await account([]);
  const profile = await db.patientProfile.findUniqueOrThrow({ where: { personId: f.patient.personId }, select: { id: true } });
  const invitation = await db.caregiverInvitation.create({ data: {
    patientProfileId: profile.id, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId,
    issuedByUserId: f.patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1",
    issuedAt: now, expiresAt: new Date(now.getTime() + 86_400_000), acceptedAt: now,
  } });
  const parent = await db.caregiverRelationship.create({ data: { patientProfileId: profile.id, caregiverUserId: caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now } });
  const { grantId } = await proposeAppointmentGrant(f.patient, { caregiverRelationshipId: parent.id, patientHospitalRelationshipId: f.relationshipId }, familyDeps);
  await acceptAppointmentGrant(caregiver, grantId, familyDeps);
  return { caregiver, grantId };
}

async function bindLine(actor: ActorContext): Promise<string> {
  const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
  await db.lineAccountBinding.create({ data: { userId: actor.userId, lineUserId,
    lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"), lineSubjectFingerprintKeyId: "synthetic-phase-f",
    reachability: LineReachability.FRIEND, reachabilityObservedAt: now } });
  await setOwnAppointmentLineNotificationPreference(actor, true, { database: db });
  return lineUserId;
}

function appointmentInput(relationshipId: string, scheduledAt: string): Record<string, unknown> {
  return { patientHospitalRelationshipId: relationshipId, submissionNonce: randomUUID(), scheduledAt, type: "FOLLOW_UP", responsibleUserId: null, locationType: "CLINIC", durationMinutes: 30 };
}

function endInput(relationshipId: string): Record<string, unknown> {
  return { relationshipId, endReason: "ย้ายไปรับการดูแลที่อื่น", confirmRetention: true };
}

async function cleanup(): Promise<void> {
  const relationshipIds = (await db.patientHospitalRelationship.findMany({ where: { hospitalId: { in: hospitals } }, select: { id: true } })).map(({ id }) => id);
  const profileIds = (await db.patientProfile.findMany({ where: { personId: { in: people } }, select: { id: true } })).map(({ id }) => id);
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.appointmentLineNotification.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.caregiverAppointmentGrant.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.caregiverRelationship.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.caregiverInvitation.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.patientAppointmentRescheduleRequest.deleteMany({ where: { appointment: { patientHospitalRelationshipId: { in: relationshipIds } } } });
  await db.patientAppointmentCancellationRequest.deleteMany({ where: { appointment: { patientHospitalRelationshipId: { in: relationshipIds } } } });
  await db.patientAppointment.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.lineAppointmentNotificationPreference.deleteMany({ where: { userId: { in: users } } });
  await db.lineAccountBinding.deleteMany({ where: { userId: { in: users } } });
  await db.patientServiceRequest.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalServiceOffering.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientProgram.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientAccessRequest.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientHospitalRelationship.deleteMany({ where: { id: { in: relationshipIds } } });
  await db.patientProfile.deleteMany({ where: { id: { in: profileIds } } });
  await db.hospitalContact.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalContent.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.osmHospitalRelationship.deleteMany({ where: { OR: [{ hospitalId: { in: hospitals } }, { userId: { in: users } }] } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0; users.length = 0; people.length = 0;
}

describe("Phase F: ending a Patient's care relationship with one Hospital (PostgreSQL)", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(async () => { vi.unstubAllEnvs(); await cleanup(); });
  afterAll(async () => { await db.$disconnect(); });

  it("only the OWNER of the exact ACTIVE Hospital ends care, with a reason and confirmation, exactly once", async () => {
    const f = await fixture();
    await expect(endPatientHospitalRelationship(f.member, endInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(endPatientHospitalRelationship(f.otherOwner, endInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(endPatientHospitalRelationship(f.osm, endInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(endPatientHospitalRelationship(f.patient, endInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(endPatientHospitalRelationship(f.owner, { ...endInput(f.relationshipId), confirmRetention: false }, dependencies)).rejects.toBeInstanceOf(ValidationError);
    await expect(endPatientHospitalRelationship(f.owner, { ...endInput(f.relationshipId), endReason: "  " }, dependencies)).rejects.toBeInstanceOf(ValidationError);
    expect(await db.patientHospitalRelationship.count({ where: { id: f.relationshipId, ...activePatientHospitalRelationshipWhere } })).toBe(1);
    await expect(getPatientHospitalRelationshipEndStatus(f.owner, f.relationshipId, dependencies)).resolves.toBe("ACTIVE");

    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(getPatientHospitalRelationshipEndStatus(f.owner, f.relationshipId, dependencies)).resolves.toBe("ENDED");
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } }))
      .toMatchObject({ endedAt: now, endedByUserId: f.owner.userId, endReason: "ย้ายไปรับการดูแลที่อื่น" });
    await expect(endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(ConflictError);

    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "patient.hospital_relationship.ended", resourceId: f.relationshipId } });
    expect(audit).toMatchObject({ actorUserId: f.owner.userId, resourceType: "PatientHospitalRelationship" });
    expect(audit.metadata).toMatchObject({ basis: "HOSPITAL_OWNER", hospitalId: f.hospitalId, osmAssignmentsEnded: 1 });
    expect(JSON.stringify(audit.metadata)).not.toContain("ย้ายไป");
  });

  it("verifies only the exact Hospital OWNER's current relationship status", async () => {
    const f = await fixture();

    await expect(getPatientHospitalRelationshipEndStatus(f.owner, f.relationshipId, dependencies)).resolves.toBe("ACTIVE");
    await expect(getPatientHospitalRelationshipEndStatus(f.member, f.relationshipId, dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPatientHospitalRelationshipEndStatus(f.otherOwner, f.relationshipId, dependencies)).rejects.toBeInstanceOf(NotFoundError);

    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(getPatientHospitalRelationshipEndStatus(f.owner, f.relationshipId, dependencies)).resolves.toBe("ENDED");

    await db.hospitalMembership.updateMany({
      where: { userId: f.owner.userId, hospitalId: f.hospitalId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await expect(getPatientHospitalRelationshipEndStatus(f.owner, f.relationshipId, dependencies)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the database refuses to reopen or rewrite an ended relationship and keeps the end fields consistent", async () => {
    const f = await fixture();
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { endedAt: now } })).rejects.toThrow();
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { endedAt: null, endedByUserId: null, endReason: null } })).rejects.toThrow();
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { endReason: "อื่น ๆ" } })).rejects.toThrow();
    const reassignment = await provision(f.otherOwner, f.otherHospitalId, randomUUID());
    const replacementProfile = await db.patientProfile.findUniqueOrThrow({ where: { personId: reassignment.personId }, select: { id: true } });
    const replacementHospitalId = await hospital();
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { patientProfileId: replacementProfile.id } })).rejects.toThrow();
    await expect(db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { hospitalId: replacementHospitalId } })).rejects.toThrow();
    await db.patientHospitalRelationship.update({ where: { id: f.relationshipId }, data: { hospitalNumber: "HN-AFTER-END" } });
  });

  it("the database rejects NULL reasons, blank reasons, and every partial ended-state combination", async () => {
    const f = await fixture();
    const patientProfile = await db.patientProfile.findUniqueOrThrow({ where: { personId: f.patient.personId }, select: { id: true } });
    const invalidStates = [
      { endedAt: now, endedByUserId: f.owner.userId, endReason: null },
      { endedAt: now, endedByUserId: f.owner.userId, endReason: "   " },
      { endedAt: now, endedByUserId: f.owner.userId, endReason: "\t\r\n" },
      { endedAt: now, endedByUserId: null, endReason: "ย้าย" },
      { endedAt: null, endedByUserId: f.owner.userId, endReason: "ย้าย" },
      { endedAt: now, endedByUserId: null, endReason: null },
      { endedAt: null, endedByUserId: f.owner.userId, endReason: null },
      { endedAt: null, endedByUserId: null, endReason: "ย้าย" },
    ];

    for (const invalidState of invalidStates) {
      const hospitalId = await hospital();
      const relationship = await db.patientHospitalRelationship.create({ data: { patientProfileId: patientProfile.id, hospitalId } });
      await expect(
        db.patientHospitalRelationship.update({ where: { id: relationship.id }, data: invalidState }),
      ).rejects.toThrow();
    }
  });

  it("prevents report export grants from including ended relationships while keeping ACTIVE exports consistent", async () => {
    const f = await fixture();
    const program = await openPatientProgram(f.owner, { patientHospitalRelationshipId: f.relationshipId }, dependencies);
    await db.patientProgram.update({ where: { id: program.patientProgramId }, data: { status: "COMPLETED", completedAt: now } });
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(exportHospitalReportingWorkbook(f.member, { hospitalId: f.hospitalId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getHospitalReportingPage(f.otherOwner, { hospitalId: f.hospitalId, cohort: "INCLUDE_ENDED" }, { database: db }))
      .rejects.toBeInstanceOf(NotFoundError);

    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.member.userId, hospitalId: f.hospitalId } });
    await setHospitalMembershipReportExportGrant(f.owner, {
      relationshipId: membership.id,
      targetHospitalId: f.hospitalId,
      expectedUpdatedAt: membership.updatedAt.toISOString(),
      granted: true,
    });

    const exported = await exportHospitalReportingWorkbook(f.member, { hospitalId: f.hospitalId });
    expect(exported.buffer.byteLength).toBeGreaterThan(0);
    expect((await db.auditEvent.findFirstOrThrow({ where: { action: "hospital_reporting.export.prepared", actorUserId: f.member.userId } })).metadata)
      .toMatchObject({ accessBasis: "MEMBER_EXPORT_GRANT", cohort: "ACTIVE", programCount: 0 });

    await expect(exportHospitalReportingWorkbook(f.member, { hospitalId: f.hospitalId, cohort: "INCLUDE_ENDED" }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.auditEvent.count({ where: { action: "hospital_reporting.export.prepared", actorUserId: f.member.userId } })).toBe(1);
  });

  it("ends the OSM assignment, cancels only future appointments, closes open requests and revokes this Hospital's pending activation", async () => {
    const f = await fixture();
    const past = await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-10T10:00:00+07:00"), dependencies);
    const future = await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-30T10:00:00+07:00"), dependencies);
    const otherFuture = await createAppointment(f.otherOwner, appointmentInput(f.otherRelationshipId, "2026-10-30T10:00:00+07:00"), dependencies);
    const futureRow = await db.patientAppointment.findUniqueOrThrow({ where: { id: future.appointmentId } });
    await db.patientAppointmentRescheduleRequest.create({ data: { appointmentId: future.appointmentId, sourceAppointmentUpdatedAt: futureRow.updatedAt,
      submittedByUserId: f.patient.userId, source: "PATIENT_SELF", submissionNonce: randomUUID(), reason: "ไม่สะดวก", preferredDatetimes: [new Date("2026-11-02T03:00:00Z")] } });
    await db.patientAppointmentCancellationRequest.create({ data: { appointmentId: past.appointmentId, sourceAppointmentUpdatedAt: now,
      submittedByUserId: f.patient.userId, source: "PATIENT_SELF", submissionNonce: randomUUID() } });
    const offering = await db.hospitalServiceOffering.create({ data: { hospitalId: f.hospitalId, code: "SCREENING", enabled: true, createdByUserId: f.owner.userId, updatedByUserId: f.owner.userId } });
    const request = await db.patientServiceRequest.create({ data: { patientHospitalRelationshipId: f.relationshipId, hospitalId: f.hospitalId, offeringId: offering.id, requestedByUserId: f.patient.userId } });
    const activation = await db.patientActivation.create({ data: { userId: f.patient.userId, hospitalId: f.hospitalId, tokenHash: randomUUID(), expiresAt: new Date(now.getTime() + 86_400_000), createdByUserId: f.owner.userId } });

    const result = await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    expect(result).toMatchObject({ osmAssignmentsEnded: 1, appointmentsCancelled: 1, appointmentRequestsClosed: 2, serviceRequestsClosed: 1, activationsRevoked: 1 });

    expect(await db.patientOsmAssignment.findFirstOrThrow({ where: { patientHospitalRelationshipId: f.relationshipId } })).toMatchObject({ endedAt: now, endedByUserId: f.owner.userId });
    expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: past.appointmentId } })).status).toBe("SCHEDULED");
    expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: future.appointmentId } })).status).toBe("CANCELLED");
    expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: otherFuture.appointmentId } })).status).toBe("SCHEDULED");
    expect(await db.patientAppointmentRescheduleRequest.count({ where: { appointmentId: future.appointmentId, status: "SUPERSEDED", resolvedByUserId: f.owner.userId } })).toBe(1);
    expect(await db.patientAppointmentCancellationRequest.count({ where: { appointmentId: past.appointmentId, status: "SUPERSEDED" } })).toBe(1);
    expect(await db.patientServiceRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: "REJECTED", reviewedByUserId: f.owner.userId });
    expect((await db.patientActivation.findUniqueOrThrow({ where: { id: activation.id } })).revokedAt).toEqual(now);
    expect(await db.auditEvent.count({ where: { action: "appointment.cancelled", resourceId: future.appointmentId } })).toBe(1);
    // No LINE intent is created by the end transaction itself.
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: future.appointmentId, eventKind: "CANCELLED" } })).toBe(0);
  });

  it("staff and OSM of that Hospital can no longer read or write the Patient in any module; Hospital B is unaffected", async () => {
    const f = await fixture();
    // One pending activation per User: one issued by Hospital B is not this Hospital's to revoke.
    const otherActivation = await db.patientActivation.create({ data: { userId: f.patient.userId, hospitalId: f.otherHospitalId, tokenHash: randomUUID(), expiresAt: new Date(now.getTime() + 86_400_000), createdByUserId: f.otherOwner.userId } });
    await expect(endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies)).resolves.toMatchObject({ activationsRevoked: 0 });
    expect((await db.patientActivation.findUniqueOrThrow({ where: { id: otherActivation.id } })).revokedAt).toBeNull();

    const directory = await findPatientDirectory(f.owner, { targetHospitalId: f.hospitalId, lookupType: "NAME", page: 1 }, { database: db });
    expect(directory.items.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).not.toContain(f.relationshipId);
    const assigned = await findAssignedPatientDirectory(f.osm, { lookupType: "NAME", page: 1 }, { database: db });
    expect(assigned.items).toHaveLength(0);
    for (const actor of [f.owner, f.member, f.osm]) {
      await expect(getPatientDirectoryDetail(actor, f.relationshipId, { database: db })).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolveAppointmentAccessContext(actor, f.relationshipId, APPOINTMENT_READ_CAPABILITY, db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolveFollowupAccessContext(actor, f.relationshipId, "followup:read", db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolveGoalAccessContext(actor, f.relationshipId, "goal:read", db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolveScreeningAccessContext(actor, f.relationshipId, "screening:read", db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolvePatientProgramAccessContext(actor, f.relationshipId, "program:read", db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolvePatientBaselineAccessContext(actor, f.relationshipId, PATIENT_BASELINE_READ_CAPABILITY, db)).rejects.toBeInstanceOf(NotFoundError);
      await expect(resolvePatientEvidenceAccessContext(actor, f.relationshipId, PATIENT_ARTIFACT_READ_CAPABILITY, db)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(resolvePatientClassificationAccessContext(f.owner, f.relationshipId, PATIENT_CLASSIFICATION_READ_CAPABILITY, db)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getStaffPatientHospitalProfile(f.owner, f.relationshipId, db)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-11-01T10:00:00+07:00"), dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openPatientProgram(f.owner, { patientHospitalRelationshipId: f.relationshipId }, dependencies)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignOsmToPatient(f.owner, { patientHospitalRelationshipId: f.relationshipId, osmUserId: f.osm.userId })).rejects.toBeInstanceOf(NotFoundError);
    const person = await db.person.findUniqueOrThrow({ where: { id: f.patient.personId } });
    await expect(correctPatientName(f.owner, f.relationshipId, { expectedVersion: person.version, givenName: "ใหม่", familyName: "ทดสอบ" }, db)).rejects.toBeInstanceOf(ForbiddenError);

    // Hospital B still works with the same Patient.
    await expect(getPatientDirectoryDetail(f.otherOwner, f.otherRelationshipId, { database: db })).resolves.toBeDefined();
    await expect(createAppointment(f.otherOwner, appointmentInput(f.otherRelationshipId, "2026-11-01T10:00:00+07:00"), dependencies)).resolves.toBeDefined();
  });

  it("the Patient keeps read-only history for the ended Hospital, marked as ended, and full access at the other Hospital", async () => {
    const f = await fixture();
    const future = await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-30T10:00:00+07:00"), dependencies);
    const offering = await db.hospitalServiceOffering.create({ data: { hospitalId: f.hospitalId, code: "SCREENING", enabled: true, createdByUserId: f.owner.userId, updatedByUserId: f.owner.userId } });
    await db.hospitalContact.create({ data: { hospitalId: f.hospitalId, phoneNumber: "021234567" } });
    await expect(getOwnPatientAppointmentDetail(f.patient, f.relationshipId, future.appointmentId, { database: db })).resolves.toMatchObject({ contactPhones: { hospitalPhone: "021234567" } });
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(getOwnPatientAppointmentDetail(f.patient, f.relationshipId, future.appointmentId, { database: db })).resolves.toMatchObject({ status: "CANCELLED", contactPhones: { hospitalPhone: null } });

    const context = await resolveOwnPatientContext(f.patient, { database: db });
    const ended = context?.hospitalRelationships.find(({ relationshipId }) => relationshipId === f.relationshipId);
    const active = context?.hospitalRelationships.find(({ relationshipId }) => relationshipId === f.otherRelationshipId);
    expect(ended?.careEndedAt).toEqual(now);
    expect(active?.careEndedAt).toBeNull();

    const history = await getOwnPatientAppointmentHistory(f.patient, f.relationshipId, { database: db });
    expect(history.appointments.map(({ appointmentId, status }) => [appointmentId, status])).toEqual([[future.appointmentId, "CANCELLED"]]);
    await expect(getOwnPatientCareJourney(f.patient, f.relationshipId, { database: db })).resolves.toMatchObject({ relationship: { careEndedAt: now } });
    await expect(resolveAppointmentAccessContext(f.patient, f.relationshipId, APPOINTMENT_ACKNOWLEDGE_CAPABILITY, db)).rejects.toBeInstanceOf(NotFoundError);

    const row = await db.patientAppointment.findUniqueOrThrow({ where: { id: future.appointmentId } });
    await expect(acknowledgeOwnPatientAppointment(f.patient, { patientHospitalRelationshipId: f.relationshipId, appointmentId: future.appointmentId, expectedUpdatedAt: row.updatedAt.toISOString() }, dependencies))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(createPatientServiceRequest(f.patient, { relationshipId: f.relationshipId, offeringId: offering.id }, dependencies)).rejects.toBeInstanceOf(NotFoundError);
    const services = await listOwnPatientServiceRequests(f.patient, dependencies);
    expect(services.find(({ relationshipId }) => relationshipId === f.relationshipId)).toMatchObject({ careEnded: true, offerings: [] });

    await expect(resolveAppointmentAccessContext(f.patient, f.otherRelationshipId, APPOINTMENT_ACKNOWLEDGE_CAPABILITY, db)).resolves.toMatchObject({ scopes: { patientSelf: true } });
    await expect(getOwnPatientAppointmentHistory(f.patient, f.otherRelationshipId, { database: db })).resolves.toMatchObject({ relationship: { careEndedAt: null } });
  });

  it("caregivers lose appointment access derived from the ended Hospital; the Patient sees the grant as ended", async () => {
    vi.stubEnv("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED", "true");
    const f = await fixture();
    const { caregiver, grantId } = await caregiverWithGrant(f);
    await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-30T10:00:00+07:00"), dependencies);
    await expect(listDelegatedAppointments(caregiver, { grantId }, familyDeps)).resolves.toMatchObject({ appointments: [expect.anything()] });

    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    await expect(listDelegatedAppointments(caregiver, { grantId }, familyDeps)).rejects.toBeInstanceOf(NotFoundError);
    const caregiverView = await getAppointmentGrantManagement(caregiver, {}, familyDeps);
    expect(caregiverView?.caregiver.grants).toHaveLength(0);
    const patientView = await getAppointmentGrantManagement(f.patient, {}, familyDeps);
    expect(patientView?.patient?.grants).toEqual([expect.objectContaining({ grantId, status: "ACTIVE", careEnded: true })]);
    expect(patientView?.patient?.hospitals.map(({ relationshipId }) => relationshipId)).toEqual([f.otherRelationshipId]);
    // The grant row itself is retained (history), not revoked by the OWNER.
    expect(await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId }, select: { status: true } })).toEqual({ status: "ACTIVE" });
  });

  it("stops LINE notifications for the relationship: pending outbox rows are suppressed at send time", async () => {
    vi.stubEnv("FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED", "true");
    const f = await fixture();
    const { caregiver } = await caregiverWithGrant(f);
    await bindLine(f.patient); await bindLine(f.osm); await bindLine(caregiver);
    const rollout = { enabled: true, generation: randomUUID() };
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-30T10:00:00+07:00"), { ...dependencies, appointmentLineNotificationRollout: rollout });
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: appointment.appointmentId, state: "PENDING" } })).toBe(3);

    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);
    const pushed: string[] = [];
    await drainAppointmentLineNotificationOutbox({ database: db, now: () => now, rollout: () => rollout, familyAppointmentReadEnabled: () => true, logSummary: () => undefined,
      push: async (lineUserId: string) => { pushed.push(lineUserId); return { kind: "ACCEPTED" as const }; } });
    expect(pushed).toEqual([]);
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: appointment.appointmentId, state: "PROVIDER_ACCEPTED" } })).toBe(0);
  });

  it("reports exclude ended Patients by default and include their completed Programs when the OWNER opts in", async () => {
    const f = await fixture();
    const program = await openPatientProgram(f.owner, { patientHospitalRelationshipId: f.relationshipId }, dependencies);
    await db.patientProgram.update({ where: { id: program.patientProgramId }, data: { status: "COMPLETED", completedAt: now } });
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);

    const defaultPage = await getHospitalReportingPage(f.owner, { hospitalId: f.hospitalId }, { database: db });
    expect(defaultPage.cohort).toBe("ACTIVE");
    expect(defaultPage.counts.patientHospitalRelationships.value).toBe(0);
    expect(defaultPage.page.items).toHaveLength(0);

    const withEnded = await getHospitalReportingPage(f.owner, { hospitalId: f.hospitalId, cohort: "INCLUDE_ENDED" }, { database: db });
    expect(withEnded.cohort).toBe("INCLUDE_ENDED");
    expect(withEnded.counts.patientHospitalRelationships.value).toBe(1);
    expect(withEnded.counts.programs).toMatchObject({ total: 1, completed: 1 });
    expect(withEnded.page.items.map(({ patientProgramId }) => patientProgramId)).toEqual([program.patientProgramId]);

    const exported = await exportHospitalReportingWorkbook(f.owner, { hospitalId: f.hospitalId, cohort: "INCLUDE_ENDED" });
    expect(exported.buffer.byteLength).toBeGreaterThan(0);
    expect((await db.auditEvent.findFirstOrThrow({ where: { action: "hospital_reporting.export.prepared", actorUserId: f.owner.userId } })).metadata)
      .toMatchObject({ cohort: "INCLUDE_ENDED", programCount: 1 });
  });

  it("closes the remaining Hospital-derived surfaces: contact, content, counts, bulk assignment, activation lookup, LINE opt-in, support, reschedule", async () => {
    const f = await fixture();
    await db.hospitalContact.create({ data: { hospitalId: f.hospitalId, phoneNumber: "021234567" } });
    await db.hospitalContent.create({ data: { hospitalId: f.hospitalId, submissionNonce: randomUUID(), title: "ความรู้ รพ. A", body: "เนื้อหา", category: "NCD",
      status: "PUBLISHED", firstPublishedAt: now, latestPublishedAt: now } });
    const future = await createAppointment(f.owner, appointmentInput(f.relationshipId, "2026-10-30T10:00:00+07:00"), dependencies);
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);

    const contacts = await listOwnPatientHospitalContacts(f.patient, db);
    expect(contacts.find(({ relationshipId }) => relationshipId === f.relationshipId)).toMatchObject({ availability: "UNAVAILABLE" });
    expect((await listPatientHospitalContent(f.patient, {}, db)).items).toHaveLength(0);
    expect(await getPatientClassificationCounts(f.owner, f.hospitalId, db)).toMatchObject({ total: 0 });
    await expect(assignOsmToPatients(f.owner, { hospitalId: f.hospitalId, osmUserId: f.osm.userId, patientHospitalRelationshipIds: [f.relationshipId], submissionNonce: randomUUID() }))
      .rejects.toBeInstanceOf(Error);
    expect(await db.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: f.relationshipId, endedAt: null } })).toBe(0);
    expect(await findPatientActivationCandidates(f.owner, { targetHospitalId: f.hospitalId, lookupType: "NAME", value: "ผู้ป่วย" }, dependencies)).toHaveLength(0);
    expect((await listOwnSupportHospitals(f.patient, db)).map(({ id }) => id)).toEqual([f.otherHospitalId]);
    expect(await getAppointmentRescheduleHistory(f.patient, f.relationshipId, future.appointmentId)).toMatchObject({ canRequest: false, canReview: false });

    // A Patient whose only relationship ended can no longer opt in to appointment messages.
    const onlyHospital = await fixture();
    await db.patientHospitalRelationship.update({ where: { id: onlyHospital.otherRelationshipId }, data: { endedAt: now, endedByUserId: onlyHospital.otherOwner.userId, endReason: "ทดสอบ" } });
    await endPatientHospitalRelationship(onlyHospital.owner, endInput(onlyHospital.relationshipId), dependencies);
    await expect(getOwnAppointmentLineNotificationPreference(onlyHospital.patient, db)).resolves.toBeNull();
  });

  it("re-provisioning or re-admitting the same national ID is classified as ENDED_RELATIONSHIP, never reactivated", async () => {
    const f = await fixture();
    await endPatientHospitalRelationship(f.owner, endInput(f.relationshipId), dependencies);

    const provisioning = provisionPatient(f.owner, { identity: { namespace: IDENTITY_NAMESPACE, value: f.identity }, targetHospitalId: f.hospitalId, givenName: "ผู้ป่วย", familyName: "ทดสอบ" });
    await expect(provisioning).rejects.toBeInstanceOf(PatientProvisioningConflictError);
    await expect(provisioning).rejects.toMatchObject({ kind: "ENDED_RELATIONSHIP" });

    const person = await db.person.findUniqueOrThrow({ where: { id: f.patient.personId } });
    // A request approved before care ended is reconciled as ENDED_RELATIONSHIP (approval of a pending one is refused).
    const request = await db.patientAccessRequest.create({ data: { hospitalId: f.hospitalId, identityKeyHash: person.identityKeyHash,
      status: "APPROVED", reviewedByUserId: f.owner.userId, reviewedAt: now } });
    const detail = await getHospitalPatientAccessRequestDetail(f.owner, { requestId: request.id }, dependencies);
    expect(detail.reconciliation).toMatchObject({ kind: "ENDED_RELATIONSHIP", personId: person.id });
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.relationshipId } })).toMatchObject({ endedAt: now });
  });
});
