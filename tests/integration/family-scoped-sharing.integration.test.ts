import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { toMedicationTimeCarrier } from "@/modules/medications/domain/medication-local-time";
import { createCaregiverAccountFromInvitation } from "@/modules/family/services/caregiver-account-claim-service";
import { acceptAppointmentGrant, proposeAppointmentGrant, revokeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import {
  acceptCaregiverInvitation,
  createCaregiverInvitation,
  previewCaregiverInvitation,
  previewPublicCaregiverInvitation,
  revokeCaregiverRelationship,
  updateCaregiverRelationshipLabel,
  withdrawOwnCaregiverRelationship,
} from "@/modules/family/services/caregiver-relationship-service";
import { acceptResourceGrant, proposeResourceGrant, revokeResourceGrant } from "@/modules/family/services/caregiver-resource-grant-service";
import { getDelegatedAppointment, listDelegatedAppointments } from "@/modules/family/services/delegated-appointment-query-service";
import { getFamilyHealthSummary } from "@/modules/family/services/family-health-summary-query-service";
import { clearProgramRoundCompletions, openProgramRound } from "./support/program-rounds";

const db = getPrisma();
const now = new Date("2026-10-23T03:00:00.000Z");
const days = (value: number): Date => new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
const caregiverNationalId = "1000000000009";
const relativeNationalId = "1101700203450";
const deps = { database: db, now: () => now, rateLimiter: { consume: async () => true } };
let sequence = 0;

async function account(roles: Role[], nationalId?: string, name = "ทดสอบ"): Promise<ActorContext> {
  sequence += 1;
  const person = await db.person.create({ data: {
    identityKeyHash: nationalId ? hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }) : randomUUID(),
    givenName: name, familyName: `ครอบครัว${sequence}`,
  } });
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function patientFixture() {
  const patient = await account([Role.PATIENT], undefined, "แม่");
  const profile = await db.patientProfile.create({ data: { personId: patient.personId, dateOfBirth: new Date("1960-10-23T00:00:00.000Z"), phoneNumber: "0899999999" } });
  const hospital = async (name: string, phone: string) => (await db.hospital.create({ data: {
    hospitalCode: randomUUID().slice(0, 30), name, status: "ACTIVE", contact: { create: { phoneNumber: phone } },
  } })).id;
  const hospitalA = await hospital("รพ.สต. บ้านทดสอบ", "021111111");
  const hospitalB = await hospital("โรงพยาบาลทดสอบ", "022222222");
  const relationshipA = (await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospitalA } })).id;
  const relationshipB = (await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospitalB } })).id;
  return { patient, profileId: profile.id, hospitalA, relationshipA, relationshipB };
}

type Fixture = Awaited<ReturnType<typeof patientFixture>>;

async function addCareData(f: Fixture) {
  const osm = await account([Role.OSM], undefined, "อสม. สมศรี");
  const assignment = await db.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: f.relationshipA, osmUserId: osm.userId, assignedByUserId: f.patient.userId } });
  const doctor = await account([Role.HOSPITAL], undefined, "หมอ");
  await db.hospitalMembership.create({ data: { userId: doctor.userId, hospitalId: f.hospitalA, membershipType: "MEMBER", profession: "DOCTOR", status: "ACTIVE" } });
  const appointment = (scheduledAt: Date, status: "SCHEDULED" | "COMPLETED" = "SCHEDULED") => db.patientAppointment.create({ data: {
    patientHospitalRelationshipId: f.relationshipA, createdByUserId: doctor.userId, responsibleUserId: doctor.userId, osmAssignmentIdAtCreation: assignment.id,
    type: "FOLLOW_UP", scheduledAt, status, submissionNonce: randomUUID(), locationType: "HOME_VISIT", locationDetail: "บ้านเลขที่ 9", note: "บันทึกภายใน",
  } });
  const upcoming = await appointment(days(3));
  const past = await appointment(days(-10), "COMPLETED");
  await db.patientGoalPlan.create({ data: {
    patientHospitalRelationshipId: f.relationshipA, createdByUserId: doctor.userId, submissionNonce: randomUUID(), templateKey: "demi-goals",
    templateVersion: "booklet-v1", roundNumber: 1, primaryGoalCode: "healthy-plan", goalWeightLossKg: 3, weeklyNote: "บันทึกของเจ้าหน้าที่",
  } });
  await db.personalMedication.create({ data: { patientProfileId: f.profileId, medicationName: "เมทฟอร์มิน", instructionText: "หลังอาหาร",
    schedules: { create: [{ localTime: toMedicationTimeCarrier("20:00") }, { localTime: toMedicationTimeCarrier("08:00") }] } } });
  await db.personalMedication.create({ data: { patientProfileId: f.profileId, medicationName: "ยาที่หยุดแล้ว", status: "STOPPED", stoppedAt: days(-1) } });
  return { upcoming: upcoming.id, past: past.id, doctor };
}

