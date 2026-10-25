import { createHash, randomUUID } from "node:crypto";
import { HospitalStatus, LineReachability, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getAppointmentDetail } from "@/modules/appointments/services/appointment-query-service";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import { drainAppointmentLineNotificationOutbox } from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { acceptAppointmentGrant, proposeAppointmentGrant, revokeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import { hashCaregiverInvitationToken } from "@/modules/family/services/caregiver-invitation-token-service";
import { acceptCaregiverInvitation, reissueCaregiverInvitationLink } from "@/modules/family/services/caregiver-relationship-service";
import { getDelegatedAppointment } from "@/modules/family/services/delegated-appointment-query-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { correctPatientName, PatientNameCorrectionRequiresAdminError } from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { updateStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { getPatientSelfAssignedOsmPhone } from "@/modules/patient-self/services/patient-self-query-service";
import { getOwnPatientAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";
import {
  PATIENT_SELF_MEASUREMENT_CARE_TEAM_PAGE_SIZE,
  PATIENT_SELF_MEASUREMENT_OWN_PAGE_SIZE,
} from "@/modules/patient-self-measurements/domain/patient-self-measurement";
import {
  createOwnPatientSelfMeasurement,
  deleteOwnPatientSelfMeasurement,
  listOwnPatientSelfMeasurements,
  listPatientSelfMeasurementsForCareTeam,
} from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { promoteHospitalOwner, setHospitalMembershipReportExportGrant } from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const db = getPrisma();
const now = new Date("2026-10-14T05:00:00Z");
const dependencies = { database: db, now: () => now };
const familyDeps = { database: db, enabled: true, now: () => now };
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];

async function account(roles: Role[]): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "Phase E" } });
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
  const row = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 32), name: "โรงพยาบาล Phase E", status: HospitalStatus.ACTIVE } });
  hospitals.push(row.id);
  return row.id;
}

