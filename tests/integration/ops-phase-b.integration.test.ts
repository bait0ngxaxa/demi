import { createHash, randomUUID } from "node:crypto";
import { LineReachability, HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { getPatientHealthHistory, getPatientHealthInformation, updatePatientHealthHistory } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { updateStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { createAppointment, rescheduleAppointment, cancelAppointment, completeAppointment, submitAppointmentRescheduleRequest, rejectAppointmentRescheduleRequest } from "@/modules/appointments/services/appointment-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { currentBuddhistYear } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getOwnPatientAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";
import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { getAppointmentDetail } from "@/modules/appointments/services/appointment-query-service";
import { provisionOsm, releaseWorkforceRelationship, restoreOsmRelationship, restoreHospitalMembership } from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const db = getPrisma();
const now = new Date("2026-10-14T05:00:00Z");
const dependencies = { database: db, now: () => now };
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];

async function actor(role: Role, hospitalId: string, membershipType: MembershipType = MembershipType.MEMBER): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "Phase B" } });
  people.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: { role } } } });
  users.push(user.id);
  if (role === Role.HOSPITAL) await db.hospitalMembership.create({ data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  if (role === Role.OSM) await db.osmHospitalRelationship.create({ data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE } });
  return { userId: user.id, personId: person.id, roles: [role], hospitalMemberships: role === Role.HOSPITAL ? [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] : [],
    osmHospitalRelationships: role === Role.OSM ? [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] : [] };
}