async function oneStepAdd(f: Fixture, input: Record<string, unknown>) {
  const caregiver = await account([Role.CAREGIVER], caregiverNationalId, "ลูก");
  const invitation = await createCaregiverInvitation(f.patient, { nationalId: caregiverNationalId, ...input }, deps);
  return { caregiver, invitation };
}

async function clear(): Promise<void> {
  await clearProgramRoundCompletions();
  await db.patientProgramRoundVitals.deleteMany();
  await db.patientProgramServiceOneConfidence.deleteMany();
  await db.auditEvent.deleteMany();
  await db.appointmentLineNotification.deleteMany();
  await db.caregiverResourceGrant.deleteMany();
  await db.caregiverAppointmentGrant.deleteMany();
  await db.patientAppointment.deleteMany();
  await db.patientGoalPlan.deleteMany();
  await db.patientProgram.deleteMany();
  await db.medicationSchedule.deleteMany();
  await db.personalMedication.deleteMany();
  await db.patientOsmAssignment.deleteMany();
  await db.caregiverRelationship.deleteMany();
  await db.caregiverInvitation.deleteMany();
  await db.patientHospitalRelationship.deleteMany();
  await db.patientProfile.deleteMany();
  await db.hospitalMembership.deleteMany();
  await db.userRole.deleteMany();
  await db.$transaction([
    db.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    db.hospitalServiceArea.deleteMany(),
  ]);
  await db.hospitalServiceAreaEligibility.deleteMany();
  await db.user.deleteMany();
  await db.hospitalContact.deleteMany();
  await db.hospital.deleteMany();
  await db.person.deleteMany();
}