async function patientIn(owner: ActorContext, hospitalId: string, identity = randomUUID()): Promise<{ patient: ActorContext; relationshipId: string }> {
  const provisioned = await provisionPatient(owner, { identity: { namespace: "phase-e", value: identity }, targetHospitalId: hospitalId, givenName: "ผู้ป่วย", familyName: "ทดสอบ" });
  if (!users.includes(provisioned.userId)) users.push(provisioned.userId);
  if (!people.includes(provisioned.personId)) people.push(provisioned.personId);
  await db.user.update({ where: { id: provisioned.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  return {
    patient: { userId: provisioned.userId, personId: provisioned.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] },
    relationshipId: provisioned.relationshipId,
  };
}

async function fixture() {
  const hospitalId = await hospital();
  const owner = await staff(hospitalId, MembershipType.OWNER);
  const member = await staff(hospitalId, MembershipType.MEMBER);
  const assignedOsm = await osm(hospitalId);
  const { patient, relationshipId } = await patientIn(owner, hospitalId);
  await assignOsmToPatient(owner, { patientHospitalRelationshipId: relationshipId, osmUserId: assignedOsm.userId });
  return { hospitalId, owner, member, osm: assignedOsm, patient, relationshipId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function caregiverWithGrant(f: Fixture, existingCaregiver?: ActorContext): Promise<{ caregiver: ActorContext; grantId: string }> {
  const caregiver = existingCaregiver ?? await account([]);
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

async function bindLine(actor: ActorContext, optIn = true): Promise<string> {
  const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
  await db.lineAccountBinding.create({ data: { userId: actor.userId, lineUserId,
    lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"), lineSubjectFingerprintKeyId: "synthetic-phase-e",
    reachability: LineReachability.FRIEND, reachabilityObservedAt: now } });
  if (optIn) await setOwnAppointmentLineNotificationPreference(actor, true, { database: db });
  return lineUserId;
}

function appointmentInput(relationshipId: string): Record<string, unknown> {
  return { patientHospitalRelationshipId: relationshipId, submissionNonce: randomUUID(), scheduledAt: "2026-10-20T10:00:00+07:00", type: "FOLLOW_UP", responsibleUserId: null, locationType: "CLINIC", durationMinutes: 30 };
}

async function cleanup(): Promise<void> {
  const relationshipIds = (await db.patientHospitalRelationship.findMany({ where: { hospitalId: { in: hospitals } }, select: { id: true } })).map(({ id }) => id);
  const profileIds = (await db.patientProfile.findMany({ where: { personId: { in: people } }, select: { id: true } })).map(({ id }) => id);
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.appointmentLineNotification.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.caregiverAppointmentGrant.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.caregiverRelationship.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.caregiverInvitation.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.patientSelfMeasurement.deleteMany({ where: { patientProfileId: { in: profileIds } } });
  await db.patientAppointmentAssigneeAcceptance.deleteMany({ where: { appointment: { patientHospitalRelationshipId: { in: relationshipIds } } } });
  await db.patientAppointment.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.lineAppointmentNotificationPreference.deleteMany({ where: { userId: { in: users } } });
  await db.lineAccountBinding.deleteMany({ where: { userId: { in: users } } });
  await db.patientProgram.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientHospitalProfile.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationshipId: { in: relationshipIds } } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: { id: { in: relationshipIds } } } });
  await db.patientHospitalRelationship.deleteMany({ where: { id: { in: relationshipIds } } });
  await db.patientProfile.deleteMany({ where: { id: { in: profileIds } } });
  await db.hospitalContact.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.osmHospitalRelationship.deleteMany({ where: { OR: [{ hospitalId: { in: hospitals } }, { userId: { in: users } }] } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0; users.length = 0; people.length = 0;
}

describe("Phase E access decisions (PostgreSQL)", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(async () => { vi.unstubAllEnvs(); await cleanup(); });
  afterAll(async () => { await db.$disconnect(); });

  it("E1 superseded (2026-10-21): every ACTIVE MEMBER exports without a grant; grant management stays retired", async () => {
    const f = await fixture();
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.member.userId, hospitalId: f.hospitalId } });
    expect(membership.reportExportGrantedAt).toBeNull();
    expect((await exportHospitalReportingWorkbook(f.member, { hospitalId: f.hospitalId })).buffer.byteLength).toBeGreaterThan(0);
    await db.hospitalMembership.update({ where: { id: membership.id }, data: { reportExportGrantedAt: now, reportExportGrantedByUserId: f.owner.userId } });
    await expect(getHospitalReportingDatasetForExport(f.member, { hospitalId: f.hospitalId }, { database: db })).resolves.toMatchObject({ cohort: "ACTIVE" });
    await expect(exportHospitalReportingWorkbook(f.member, { hospitalId: f.hospitalId, cohort: "INCLUDE_ENDED" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setHospitalMembershipReportExportGrant(f.owner, { relationshipId: membership.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: membership.updatedAt.toISOString(), granted: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ reportExportGrantedAt: now });
    expect((await db.auditEvent.findFirstOrThrow({ where: { action: "hospital_reporting.export.prepared", actorUserId: f.member.userId } })).metadata)
      .toMatchObject({ accessBasis: "MEMBER", cohort: "ACTIVE" });
    expect((await exportHospitalReportingWorkbook(f.owner, { hospitalId: f.hospitalId })).buffer.byteLength).toBeGreaterThan(0);
  });

  it("keeps historical grants MEMBER-only and clears them on promotion", async () => {
    const f = await fixture();
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.member.userId } });
    const historical = await db.hospitalMembership.update({ where: { id: membership.id }, data: { reportExportGrantedAt: now, reportExportGrantedByUserId: f.owner.userId } });
    await promoteHospitalOwner(f.owner, { relationshipId: membership.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: historical.updatedAt.toISOString() });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ membershipType: "OWNER", reportExportGrantedAt: null, reportExportGrantedByUserId: null });
  });

  it("E2: showing a pending invitation as QR rotates the link; the new link accepts exactly like before, the old one is dead", async () => {
    const f = await fixture();
    const caregiver = await account([]);
    const profile = await db.patientProfile.findUniqueOrThrow({ where: { personId: f.patient.personId } });
    const originalToken = "o".repeat(43);
    const issuedAt = new Date();
    const invitation = await db.caregiverInvitation.create({ data: {
      patientProfileId: profile.id, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, issuedByUserId: f.patient.userId,
      tokenHash: hashCaregiverInvitationToken(originalToken), issuedAt, expiresAt: new Date(issuedAt.getTime() + 24 * 3_600_000),
    } });
    const other = await account([Role.PATIENT]);
    await db.patientProfile.create({ data: { personId: other.personId } });
    await expect(reissueCaregiverInvitationLink(other, invitation.id, { database: db })).rejects.toBeInstanceOf(NotFoundError);

    const reissued = await reissueCaregiverInvitationLink(f.patient, invitation.id, { database: db });
    expect(reissued.expiresAt.getTime()).toBe(invitation.expiresAt.getTime());
    await expect(acceptCaregiverInvitation(caregiver, originalToken, { database: db })).rejects.toBeInstanceOf(NotFoundError);
    const outsider = await account([]);
    await expect(acceptCaregiverInvitation(outsider, reissued.plaintextToken, { database: db })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(acceptCaregiverInvitation(caregiver, reissued.plaintextToken, { database: db })).resolves.toMatchObject({ invitationId: invitation.id });
    await expect(reissueCaregiverInvitationLink(f.patient, invitation.id, { database: db })).rejects.toBeInstanceOf(ConflictError);
    expect(await db.auditEvent.count({ where: { action: "caregiver_invitation.link_reissued", resourceId: invitation.id } })).toBe(1);
  });

  it("E3: OWNER corrects a single-hospital Patient name, is refused for a multi-hospital Person, ADMIN may, and stale versions conflict", async () => {
    const f = await fixture();
    const name = { givenName: "ชื่อใหม่", familyName: "นามสกุลใหม่" };
    await expect(correctPatientName(f.member, f.relationshipId, { expectedVersion: 2, ...name }, db)).rejects.toBeInstanceOf(ForbiddenError);
    const person = await db.person.findUniqueOrThrow({ where: { id: f.patient.personId } });
    await expect(correctPatientName(f.owner, f.relationshipId, { expectedVersion: person.version, ...name }, db)).resolves.toEqual({ version: person.version + 1 });
    await expect(correctPatientName(f.owner, f.relationshipId, { expectedVersion: person.version, givenName: "อีกชื่อ", familyName: "อีกสกุล" }, db)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ ...name, version: person.version + 1 });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "patient.person_name.corrected", resourceId: person.id } });
    expect(JSON.stringify(audit.metadata)).not.toContain("ชื่อใหม่");
    expect(audit.metadata).toMatchObject({ basis: "HOSPITAL_OWNER_SINGLE_HOSPITAL", givenNameChanged: true, familyNameChanged: true });

    const secondHospitalId = await hospital();
    await db.osmHospitalRelationship.create({ data: { userId: f.patient.userId, hospitalId: secondHospitalId, status: MembershipStatus.ACTIVE } });
    await expect(correctPatientName(f.owner, f.relationshipId, { expectedVersion: person.version + 1, givenName: "ก", familyName: "ข" }, db)).rejects.toBeInstanceOf(PatientNameCorrectionRequiresAdminError);

    const admin = await account([Role.ADMIN]);
    await expect(correctPatientName(admin, f.relationshipId, { expectedVersion: person.version + 1, givenName: "ก", familyName: "ข" }, db)).resolves.toEqual({ version: person.version + 2 });
  });

  it("E3: a Patient related to two Hospitals as Patient is refused for both OWNERs", async () => {
    const identity = randomUUID();
    const first = await fixture();
    await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationshipId: first.relationshipId } });
    const secondHospitalId = await hospital();
    const secondOwner = await staff(secondHospitalId, MembershipType.OWNER);
    const a = await patientIn(first.owner, first.hospitalId, identity);
    const b = await patientIn(secondOwner, secondHospitalId, identity);
    expect(b.patient.personId).toBe(a.patient.personId);
    const version = (await db.person.findUniqueOrThrow({ where: { id: a.patient.personId } })).version;
    await expect(correctPatientName(first.owner, a.relationshipId, { expectedVersion: version, givenName: "ก", familyName: "ข" }, db)).rejects.toBeInstanceOf(PatientNameCorrectionRequiresAdminError);
    await expect(correctPatientName(secondOwner, b.relationshipId, { expectedVersion: version, givenName: "ก", familyName: "ข" }, db)).rejects.toBeInstanceOf(PatientNameCorrectionRequiresAdminError);
  });

  it("E4: everyone sees the Hospital phone; only the assigned OSM and Hospital staff see the Patient phone", async () => {
    const f = await fixture();
    await db.hospitalContact.create({ data: { hospitalId: f.hospitalId, phoneNumber: "02-123-4567" } });
    await updateStaffPatientHospitalProfile(f.owner, f.relationshipId, { expectedVersion: 0, phoneNumber: "0812345678" }, db);
    const { caregiver, grantId } = await caregiverWithGrant(f);
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    const both = { assignedOsmPhone: null, hospitalPhone: "02-123-4567", patientPhone: "0812345678" };
    const hospitalOnly = { assignedOsmPhone: null, hospitalPhone: "02-123-4567", patientPhone: null };

    expect((await getAppointmentDetail(f.owner, f.relationshipId, appointment.appointmentId)).contactPhones).toEqual(both);
    expect((await getAppointmentDetail(f.member, f.relationshipId, appointment.appointmentId)).contactPhones).toEqual(both);
    expect((await getAppointmentDetail(f.osm, f.relationshipId, appointment.appointmentId)).contactPhones).toEqual(both);
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipId, appointment.appointmentId)).contactPhones).toEqual(hospitalOnly);
    const delegated = await getDelegatedAppointment(caregiver, grantId, appointment.appointmentId, familyDeps);
    expect(delegated.contactPhones).toEqual(hospitalOnly);
    expect(JSON.stringify(delegated)).not.toContain("0812345678");

    const unassigned = await osm(f.hospitalId);
    await expect(getAppointmentDetail(unassigned, f.relationshipId, appointment.appointmentId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("WF-PHONE: current assigned OSM phone reaches only same-Hospital staff and exact Patient SELF", async () => {
    const f = await fixture();
    await db.osmHospitalRelationship.updateMany({ where: { hospitalId: f.hospitalId, userId: f.osm.userId }, data: { contactPhone: "0899999999" } });
    await db.hospitalMembership.updateMany({ where: { hospitalId: f.hospitalId }, data: { contactPhone: "021234567" } });
    const { caregiver, grantId } = await caregiverWithGrant(f);
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    for (const actor of [f.owner, f.member]) {
      const detail = await getAppointmentDetail(actor, f.relationshipId, appointment.appointmentId);
      expect(detail.contactPhones.assignedOsmPhone).toBe("0899999999");
      expect(JSON.stringify(detail)).not.toContain("021234567");
    }
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipId, appointment.appointmentId)).contactPhones.assignedOsmPhone).toBe("0899999999");
    expect((await getAppointmentDetail(f.osm, f.relationshipId, appointment.appointmentId)).contactPhones.assignedOsmPhone).toBeNull();
    const delegated = await getDelegatedAppointment(caregiver, grantId, appointment.appointmentId, familyDeps);
    expect(delegated.contactPhones.assignedOsmPhone).toBeNull();
    expect(JSON.stringify(delegated)).not.toContain("0899999999");
    expect(JSON.stringify(delegated)).not.toContain("021234567");
    expect(await getPatientSelfAssignedOsmPhone(f.patient, f.relationshipId)).toBe("0899999999");
    const other = await account([Role.PATIENT]);
    await expect(getPatientSelfAssignedOsmPhone(other, f.relationshipId)).rejects.toThrow();
    await expect(getOwnPatientAppointmentDetail(other, f.relationshipId, appointment.appointmentId)).rejects.toThrow();
    const next = await osm(f.hospitalId);
    await db.osmHospitalRelationship.updateMany({ where: { hospitalId: f.hospitalId, userId: next.userId }, data: { contactPhone: "0691234567" } });
    await assignOsmToPatient(f.owner, { patientHospitalRelationshipId: f.relationshipId, osmUserId: next.userId });
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipId, appointment.appointmentId)).contactPhones.assignedOsmPhone).toBe("0691234567");
    await db.osmHospitalRelationship.updateMany({ where: { hospitalId: f.hospitalId, userId: next.userId }, data: { status: MembershipStatus.SUSPENDED } });
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipId, appointment.appointmentId)).contactPhones.assignedOsmPhone).toBeNull();
  });

  it("E5: the Patient records and lists own values; the care team reads them labeled; they never reach rounds or the report", async () => {
    const f = await fixture();
    const nonce = randomUUID();
    const input = { submissionNonce: nonce, measuredAt: "2026-10-14T10:00:00+07:00", weight: 77.7, systolicBloodPressure: 131, diastolicBloodPressure: 85, bloodSugar: null, note: null };
    const created = await createOwnPatientSelfMeasurement(f.patient, input, dependencies);
    expect(created.outcome).toBe("CREATED");
    expect((await createOwnPatientSelfMeasurement(f.patient, input, dependencies)).outcome).toBe("REPLAY");
    await expect(createOwnPatientSelfMeasurement(f.patient, { ...input, submissionNonce: randomUUID(), weight: null, systolicBloodPressure: null, diastolicBloodPressure: null }, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createOwnPatientSelfMeasurement(f.patient, { ...input, submissionNonce: randomUUID(), measuredAt: "2026-10-15T10:00:00+07:00" }, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createOwnPatientSelfMeasurement(f.owner, { ...input, submissionNonce: randomUUID() }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);

    expect((await listOwnPatientSelfMeasurements(f.patient, {}, dependencies)).items).toEqual([expect.objectContaining({ measurementId: created.item.measurementId, weight: 77.7, canDelete: true })]);
    expect((await listPatientSelfMeasurementsForCareTeam(f.osm, f.relationshipId, {}, dependencies)).items).toEqual([expect.objectContaining({ weight: 77.7 })]);
    expect((await listPatientSelfMeasurementsForCareTeam(f.member, f.relationshipId, {}, dependencies)).items).toHaveLength(1);
    const otherHospital = await fixture();
    await expect(listPatientSelfMeasurementsForCareTeam(otherHospital.owner, f.relationshipId, {}, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listPatientSelfMeasurementsForCareTeam(f.patient, f.relationshipId, {}, dependencies)).rejects.toBeInstanceOf(ForbiddenError);

    await openPatientProgram(f.owner, { patientHospitalRelationshipId: f.relationshipId }, dependencies);
    expect(await db.patientProgramRoundVitals.count({ where: { patientProgram: { patientHospitalRelationshipId: f.relationshipId } } })).toBe(0);
    expect(await db.patientFollowup.count({ where: { patientHospitalRelationshipId: f.relationshipId } })).toBe(0);
    expect(JSON.stringify(await getHospitalReportingDatasetForExport(f.owner, { hospitalId: f.hospitalId }, { database: db }))).not.toContain("77.7");

    const later = { database: db, now: () => new Date(now.getTime() + 25 * 3_600_000) };
    await expect(deleteOwnPatientSelfMeasurement(f.patient, created.item.measurementId, later)).rejects.toBeInstanceOf(ConflictError);
    await deleteOwnPatientSelfMeasurement(f.patient, created.item.measurementId, { database: db, now: () => new Date(now.getTime() + 3_600_000) });
    expect((await listPatientSelfMeasurementsForCareTeam(f.osm, f.relationshipId, {}, dependencies)).items).toEqual([]);
    expect(await db.patientSelfMeasurement.findUniqueOrThrow({ where: { id: created.item.measurementId } })).toMatchObject({ deletedByUserId: f.patient.userId });
    expect(await db.auditEvent.count({ where: { resourceId: created.item.measurementId, action: { in: ["patient_self_measurement.created", "patient_self_measurement.deleted"] } } })).toBe(2);
  });

  it("E5: replays a committed measurement after its response is lost without creating a duplicate", async () => {
    const f = await fixture();
    const nonce = randomUUID();
    const input = {
      submissionNonce: nonce,
      measuredAt: now.toISOString(),
      weight: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: 110,
      bloodSugarUnit: "mg/dL",
      note: null,
    };
    let loseResponse = true;

    async function submit(): Promise<Awaited<ReturnType<typeof createOwnPatientSelfMeasurement>>> {
      const result = await createOwnPatientSelfMeasurement(f.patient, input, dependencies);
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Simulated lost response");
      }
      return result;
    }

    await expect(submit()).rejects.toThrow("Simulated lost response");
    const profile = await db.patientProfile.findUniqueOrThrow({
      where: { personId: f.patient.personId },
      select: { id: true },
    });
    const measurementWhere = { patientProfileId: profile.id, submissionNonce: nonce };
    expect(await db.patientSelfMeasurement.count({ where: measurementWhere })).toBe(1);

    const replay = await submit();
    expect(replay.outcome).toBe("REPLAY");
    expect(replay.item.bloodSugar).toBe(110);
    expect(await db.patientSelfMeasurement.count({ where: measurementWhere })).toBe(1);
    expect(await db.auditEvent.count({
      where: { action: "patient_self_measurement.created", resourceId: replay.item.measurementId },
    })).toBe(1);
  });

  it("E5: requires mg/dL as the blood sugar input unit", async () => {
    const f = await fixture();
    const input = {
      submissionNonce: randomUUID(),
      measuredAt: now.toISOString(),
      weight: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: 95,
      note: null,
    };

    await expect(createOwnPatientSelfMeasurement(f.patient, input, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createOwnPatientSelfMeasurement(f.patient, { ...input, bloodSugarUnit: "mmol/L" }, dependencies))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createOwnPatientSelfMeasurement(f.patient, { ...input, bloodSugarUnit: "mg/dL" }, dependencies))
      .resolves.toMatchObject({ outcome: "CREATED", item: { bloodSugar: 95 } });
  });

  it("E5: loads older self-measurement history for the Patient and care team with cursors", async () => {
    const f = await fixture();
    const profile = await db.patientProfile.findUniqueOrThrow({
      where: { personId: f.patient.personId },
      select: { id: true },
    });
    const count = PATIENT_SELF_MEASUREMENT_OWN_PAGE_SIZE + 2;
    await db.patientSelfMeasurement.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        patientProfileId: profile.id,
        submissionNonce: randomUUID(),
        measuredAt: new Date(now.getTime() - index * 60_000),
        weight: 50 + index,
        createdAt: now,
      })),
    });

    const ownFirst = await listOwnPatientSelfMeasurements(f.patient, {}, dependencies);
    expect(ownFirst.items).toHaveLength(PATIENT_SELF_MEASUREMENT_OWN_PAGE_SIZE);
    expect(ownFirst.nextCursor).toBeTruthy();
    if (!ownFirst.nextCursor) throw new Error("Expected an older Patient history page");
    const ownOlder = await listOwnPatientSelfMeasurements(f.patient, { cursor: ownFirst.nextCursor }, dependencies);
    expect(ownOlder.items).toHaveLength(2);
    expect(ownOlder.nextCursor).toBeNull();
    const ownIds = [...ownFirst.items, ...ownOlder.items].map(({ measurementId }) => measurementId);
    expect(new Set(ownIds).size).toBe(count);

    const teamIds: string[] = [];
    let cursor: string | undefined;
    let nextCursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
      const page = await listPatientSelfMeasurementsForCareTeam(
        f.osm,
        f.relationshipId,
        cursor ? { cursor } : {},
        dependencies,
      );
      expect(page.items.length).toBeLessThanOrEqual(PATIENT_SELF_MEASUREMENT_CARE_TEAM_PAGE_SIZE);
      teamIds.push(...page.items.map(({ measurementId }) => measurementId));
      nextCursor = page.nextCursor;
      if (pageNumber < 2) {
        expect(nextCursor).toBeTruthy();
        if (!nextCursor) throw new Error("Expected another care team history page");
        cursor = nextCursor;
      }
    }
    expect(teamIds).toHaveLength(count);
    expect(new Set(teamIds).size).toBe(count);
    expect(nextCursor).toBeNull();
  });

  it("E6: one message per eligible recipient per event, even under concurrent drains", async () => {
    const f = await fixture();
    const { caregiver } = await caregiverWithGrant(f);
    const lineIds = new Set([await bindLine(f.patient), await bindLine(f.osm), await bindLine(caregiver)]);
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);

    const rows = await db.appointmentLineNotification.findMany({ where: { appointmentId: appointment.appointmentId } });
    expect(rows.map((row) => [row.recipientKind, row.state]).sort()).toEqual([["CAREGIVER", "PENDING"], ["OSM", "PENDING"], ["PATIENT", "PENDING"]]);

    const pushed: string[] = [];
    const drainDeps = { database: db, now: () => now, logSummary: () => undefined,
      push: async (lineUserId: string, text: string) => { pushed.push(lineUserId); expect(text).not.toMatch(/FOLLOW_UP|ความดัน|น้ำตาล|\d{2}:\d{2}/u); return { kind: "ACCEPTED" as const }; } };
    await Promise.all([drainAppointmentLineNotificationOutbox(drainDeps), drainAppointmentLineNotificationOutbox(drainDeps)]);
    await drainAppointmentLineNotificationOutbox(drainDeps);
    expect(pushed.sort()).toEqual([...lineIds].sort());
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: appointment.appointmentId, state: "PROVIDER_ACCEPTED" } })).toBe(3);
  });

  it("E6: delivers once when the OSM assignment ends but the same User's caregiver grant remains active", async () => {
    const f = await fixture();
    const { grantId } = await caregiverWithGrant(f, f.osm);
    const patientLine = await bindLine(f.patient);
    const sharedLine = await bindLine(f.osm);
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);

    const sharedRecipientRows = await db.appointmentLineNotification.findMany({
      where: { appointmentId: appointment.appointmentId, recipientUserId: f.osm.userId },
      select: { recipientKind: true, recipientGrantId: true, state: true },
    });
    expect(sharedRecipientRows).toEqual([{ recipientKind: "OSM", recipientGrantId: null, state: "PENDING" }]);

    await db.patientOsmAssignment.updateMany({
      where: { patientHospitalRelationshipId: f.relationshipId, endedAt: null },
      data: { endedAt: now, endedByUserId: f.owner.userId },
    });
    expect(await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId }, select: { status: true, revokedAt: true } }))
      .toEqual({ status: "ACTIVE", revokedAt: null });

    const pushed: string[] = [];
    await drainAppointmentLineNotificationOutbox({
      database: db,
      now: () => now,
      logSummary: () => undefined,
      push: async (lineUserId: string) => { pushed.push(lineUserId); return { kind: "ACCEPTED" as const }; },
    });

    expect(pushed.sort()).toEqual([patientLine, sharedLine].sort());
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: appointment.appointmentId, recipientUserId: f.osm.userId } })).toBe(1);
    expect(await db.appointmentLineNotification.findFirstOrThrow({
      where: { appointmentId: appointment.appointmentId, recipientUserId: f.osm.userId },
      select: { state: true, safeOutcome: true },
    })).toEqual({ state: "PROVIDER_ACCEPTED", safeOutcome: "ACCEPTED" });
  });

  it("E6: an unassigned OSM, a revoked grant and an opted-out user get nothing", async () => {
    const f = await fixture();
    const { caregiver, grantId } = await caregiverWithGrant(f);
    const optedOut = await caregiverWithGrant(f);
    const patientLine = await bindLine(f.patient);
    await bindLine(f.osm);
    await bindLine(caregiver);
    await bindLine(optedOut.caregiver, false);
    const appointment = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    expect(await db.appointmentLineNotification.findFirstOrThrow({ where: { appointmentId: appointment.appointmentId, recipientUserId: optedOut.caregiver.userId } }))
      .toMatchObject({ state: "SUPPRESSED", safeOutcome: "OPT_IN_REQUIRED_AT_SOURCE" });

    // After the event: the OSM assignment ends and the caregiver grant is revoked before any send.
    await db.patientOsmAssignment.updateMany({ where: { patientHospitalRelationshipId: f.relationshipId, endedAt: null }, data: { endedAt: now, endedByUserId: f.owner.userId } });
    await revokeAppointmentGrant(f.patient, grantId, familyDeps);

    const pushed: string[] = [];
    await drainAppointmentLineNotificationOutbox({ database: db, now: () => now, logSummary: () => undefined,
      push: async (lineUserId: string) => { pushed.push(lineUserId); return { kind: "ACCEPTED" as const }; } });
    expect(pushed).toEqual([patientLine]);
    const suppressed = await db.appointmentLineNotification.findMany({ where: { appointmentId: appointment.appointmentId, safeOutcome: "AUTHORITY_CHANGED" }, select: { recipientKind: true } });
    expect(suppressed.map(({ recipientKind }) => recipientKind).sort()).toEqual(["CAREGIVER", "OSM"]);

    // The next event is resolved at its own source time: no assigned OSM, and only the remaining grant holder.
    const next = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    expect((await db.appointmentLineNotification.findMany({ where: { appointmentId: next.appointmentId } })).map(({ recipientKind }) => recipientKind).sort()).toEqual(["CAREGIVER", "PATIENT"]);
  });
});