async function fixture(): Promise<{ owner: ActorContext; staff: ActorContext; osm: ActorContext; patient: ActorContext; relationshipId: string; hospitalId: string }> {
  const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 32), name: "โรงพยาบาล Phase B", status: HospitalStatus.ACTIVE } });
  hospitals.push(hospital.id);
  const owner = await actor(Role.HOSPITAL, hospital.id, MembershipType.OWNER);
  const staff = await actor(Role.HOSPITAL, hospital.id);
  const osm = await actor(Role.OSM, hospital.id);
  const provisioned = await provisionPatient(owner, { identity: { namespace: "phase-b", value: randomUUID() }, targetHospitalId: hospital.id, givenName: "ผู้ป่วย", familyName: "ทดสอบ" });
  users.push(provisioned.userId); people.push(provisioned.personId);
  await db.user.update({ where: { id: provisioned.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });
  const patient: ActorContext = { userId: provisioned.userId, personId: provisioned.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
  await assignOsmToPatient(owner, { patientHospitalRelationshipId: provisioned.relationshipId, osmUserId: osm.userId });
  return { owner, staff, osm, patient, relationshipId: provisioned.relationshipId, hospitalId: hospital.id };
}

function appointmentInput(relationshipId: string, home = false): Record<string, unknown> {
  return { patientHospitalRelationshipId: relationshipId, submissionNonce: randomUUID(), scheduledAt: "2026-10-20T10:00:00+07:00", type: "FOLLOW_UP", responsibleUserId: null, locationType: home ? "HOME_VISIT" : "CLINIC", durationMinutes: 30 };
}

async function cleanup(): Promise<void> {
  const relationshipWhere = { hospitalId: { in: hospitals } };
  const appointmentWhere = { patientHospitalRelationship: relationshipWhere };
  await db.patientAppointmentRescheduleRequest.deleteMany({ where: { appointment: appointmentWhere } });
  await db.appointmentLineNotification.deleteMany({ where: { patientHospitalRelationshipId: { in: (await db.patientHospitalRelationship.findMany({ where: relationshipWhere, select: { id: true } })).map((row) => row.id) } } });
  await db.patientAppointmentAssigneeAcceptance.deleteMany({ where: { appointment: appointmentWhere } });
  await db.patientAppointment.deleteMany({ where: appointmentWhere });
  await db.lineAppointmentNotificationPreference.deleteMany({ where: { userId: { in: users } } });
  await db.lineAccountBinding.deleteMany({ where: { userId: { in: users } } });
  await db.patientProgram.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientHospitalProfile.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientHospitalRelationship.deleteMany({ where: relationshipWhere });
  await db.patientProfile.deleteMany({ where: { personId: { in: people } } });
  await db.workforceActivation.deleteMany({ where: { userId: { in: users } } });
  await db.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0; users.length = 0; people.length = 0;
}

describe("Phase B hospital operations", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("staff saves hospital history; SELF reads; stale versions and cross-hospital edits fail", async () => {
    const f = await fixture();
    const input = { expectedVersion: 0, diabetes: "YES", hypertension: "NO", otherConditions: "โรคอื่น", familyDiabetes: "UNKNOWN", familyHypertension: "YES", familyHeartDisease: "NO", familyStroke: "UNKNOWN", diagnosisYear: 2560 };
    await updatePatientHealthHistory(f.staff, f.relationshipId, input, db);
    expect(await getPatientHealthHistory(f.patient, f.relationshipId, db)).toMatchObject({ diabetes: "YES", diagnosisYear: 2560, version: 1 });
    await expect(updatePatientHealthHistory(f.staff, f.relationshipId, input, db)).rejects.toBeInstanceOf(ConflictError);
    await expect(updatePatientHealthHistory(f.patient, f.relationshipId, { ...input, expectedVersion: 1 }, db)).rejects.toBeInstanceOf(ForbiddenError);
    await updateStaffPatientHospitalProfile(f.owner, f.relationshipId, { expectedVersion: 0, phoneNumber: "0812345678", province: "กรุงเทพมหานคร" }, db);
    await expect(updateStaffPatientHospitalProfile(f.staff, f.relationshipId, { expectedVersion: 0, phoneNumber: "0890000000" }, db)).rejects.toBeInstanceOf(ConflictError);
    await expect(updateStaffPatientHospitalProfile(f.owner, f.relationshipId, { expectedVersion: 1, givenName: "ชื่อใหม่" }, db)).rejects.toBeInstanceOf(ValidationError);
    const other = await fixture();
    await expect(updateStaffPatientHospitalProfile(other.owner, f.relationshipId, { expectedVersion: 1, occupation: "ทดสอบ" }, db)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updatePatientHealthHistory(other.staff, f.relationshipId, input, db)).rejects.toBeInstanceOf(ForbiddenError);
    // D10: the birth date for the age display is read under the same authority as the health history.
    expect(await getPatientHealthInformation(f.patient, f.relationshipId, db)).toMatchObject({ history: { diabetes: "YES" } });
    await expect(getPatientHealthInformation(other.staff, f.relationshipId, db)).rejects.toSatisfy(
      (error) => error instanceof ForbiddenError || error instanceof NotFoundError,
    );
    expect(await db.auditEvent.count({ where: { action: "patient.health_history.updated" } })).toBeGreaterThan(0);
    await openPatientProgram(f.owner, { patientHospitalRelationshipId: f.relationshipId }, dependencies);
    const report = await getHospitalReportingDatasetForExport(f.owner, { hospitalId: f.hospitalId }, { database: db });
    expect(report.programs[0]?.illnessDuration).toEqual({ state: "RECORDED", value: currentBuddhistYear() - 2560 });
  });

  it("reschedule request rejects duplicates; approval closes with edit and emits the change notification", async () => {
    const f = await fixture();
    const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
    await db.lineAccountBinding.create({ data: { userId: f.patient.userId, lineUserId,
      lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"), lineSubjectFingerprintKeyId: "synthetic-phase-b",
      reachability: LineReachability.FRIEND, reachabilityObservedAt: now } });
    await setOwnAppointmentLineNotificationPreference(f.patient, true, { database: db });
    const a = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    const requestInput = { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), submissionNonce: randomUUID(), preferredDatetimes: ["2026-10-21T10:00:00+07:00"], reason: "ติดธุระ" };
    const request = await submitAppointmentRescheduleRequest(f.patient, requestInput, dependencies);
    expect((await submitAppointmentRescheduleRequest(f.patient, requestInput, dependencies)).requestId).toBe(request.requestId);
    await expect(submitAppointmentRescheduleRequest(f.osm, { ...requestInput, submissionNonce: randomUUID() }, dependencies)).rejects.toBeInstanceOf(ConflictError);
    const fields = appointmentInput(f.relationshipId);
    delete fields.submissionNonce;
    const edit = { ...fields, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), rescheduleRequestId: request.requestId, scheduledAt: requestInput.preferredDatetimes[0] };
    await rescheduleAppointment(f.staff, edit, { ...dependencies, appointmentLineNotificationRollout: { enabled: true, generation: randomUUID() } });
    expect(await db.patientAppointmentRescheduleRequest.findUnique({ where: { id: request.requestId } })).toMatchObject({ status: "APPROVED", resolvedByUserId: f.staff.userId });
    expect(await db.appointmentLineNotification.count({ where: { appointmentId: a.appointmentId, eventKind: "RESCHEDULED", state: "PENDING" } })).toBe(1);
  });

  it("OSM requests only for assigned patients; staff rejects with a reason; preferred dates are bounded", async () => {
    const f = await fixture();
    const a = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    const input = { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), submissionNonce: randomUUID(), preferredDatetimes: ["2026-10-22T09:00:00+07:00"], reason: "ผู้ป่วยไม่สะดวก" };
    const other = await actor(Role.OSM, f.hospitalId);
    await expect(submitAppointmentRescheduleRequest(other, input, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(submitAppointmentRescheduleRequest(f.osm, { ...input, preferredDatetimes: ["2026-10-13T09:00:00+07:00"] }, dependencies)).rejects.toBeInstanceOf(ValidationError);
    await expect(submitAppointmentRescheduleRequest(f.osm, { ...input, preferredDatetimes: ["2028-10-13T09:00:00+07:00"] }, dependencies)).rejects.toBeInstanceOf(ValidationError);
    const r = await submitAppointmentRescheduleRequest(f.osm, input, dependencies);
    await expect(rejectAppointmentRescheduleRequest(f.osm, { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, requestId: r.requestId, rejectionReason: "ไม่ได้" }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await rejectAppointmentRescheduleRequest(f.staff, { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, requestId: r.requestId, rejectionReason: "เวลาที่ขอเต็มแล้ว" }, dependencies);
    expect(await db.patientAppointmentRescheduleRequest.findUnique({ where: { id: r.requestId } })).toMatchObject({ status: "REJECTED", rejectionReason: "เวลาที่ขอเต็มแล้ว" });
  });

  // Describes current WB-DF-06 behavior only; whether the time must match a preferred option is open as WB-PD-11.
  it("approval is the staff schedule change itself: any changed time approves, no change or a foreign request never approves", async () => {
    const f = await fixture();
    const a = await createAppointment(f.osm, appointmentInput(f.relationshipId, true), dependencies);
    const preferredDatetimes = ["2026-10-21T10:00:00+07:00", "2026-10-22T09:00:00+07:00"];
    const request = await submitAppointmentRescheduleRequest(f.osm, { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), submissionNonce: randomUUID(), preferredDatetimes, reason: "ผู้ป่วยไม่สะดวก" }, dependencies);
    const b = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    const foreign = await submitAppointmentRescheduleRequest(f.patient, { patientHospitalRelationshipId: f.relationshipId, appointmentId: b.appointmentId, expectedUpdatedAt: b.updatedAt.toISOString(), submissionNonce: randomUUID(), preferredDatetimes, reason: "ติดธุระ" }, dependencies);
    const fields = appointmentInput(f.relationshipId, true); delete fields.submissionNonce;
    const approval = { ...fields, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), rescheduleRequestId: request.requestId };
    const alternative = "2026-10-23T14:00:00+07:00";
    const unchanged = async (): Promise<void> => {
      expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: a.appointmentId } })).updatedAt).toEqual(a.updatedAt);
      expect((await db.patientAppointmentRescheduleRequest.findUniqueOrThrow({ where: { id: request.requestId } })).status).toBe("PENDING");
    };
    // The OSM may edit its own home visit, but never decides a request on the Hospital's behalf.
    await expect(rescheduleAppointment(f.osm, { ...approval, scheduledAt: alternative }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await unchanged();
    await expect(rescheduleAppointment(f.staff, approval, dependencies)).rejects.toBeInstanceOf(ConflictError);
    await unchanged();
    await expect(rescheduleAppointment(f.staff, { ...approval, scheduledAt: alternative, rescheduleRequestId: foreign.requestId }, dependencies)).rejects.toBeInstanceOf(ConflictError);
    await unchanged();

    await rescheduleAppointment(f.staff, { ...approval, scheduledAt: alternative }, dependencies);
    expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: a.appointmentId } })).scheduledAt).toEqual(new Date(alternative));
    expect(await db.patientAppointmentRescheduleRequest.findUniqueOrThrow({ where: { id: request.requestId } })).toMatchObject({
      status: "APPROVED", resolvedByUserId: f.staff.userId, preferredDatetimes: preferredDatetimes.map((value) => new Date(value)),
    });
    expect(await db.auditEvent.count({ where: { action: "appointment.reschedule_request.approved", resourceId: request.requestId, actorUserId: f.staff.userId } })).toBe(1);
    expect((await db.patientAppointmentRescheduleRequest.findUniqueOrThrow({ where: { id: foreign.requestId } })).status).toBe("PENDING");
  });

  it("OSM owns only assigned home visits; clinic, other creators and terminal clinical actions are denied", async () => {
    const f = await fixture();
    await expect(createAppointment(f.osm, appointmentInput(f.relationshipId), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const other = await actor(Role.OSM, f.hospitalId);
    await expect(createAppointment(other, appointmentInput(f.relationshipId, true), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const a = await createAppointment(f.osm, appointmentInput(f.relationshipId, true), dependencies);
    expect(await db.patientAppointment.findUnique({ where: { id: a.appointmentId } })).toMatchObject({ createdByUserId: f.osm.userId, responsibleUserId: null, osmAssignmentIdAtCreation: expect.any(String) });
    const transition = { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString() };
    await expect(completeAppointment(f.osm, transition, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const clinicianVisit = await createAppointment(f.staff, appointmentInput(f.relationshipId, true), dependencies);
    await expect(cancelAppointment(f.osm, { ...transition, appointmentId: clinicianVisit.appointmentId, expectedUpdatedAt: clinicianVisit.updatedAt.toISOString() }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const fields = appointmentInput(f.relationshipId, true);
    delete fields.submissionNonce;
    await expect(rescheduleAppointment(f.osm, { ...fields, ...transition, locationType: "CLINIC" }, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const edited = await rescheduleAppointment(f.osm, { ...fields, ...transition, scheduledAt: "2026-10-21T10:00:00+07:00" }, dependencies);
    await cancelAppointment(f.osm, { ...transition, expectedUpdatedAt: edited.updatedAt.toISOString() }, dependencies);
    expect((await getAppointmentDetail(f.owner, f.relationshipId, a.appointmentId)).status).toBe("CANCELLED");
  });

  it("release ends assignments and tokens, denies stale actor access, retains history and prevents restore", async () => {
    const f = await fixture();
    const a = await createAppointment(f.osm, appointmentInput(f.relationshipId, true), dependencies);
    const rel = await db.osmHospitalRelationship.findFirstOrThrow({ where: { userId: f.osm.userId, hospitalId: f.hospitalId } });
    await db.workforceActivation.create({ data: { userId: f.osm.userId, hospitalId: f.hospitalId, relationshipId: rel.id, relationshipKind: "OSM", tokenHash: randomUUID(), expiresAt: new Date("2027-01-01"), createdByUserId: f.owner.userId } });
    await releaseWorkforceRelationship(f.owner, { kind: "osm", relationshipId: rel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: rel.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" }, dependencies);
    expect(await db.patientOsmAssignment.count({ where: { osmUserId: f.osm.userId, endedAt: null } })).toBe(0);
    expect(await db.workforceActivation.count({ where: { userId: f.osm.userId, revokedAt: null } })).toBe(0);
    await expect(getAppointmentDetail(f.osm, f.relationshipId, a.appointmentId)).rejects.toBeInstanceOf(ForbiddenError);
    const ended = await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: rel.id } });
    await expect(restoreOsmRelationship(f.owner, { relationshipId: rel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: ended.updatedAt.toISOString() }, dependencies)).rejects.toBeInstanceOf(ConflictError);
    await expect(db.osmHospitalRelationship.update({ where: { id: rel.id }, data: { status: MembershipStatus.ACTIVE } })).rejects.toThrow();
    expect((await getAppointmentDetail(f.owner, f.relationshipId, a.appointmentId)).status).toBe("SCHEDULED");
    const nationalId = "1101700203450";
    await db.person.update({ where: { id: f.osm.personId }, data: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }) } });
    const readded = await provisionOsm(f.owner, { contactPhone: "0812345678", nationalId, givenName: "ทดสอบ", familyName: "Phase B", targetHospitalId: f.hospitalId }, dependencies);
    expect(readded.userId).toBe(f.osm.userId);
    expect(readded.relationshipId).not.toBe(rel.id);
    expect((await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: rel.id } })).status).toBe("ENDED");
    await expect(getAppointmentDetail(f.osm, f.relationshipId, a.appointmentId)).rejects.toBeInstanceOf(ForbiddenError);
    const ownerRel = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.owner.userId, hospitalId: f.hospitalId } });
    await expect(releaseWorkforceRelationship(f.owner, { kind: "staff", relationshipId: ownerRel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: ownerRel.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" }, dependencies)).rejects.toBeInstanceOf(ConflictError);
    const staffRel = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.staff.userId, hospitalId: f.hospitalId } });
    await releaseWorkforceRelationship(f.owner, { kind: "staff", relationshipId: staffRel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: staffRel.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" }, dependencies);
    await expect(getAppointmentDetail(f.staff, f.relationshipId, a.appointmentId)).rejects.toBeInstanceOf(ForbiddenError);
    const endedStaff = await db.hospitalMembership.findUniqueOrThrow({ where: { id: staffRel.id } });
    await expect(restoreHospitalMembership(f.owner, { relationshipId: staffRel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: endedStaff.updatedAt.toISOString() }, dependencies)).rejects.toBeInstanceOf(ConflictError);
  });

  it("dual-role release: STAFF keeps the OSM relationship and its assignments; OSM ends only that hospital's assignments; history is untouched", async () => {
    const f = await fixture();
    const other = await fixture();
    const dual = f.osm.userId;
    await db.userRole.create({ data: { userId: dual, role: Role.HOSPITAL } });
    const staffRel = await db.hospitalMembership.create({ data: { userId: dual, hospitalId: f.hospitalId, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE } });
    const osmRel = await db.osmHospitalRelationship.findFirstOrThrow({ where: { userId: dual, hospitalId: f.hospitalId } });
    const otherOsmRel = await db.osmHospitalRelationship.create({ data: { userId: dual, hospitalId: other.hospitalId, status: MembershipStatus.ACTIVE } });
    await assignOsmToPatient(other.owner, { patientHospitalRelationshipId: other.relationshipId, osmUserId: dual });
    const historicalEndedAt = new Date("2026-01-01T00:00:00Z");
    const historical = await db.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: f.relationshipId, osmUserId: dual, assignedByUserId: f.owner.userId, createdAt: new Date("2025-12-01T00:00:00Z"), endedAt: historicalEndedAt, endedByUserId: f.owner.userId } });
    await db.workforceActivation.create({ data: { userId: dual, hospitalId: f.hospitalId, relationshipId: staffRel.id, relationshipKind: "HOSPITAL_MEMBER", tokenHash: randomUUID(), expiresAt: new Date("2027-01-01"), createdByUserId: f.owner.userId } });
    const active = (hospitalId: string) => db.patientOsmAssignment.count({ where: { osmUserId: dual, endedAt: null, patientHospitalRelationship: { hospitalId } } });

    await releaseWorkforceRelationship(f.owner, { kind: "staff", relationshipId: staffRel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: staffRel.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" }, dependencies);
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: staffRel.id } })).status).toBe(MembershipStatus.ENDED);
    expect((await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: osmRel.id } })).status).toBe(MembershipStatus.ACTIVE);
    expect(await active(f.hospitalId)).toBe(1);
    expect(await active(other.hospitalId)).toBe(1);
    expect(await db.workforceActivation.count({ where: { userId: dual, usedAt: null, revokedAt: null } })).toBe(0);
    const staffAudit = await db.auditEvent.findFirstOrThrow({ where: { action: "workforce.permanently_released", resourceId: staffRel.id } });
    expect(staffAudit.metadata).toMatchObject({ endedAssignmentCount: 0 });

    const currentOsmRel = await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: osmRel.id } });
    await releaseWorkforceRelationship(f.owner, { kind: "osm", relationshipId: osmRel.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: currentOsmRel.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" }, dependencies);
    expect(await active(f.hospitalId)).toBe(0);
    expect(await db.patientOsmAssignment.findFirstOrThrow({ where: { osmUserId: dual, patientHospitalRelationshipId: f.relationshipId, endedAt: now } })).toMatchObject({ endedByUserId: f.owner.userId });
    expect(await active(other.hospitalId)).toBe(1);
    expect((await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: otherOsmRel.id } })).status).toBe(MembershipStatus.ACTIVE);
    expect(await db.patientOsmAssignment.findUniqueOrThrow({ where: { id: historical.id } })).toMatchObject({ endedAt: historicalEndedAt, endedByUserId: f.owner.userId });
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: staffRel.id } })).status).toBe(MembershipStatus.ENDED);
  });
  it("two simultaneous requests create exactly one open record and stale approval rolls back", async () => {
    const f = await fixture();
    const a = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    const input = { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), preferredDatetimes: ["2026-10-21T10:00:00+07:00"], reason: "ทดสอบคำขอพร้อมกัน" };
    const results = await Promise.allSettled([submitAppointmentRescheduleRequest(f.patient, { ...input, submissionNonce: randomUUID() }, dependencies), submitAppointmentRescheduleRequest(f.osm, { ...input, submissionNonce: randomUUID() }, dependencies)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const request = await db.patientAppointmentRescheduleRequest.findFirstOrThrow({ where: { appointmentId: a.appointmentId } });
    const fields = appointmentInput(f.relationshipId); delete fields.submissionNonce;
    await expect(rescheduleAppointment(f.staff, { ...fields, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString(), rescheduleRequestId: request.id }, dependencies)).rejects.toBeInstanceOf(ConflictError);
    expect((await db.patientAppointment.findUniqueOrThrow({ where: { id: a.appointmentId } })).updatedAt).toEqual(a.updatedAt);
    expect((await db.patientAppointmentRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");
    await cancelAppointment(f.owner, { patientHospitalRelationshipId: f.relationshipId, appointmentId: a.appointmentId, expectedUpdatedAt: a.updatedAt.toISOString() }, dependencies);
    expect((await db.patientAppointmentRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("SUPERSEDED");
  });

  it("concurrent owner release cannot remove the final eligible owner", async () => {
    const f = await fixture();
    const second = await actor(Role.HOSPITAL, f.hospitalId, MembershipType.OWNER);
    const firstRel = await db.hospitalMembership.findFirstOrThrow({ where: { userId: f.owner.userId, hospitalId: f.hospitalId } });
    const secondRel = await db.hospitalMembership.findFirstOrThrow({ where: { userId: second.userId, hospitalId: f.hospitalId } });
    const release = (target: typeof firstRel): Record<string, unknown> => ({ kind: "staff", relationshipId: target.id, targetHospitalId: f.hospitalId, expectedUpdatedAt: target.updatedAt.toISOString(), confirmation: "นำออกจากระบบ" });
    await expect(releaseWorkforceRelationship(f.staff, release(secondRel), dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    const results = await Promise.allSettled([releaseWorkforceRelationship(f.owner, release(secondRel), dependencies), releaseWorkforceRelationship(second, release(firstRel), dependencies)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.hospitalMembership.count({ where: { hospitalId: f.hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } })).toBe(1);
  });

  it("keeps SELF historical readback when the hospital is suspended, without enabling requests", async () => {
    const f = await fixture();
    await updatePatientHealthHistory(f.staff, f.relationshipId, { expectedVersion: 0, diabetes: "YES", hypertension: "UNKNOWN", otherConditions: null,
      familyDiabetes: "UNKNOWN", familyHypertension: "UNKNOWN", familyHeartDisease: "UNKNOWN", familyStroke: "UNKNOWN", diagnosisYear: null }, db);
    const a = await createAppointment(f.owner, appointmentInput(f.relationshipId), dependencies);
    await db.hospital.update({ where: { id: f.hospitalId }, data: { status: HospitalStatus.SUSPENDED } });
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipId, a.appointmentId)).appointmentId).toBe(a.appointmentId);
    expect(await getPatientHealthHistory(f.patient, f.relationshipId, db)).toMatchObject({ diabetes: "YES" });
    expect(await getAppointmentRescheduleHistory(f.patient, f.relationshipId, a.appointmentId)).toMatchObject({ canRequest: false, canReview: false });
  });

});