describe("AF-5 one-step caregiver add with scoped sharing (PostgreSQL)", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(clear);
  afterAll(async () => { await db.$disconnect(); });

  it("PP-2: reads progress only with an active HEALTH_PLAN grant, hides private data and checks the relationship again", async () => {
    const f = await patientFixture();
    const { doctor } = await addCareData(f);
    const program = await db.patientProgram.create({ data: { patientHospitalRelationshipId: f.relationshipA, createdByUserId: doctor.userId } });
    await openProgramRound(program.id, 1);
    await db.patientProgramServiceOneConfidence.create({ data: { patientProgramId: program.id, roundNumber: 1, recordedByUserId: f.patient.userId, score: 8, improvementPlan: "ข้อความส่วนตัว" } });
    await db.patientProgramRoundVitals.create({ data: { patientProgramId: program.id, patientHospitalRelationshipId: f.relationshipA, roundNumber: 1, recordedByUserId: doctor.userId, submissionNonce: randomUUID(), serviceDate: now, weight: 70 } });
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "CHILD" });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);

    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan).toBeNull();
    const pending = await proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "HEALTH_PLAN" }, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan).toBeNull();
    await acceptResourceGrant(caregiver, pending.grantId, deps);

    const summary = await getFamilyHealthSummary(caregiver, relationshipId, deps);
    const services = summary.healthPlan?.serviceProgress;
    expect(services).toHaveLength(2);
    const service = services?.find(({ relationshipId: id }) => id === f.relationshipA);
    // Existing round facts derive HEALTH_PATH from the vitals row, even while VITALS remains partial.
    expect(service?.currentRound).toMatchObject({ number: 1, doneItems: 2 });
    expect(service?.currentRound?.done).toContainEqual(expect.objectContaining({ byPatient: true }));
    expect(service?.currentRound?.staffWillDo.some(({ label }) => label.includes("สัญญาณชีพ"))).toBe(true);
    expect(service).not.toHaveProperty("nextAppointment");
    expect(service).not.toHaveProperty("recordingRound");
    expect(JSON.stringify(services)).not.toMatch(/หมอ|ทดสอบครอบครัว|ข้อความส่วนตัว|บันทึกของเจ้าหน้าที่|recordedBy|doneNote|score/u);

    // Appointment access is a separate, exact-Hospital grant; HEALTH_PLAN alone never reveals a date.
    const appointment = await proposeAppointmentGrant(f.patient, { caregiverRelationshipId: relationshipId, patientHospitalRelationshipId: f.relationshipA }, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan?.serviceProgress.every((row) => row.nextAppointment === undefined)).toBe(true);
    await acceptAppointmentGrant(caregiver, appointment.grantId, deps);
    const withAppointment = (await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan?.serviceProgress;
    expect(withAppointment?.find(({ relationshipId: id }) => id === f.relationshipA)?.nextAppointment).toEqual({ scheduledAt: days(3) });
    expect(withAppointment?.find(({ relationshipId: id }) => id === f.relationshipB)).not.toHaveProperty("nextAppointment");
    await revokeAppointmentGrant(f.patient, appointment.grantId, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan?.serviceProgress.every((row) => row.nextAppointment === undefined)).toBe(true);

    await revokeResourceGrant(f.patient, pending.grantId, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan).toBeNull();
    const renewed = await proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "HEALTH_PLAN" }, deps);
    await acceptResourceGrant(caregiver, renewed.grantId, deps);
    await revokeCaregiverRelationship(f.patient, relationshipId, deps);
    await expect(getFamilyHealthSummary(caregiver, relationshipId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates the labeled relationship and exactly the chosen grants in one acceptance", async () => {
    const f = await patientFixture();
    const { caregiver, invitation } = await oneStepAdd(f, {
      relationshipLabel: "CHILD", appointmentRelationshipIds: [f.relationshipA], resources: ["PROFILE_SUMMARY", "MEDICATION"],
    });
    // The invitee sees what they will accept; the token-only preview does not name the Hospital.
    expect((await previewCaregiverInvitation(caregiver, invitation.plaintextToken, deps)).requestedSharing).toEqual({
      relationshipLabel: "บุตร", appointmentHospitalCount: 1, appointmentHospitalNames: ["รพ.สต. บ้านทดสอบ"], resources: ["PROFILE_SUMMARY", "MEDICATION"],
    });
    expect((await previewPublicCaregiverInvitation(invitation.plaintextToken, deps)).requestedSharing.appointmentHospitalNames).toBeNull();

    const accepted = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);

    expect(await db.caregiverRelationship.findUniqueOrThrow({ where: { id: accepted.relationshipId }, select: { relationshipLabel: true, status: true } }))
      .toEqual({ relationshipLabel: "CHILD", status: "ACTIVE" });
    expect(await db.caregiverAppointmentGrant.findMany({ select: { patientHospitalRelationshipId: true, contractVersion: true, status: true, proposedByUserId: true, acceptedByUserId: true } }))
      .toEqual([{ patientHospitalRelationshipId: f.relationshipA, contractVersion: "family-appointment-read-v2", status: "ACTIVE", proposedByUserId: f.patient.userId, acceptedByUserId: caregiver.userId }]);
    expect((await db.caregiverResourceGrant.findMany({ select: { resource: true, status: true }, orderBy: { resource: "asc" } })))
      .toEqual([{ resource: "PROFILE_SUMMARY", status: "ACTIVE" }, { resource: "MEDICATION", status: "ACTIVE" }]);
    const actions = (await db.auditEvent.findMany({ select: { action: true } })).map(({ action }) => action);
    expect(actions.filter((action) => action.endsWith("grant.accepted"))).toHaveLength(3);
  });

  it("creates the account, relationship and grants together for an unregistered relative (AF-2 path)", async () => {
    const f = await patientFixture();
    const invitation = await createCaregiverInvitation(f.patient, {
      nationalId: relativeNationalId, relationshipLabel: "OTHER", relationshipLabelOther: "เพื่อนบ้าน", appointmentRelationshipIds: [f.relationshipB], resources: ["PROFILE_SUMMARY"],
    }, deps);
    const claim = await createCaregiverAccountFromInvitation({
      token: invitation.plaintextToken, nationalId: relativeNationalId, givenName: "ญาติ", familyName: "ทดสอบ",
      password: "caregiver-test-password-2026", passwordConfirmation: "caregiver-test-password-2026",
    }, { ipAddress: "203.0.113.50" }, {
      database: db, now: () => now, rateLimiter: { consume: async () => true },
      createProviderIdentity: async ({ userId }) => ({ authSubject: randomUUID(), providerLoginAlias: `caregiver-${userId}@test.invalid` }),
      deleteProviderIdentity: async () => {},
    });

    expect(await db.caregiverRelationship.findUniqueOrThrow({ where: { id: claim.relationshipId }, select: { relationshipLabel: true, relationshipLabelOther: true } }))
      .toEqual({ relationshipLabel: "OTHER", relationshipLabelOther: "เพื่อนบ้าน" });
    expect(await db.caregiverAppointmentGrant.count({ where: { caregiverUserId: claim.userId, status: "ACTIVE", patientHospitalRelationshipId: f.relationshipB } })).toBe(1);
    expect(await db.caregiverResourceGrant.count({ where: { caregiverUserId: claim.userId, status: "ACTIVE" } })).toBe(1);
  });

  it("creates nothing when one chosen scope is no longer available at acceptance", async () => {
    const f = await patientFixture();
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "SPOUSE", appointmentRelationshipIds: [f.relationshipA, f.relationshipB], resources: ["HEALTH_PLAN"] });
    // A Hospital whose care ended after issue fails closed: no partial relationship or grant.
    await db.patientHospitalRelationship.update({ where: { id: f.relationshipB }, data: { endedAt: new Date(), endedByUserId: f.patient.userId, endReason: "สิ้นสุดการดูแล" } });
    await expect(acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await db.caregiverRelationship.count()).toBe(0);
    expect(await db.caregiverAppointmentGrant.count()).toBe(0);
    expect(await db.caregiverResourceGrant.count()).toBe(0);
    expect((await db.caregiverInvitation.findFirstOrThrow({ select: { status: true } })).status).toBe("PENDING");
  });

  it("rejects a foreign Hospital or an unsupported resource at issue time", async () => {
    const f = await patientFixture();
    const other = await patientFixture();
    await account([Role.CAREGIVER], caregiverNationalId);
    await expect(createCaregiverInvitation(f.patient, { nationalId: caregiverNationalId, relationshipLabel: "CHILD", appointmentRelationshipIds: [other.relationshipA] }, deps))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createCaregiverInvitation(f.patient, { nationalId: caregiverNationalId, relationshipLabel: "CHILD", resources: ["UNRECOGNIZED"] }, deps))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.caregiverInvitation.count()).toBe(0);
  });

  it("shows only granted blocks, re-checks each grant per request and never projects a private phone", async () => {
    const f = await patientFixture();
    const ids = await addCareData(f);
    const { caregiver, invitation } = await oneStepAdd(f, {
      relationshipLabel: "CHILD", appointmentRelationshipIds: [f.relationshipA], resources: ["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"],
    });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);

    const summary = await getFamilyHealthSummary(caregiver, relationshipId, deps);
    expect(summary).toMatchObject({
      relationshipLabel: "บุตร",
      profile: { age: 66, careTeams: [
        { hospitalName: "รพ.สต. บ้านทดสอบ", osmDisplayName: expect.stringContaining("อสม. สมศรี"), hospitalPhone: "021111111" },
        { hospitalName: "โรงพยาบาลทดสอบ", osmDisplayName: null, hospitalPhone: "022222222" },
      ] },
      nextAppointment: { appointment: { appointmentId: ids.upcoming, hospitalName: "รพ.สต. บ้านทดสอบ" } },
      healthPlan: { plans: [{ hospitalName: "รพ.สต. บ้านทดสอบ", primaryGoalLabel: "แผน “สุขภาพดี” ของฉัน", targets: { weightLossKg: 3 } }] },
      medications: { items: [{ medicationName: "เมทฟอร์มิน", times: ["08:00", "20:00"] }] },
    });
    expect(JSON.stringify(summary)).not.toMatch(/0899999999|หลังอาหาร|บันทึกของเจ้าหน้าที่|บันทึกภายใน|ยาที่หยุดแล้ว/u);

    expect(await db.caregiverResourceGrant.count({ where: { status: "ACTIVE" } })).toBe(3);

    // Revoking one scope hides only that block on the next request.
    const medication = await db.caregiverResourceGrant.findFirstOrThrow({ where: { resource: "MEDICATION" }, select: { id: true } });
    await revokeResourceGrant(f.patient, medication.id, deps);
    const afterRevoke = await getFamilyHealthSummary(caregiver, relationshipId, deps);
    expect(afterRevoke.medications).toBeNull();
    expect(afterRevoke.healthPlan).not.toBeNull();
    expect(afterRevoke.nextAppointment).not.toBeNull();

    // Another caregiver, or the Patient, cannot open this relationship's summary.
    await expect(getFamilyHealthSummary(f.patient, relationshipId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("revoking the relationship revokes every grant; a caregiver withdrawal does too", async () => {
    const f = await patientFixture();
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "CHILD", appointmentRelationshipIds: [f.relationshipA], resources: ["PROFILE_SUMMARY"] });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);
    const pending = await proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "MEDICATION" }, deps);

    await revokeCaregiverRelationship(f.patient, relationshipId, deps);

    expect(await db.caregiverAppointmentGrant.findMany({ select: { status: true, revokedByUserId: true } })).toEqual([{ status: "REVOKED", revokedByUserId: f.patient.userId }]);
    expect(await db.caregiverResourceGrant.count({ where: { status: { not: "REVOKED" } } })).toBe(0);
    expect(await db.auditEvent.count({ where: { resourceId: pending.grantId, action: "caregiver_resource_grant.revoked" } })).toBe(1);
    await expect(getFamilyHealthSummary(caregiver, relationshipId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const second = await patientFixture();
    const otherCaregiver = await account([Role.CAREGIVER], relativeNationalId);
    const again = await createCaregiverInvitation(second.patient, { nationalId: relativeNationalId, relationshipLabel: "PARENT", resources: ["PROFILE_SUMMARY"] }, deps);
    const withdrawn = await acceptCaregiverInvitation(otherCaregiver, again.plaintextToken, deps);
    await withdrawOwnCaregiverRelationship(otherCaregiver, withdrawn.relationshipId, deps);
    expect(await db.caregiverResourceGrant.findFirstOrThrow({ where: { caregiverRelationshipId: withdrawn.relationshipId }, select: { status: true, revokedByUserId: true } }))
      .toEqual({ status: "REVOKED", revokedByUserId: otherCaregiver.userId });
  });

  it("adds a scope later with separate acceptance and keeps one actionable grant per resource", async () => {
    const f = await patientFixture();
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "CHILD" });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);
    expect(await getFamilyHealthSummary(caregiver, relationshipId, deps)).toMatchObject({ profile: null, nextAppointment: null, healthPlan: null, medications: null });

    const { grantId } = await proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "PROFILE_SUMMARY" }, deps);
    await expect(proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "PROFILE_SUMMARY" }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).profile).toBeNull();
    await expect(acceptResourceGrant(f.patient, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptResourceGrant(caregiver, grantId, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).profile).toMatchObject({ age: 66 });

    const plan = await proposeResourceGrant(f.patient, { caregiverRelationshipId: relationshipId, resource: "HEALTH_PLAN" }, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan).toBeNull();
    await acceptResourceGrant(caregiver, plan.grantId, deps);
    expect((await getFamilyHealthSummary(caregiver, relationshipId, deps)).healthPlan).not.toBeNull();
  });

  it("edits the label with a version check and audits it", async () => {
    const f = await patientFixture();
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "CHILD" });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);

    expect(await updateCaregiverRelationshipLabel(f.patient, { relationshipId, relationshipLabel: "GRANDCHILD", expectedVersion: 1 }, deps)).toEqual({ relationshipLabelVersion: 2 });
    await expect(updateCaregiverRelationshipLabel(f.patient, { relationshipId, relationshipLabel: "SIBLING", expectedVersion: 1 }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateCaregiverRelationshipLabel(caregiver, { relationshipId, relationshipLabel: "SIBLING", expectedVersion: 2 }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.caregiverRelationship.findUniqueOrThrow({ where: { id: relationshipId }, select: { relationshipLabel: true, relationshipLabelVersion: true } }))
      .toEqual({ relationshipLabel: "GRANDCHILD", relationshipLabelVersion: 2 });
    expect(await db.auditEvent.count({ where: { action: "caregiver_relationship.label_updated", resourceId: relationshipId } })).toBe(1);
    // The database also rejects free text on a non-OTHER label.
    await expect(db.caregiverRelationship.update({ where: { id: relationshipId }, data: { relationshipLabelOther: "เพื่อน" } })).rejects.toThrow();
  });
});

describe("AF-5 family appointment read v2 (PostgreSQL)", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(clear);
  afterAll(async () => { await db.$disconnect(); });

  async function legacyV1Grant(f: Fixture) {
    const { caregiver, invitation } = await oneStepAdd(f, { relationshipLabel: "CHILD" });
    const { relationshipId } = await acceptCaregiverInvitation(caregiver, invitation.plaintextToken, deps);
    const grant = await db.caregiverAppointmentGrant.create({ data: {
      caregiverRelationshipId: relationshipId, patientProfileId: f.profileId, patientPersonId: f.patient.personId, caregiverUserId: caregiver.userId,
      caregiverPersonId: caregiver.personId, patientHospitalRelationshipId: f.relationshipA, contractVersion: "family-appointment-read-v1", status: "ACTIVE",
      proposedByUserId: f.patient.userId, proposedAt: days(-30), acceptedByUserId: caregiver.userId, acceptedAt: days(-30),
    } });
    return { caregiver, relationshipId, v1GrantId: grant.id };
  }

  it("keeps v1 fields until the caregiver accepts v2, then shows the wider fields and the 90-day history", async () => {
    const f = await patientFixture();
    const parent = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "โรงพยาบาลแม่ข่าย", status: "ACTIVE" } });
    await db.hospitalServiceAreaEligibility.createMany({ data: [{ hospitalId: parent.id, kind: "PARENT", verifiedAt: now }, { hospitalId: f.hospitalA, kind: "CHILD", verifiedAt: now }] });
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: f.hospitalA, createdByUserId: f.patient.userId } });
    const ids = await addCareData(f);
    // Outside the 90-day history window (exclusive lower bound is now - 90 days).
    await db.patientAppointment.create({ data: { patientHospitalRelationshipId: f.relationshipA, createdByUserId: f.patient.userId, type: "FOLLOW_UP",
      scheduledAt: new Date(days(-90).getTime() - 1), status: "COMPLETED", submissionNonce: randomUUID() } });
    const { caregiver, relationshipId, v1GrantId } = await legacyV1Grant(f);

    const v1 = await listDelegatedAppointments(caregiver, { grantId: v1GrantId }, deps);
    expect(v1.contractVersion).toBe("family-appointment-read-v1");
    expect(v1.appointments).toEqual([expect.objectContaining({ appointmentId: ids.upcoming, extension: null })]);
    await expect(listDelegatedAppointments(caregiver, { grantId: v1GrantId, tab: "history" }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDelegatedAppointment(caregiver, v1GrantId, ids.past, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The Patient proposes v2; the v1 projection stays until the caregiver accepts (no silent widening).
    const { grantId: v2GrantId } = await proposeAppointmentGrant(f.patient, { caregiverRelationshipId: relationshipId, patientHospitalRelationshipId: f.relationshipA }, deps);
    await expect(proposeAppointmentGrant(f.patient, { caregiverRelationshipId: relationshipId, patientHospitalRelationshipId: f.relationshipA }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listDelegatedAppointments(caregiver, { grantId: v1GrantId }, deps)).appointments[0]?.extension).toBeNull();
    await expect(listDelegatedAppointments(caregiver, { grantId: v2GrantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await acceptAppointmentGrant(caregiver, v2GrantId, deps);

    expect(await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: v1GrantId }, select: { status: true, revokedByUserId: true } }))
      .toEqual({ status: "REVOKED", revokedByUserId: caregiver.userId });
    await expect(listDelegatedAppointments(caregiver, { grantId: v1GrantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const upcoming = await listDelegatedAppointments(caregiver, { grantId: v2GrantId }, deps);
    expect(upcoming.appointments).toEqual([expect.objectContaining({ appointmentId: ids.upcoming, extension: {
      locationDetail: "บ้านเลขที่ 9", responsibleDisplayName: expect.stringContaining("หมอ"), responsibleProfession: "DOCTOR",
      osmAtCreationDisplayName: expect.stringContaining("อสม. สมศรี"), parentHospitalName: "โรงพยาบาลแม่ข่าย",
    } })]);
    const history = await listDelegatedAppointments(caregiver, { grantId: v2GrantId, tab: "history" }, deps);
    expect(history.appointments.map(({ appointmentId, status }) => ({ appointmentId, status }))).toEqual([{ appointmentId: ids.past, status: "COMPLETED" }]);
    const detail = await getDelegatedAppointment(caregiver, v2GrantId, ids.past, deps);
    expect(detail.contactPhones).toEqual({ assignedOsmPhone: null, hospitalPhone: "021111111", patientPhone: null });
    expect(JSON.stringify([upcoming, history, detail])).not.toMatch(/0899999999|บันทึกภายใน|"note"/u);
    expect(await db.caregiverAppointmentGrant.count({ where: { status: "ACTIVE" } })).toBe(1);
  });

  it("allows only one ACTIVE appointment grant per relationship and Hospital in the database", async () => {
    const f = await patientFixture();
    const { caregiver, relationshipId } = await legacyV1Grant(f);
    await expect(db.caregiverAppointmentGrant.create({ data: {
      caregiverRelationshipId: relationshipId, patientProfileId: f.profileId, patientPersonId: f.patient.personId, caregiverUserId: caregiver.userId,
      caregiverPersonId: caregiver.personId, patientHospitalRelationshipId: f.relationshipA, contractVersion: "family-appointment-read-v2", status: "ACTIVE",
      proposedByUserId: f.patient.userId, acceptedByUserId: caregiver.userId, acceptedAt: now,
    } })).rejects.toThrow();
  });
});
