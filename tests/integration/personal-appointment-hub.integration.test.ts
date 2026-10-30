import { randomUUID } from "node:crypto";
import { type AppointmentStatus, Role } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { acceptAppointmentGrant, proposeAppointmentGrant, revokeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import { listDelegatedAppointmentSubjects } from "@/modules/family/services/delegated-appointment-query-service";
import {
  getOwnPatientAppointmentDetail,
  listOwnPatientAppointmentHub,
} from "@/modules/patient-self/services/patient-self-care-query-service";

const db = getPrisma();
const now = new Date("2026-10-23T00:00:00.000Z");
const hours = (value: number): Date => new Date(now.getTime() + value * 60 * 60 * 1000);
const grantDeps = { database: db, now: () => now };

async function account(roles: Role[]): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "ศูนย์นัด" } });
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function hospital(name: string): Promise<string> {
  return (await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name, status: "ACTIVE" } })).id;
}

async function appointment(relationshipId: string, createdByUserId: string, scheduledAt: Date, status: AppointmentStatus = "SCHEDULED"): Promise<string> {
  return (await db.patientAppointment.create({ data: {
    patientHospitalRelationshipId: relationshipId, createdByUserId, type: "FOLLOW_UP", scheduledAt, status,
    submissionNonce: randomUUID(), locationType: "CLINIC",
  } })).id;
}

async function attach(parentHospitalId: string, childHospitalId: string, createdByUserId: string): Promise<void> {
  await db.hospitalServiceArea.create({ data: { parentHospitalId, childHospitalId, createdByUserId } });
}

async function patientFixture() {
  const patient = await account([Role.PATIENT]);
  const profile = await db.patientProfile.create({ data: { personId: patient.personId } });
  const hospitalA = await hospital("โรงพยาบาลศูนย์ทดสอบ");
  const hospitalB = await hospital("รพ.สต. บ้านทดสอบ");
  const hospitalC = await hospital("โรงพยาบาลที่สิ้นสุดการดูแล");
  const relationshipA = (await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospitalA } })).id;
  const relationshipB = (await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospitalB } })).id;
  const relationshipC = (await db.patientHospitalRelationship.create({ data: {
    patientProfileId: profile.id, hospitalId: hospitalC, endedAt: hours(-48), endedByUserId: patient.userId, endReason: "สิ้นสุดการดูแล",
  } })).id;
  return { patient, profileId: profile.id, hospitalA, hospitalB, relationshipA, relationshipB, relationshipC };
}

async function clear(): Promise<void> {
  await db.auditEvent.deleteMany();
  await db.caregiverAppointmentGrant.deleteMany();
  await db.patientAppointment.deleteMany();
  await db.caregiverRelationship.deleteMany();
  await db.caregiverInvitation.deleteMany();
  await db.patientHospitalRelationship.deleteMany();
  await db.patientProfile.deleteMany();
  await db.userRole.deleteMany();
  await db.$transaction([
    db.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    db.hospitalServiceArea.deleteMany(),
  ]);
  await db.hospitalServiceAreaEligibility.deleteMany();
  await db.user.deleteMany();
  await db.hospital.deleteMany();
  await db.person.deleteMany();
}

describe("AF-4 personal appointment hub PostgreSQL", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(clear);
  afterAll(async () => { await db.$disconnect(); });

  it("merges every non-ended own Hospital into upcoming/history tabs and excludes the ended relationship", async () => {
    const f = await patientFixture();
    const upcomingB = await appointment(f.relationshipB, f.patient.userId, hours(2));
    const upcomingA = await appointment(f.relationshipA, f.patient.userId, hours(5));
    const cancelledFuture = await appointment(f.relationshipA, f.patient.userId, hours(3), "CANCELLED");
    const past = await appointment(f.relationshipB, f.patient.userId, hours(-5));
    await appointment(f.relationshipC, f.patient.userId, hours(4));
    await appointment(f.relationshipC, f.patient.userId, hours(-4), "COMPLETED");

    const upcoming = await listOwnPatientAppointmentHub(f.patient, {}, { database: db, now });
    expect(upcoming.appointments.map(({ appointmentId }) => appointmentId)).toEqual([upcomingB, upcomingA]);
    expect(upcoming.appointments.map(({ hospitalName }) => hospitalName)).toEqual(["รพ.สต. บ้านทดสอบ", "โรงพยาบาลศูนย์ทดสอบ"]);
    expect(upcoming.endedRelationships.map(({ relationshipId }) => relationshipId)).toEqual([f.relationshipC]);

    const history = await listOwnPatientAppointmentHub(f.patient, { tab: "history" }, { database: db, now });
    expect(history.appointments.map(({ appointmentId }) => appointmentId)).toEqual([cancelledFuture, past]);

    const filtered = await listOwnPatientAppointmentHub(f.patient, { hospital: f.relationshipA }, { database: db, now });
    expect(filtered.appointments.map(({ appointmentId }) => appointmentId)).toEqual([upcomingA]);
    // The ended relationship is not a selectable filter; the hub falls back to every ongoing Hospital.
    const endedFilter = await listOwnPatientAppointmentHub(f.patient, { hospital: f.relationshipC }, { database: db, now });
    expect(endedFilter.selectedRelationshipId).toBeNull();
    expect(endedFilter.appointments).toHaveLength(2);
  });

  it("pages with a keyset cursor and never reads another Patient's rows", async () => {
    const f = await patientFixture();
    const other = await patientFixture();
    const ids: string[] = [];
    for (let index = 0; index < 51; index += 1) ids.push(await appointment(f.relationshipA, f.patient.userId, hours(index + 1)));
    const foreign = await appointment(other.relationshipA, other.patient.userId, hours(1));

    const first = await listOwnPatientAppointmentHub(f.patient, {}, { database: db, now });
    expect(first.appointments.map(({ appointmentId }) => appointmentId)).toEqual(ids.slice(0, 50));
    expect(first.nextCursor).toBe(ids[49]);
    const second = await listOwnPatientAppointmentHub(f.patient, { cursor: first.nextCursor }, { database: db, now });
    expect(second.appointments.map(({ appointmentId }) => appointmentId)).toEqual([ids[50]]);
    expect(second.nextCursor).toBeNull();

    const forged = await listOwnPatientAppointmentHub(f.patient, { cursor: foreign, hospital: other.relationshipA }, { database: db, now });
    expect(forged.selectedRelationshipId).toBeNull();
    expect(forged.appointments.map(({ appointmentId }) => appointmentId)).toEqual(ids.slice(0, 50));
  });

  it("names the child facility's current active Parent, following a network transfer", async () => {
    const f = await patientFixture();
    const parentOne = await hospital("โรงพยาบาลแม่ข่ายเดิม");
    const parentTwo = await hospital("โรงพยาบาลแม่ข่ายใหม่");
    await db.hospitalServiceAreaEligibility.createMany({ data: [
      { hospitalId: parentOne, kind: "PARENT", verifiedAt: now },
      { hospitalId: parentTwo, kind: "PARENT", verifiedAt: now },
      { hospitalId: f.hospitalB, kind: "CHILD", verifiedAt: now },
    ] });
    const childAppointment = await appointment(f.relationshipB, f.patient.userId, hours(2));
    const parentAppointment = await appointment(f.relationshipA, f.patient.userId, hours(3));

    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipB, childAppointment, { database: db })).parentHospitalName).toBeNull();
    await attach(parentOne, f.hospitalB, f.patient.userId);
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipB, childAppointment, { database: db })).parentHospitalName)
      .toBe("โรงพยาบาลแม่ข่ายเดิม");
    await db.hospitalServiceArea.updateMany({
      where: { childHospitalId: f.hospitalB, endedAt: null },
      data: { endedAt: new Date(), endedByUserId: f.patient.userId, endReason: "โอนย้าย" },
    });
    await attach(parentTwo, f.hospitalB, f.patient.userId);
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipB, childAppointment, { database: db })).parentHospitalName)
      .toBe("โรงพยาบาลแม่ข่ายใหม่");
    expect((await getOwnPatientAppointmentDetail(f.patient, f.relationshipA, parentAppointment, { database: db })).parentHospitalName).toBeNull();
  });

  it("lists only the caregiver's ACTIVE grants for a CAREGIVER-only account and drops a revoked grant on the next read", async () => {
    const f = await patientFixture();
    const caregiver = await account([Role.CAREGIVER]);
    const invitation = await db.caregiverInvitation.create({ data: {
      patientProfileId: f.profileId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId,
      issuedByUserId: f.patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1",
      issuedAt: now, expiresAt: hours(24), acceptedAt: now,
    } });
    const parent = await db.caregiverRelationship.create({ data: {
      patientProfileId: f.profileId, caregiverUserId: caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now,
    } });
    const { grantId } = await proposeAppointmentGrant(f.patient, { caregiverRelationshipId: parent.id, patientHospitalRelationshipId: f.relationshipB }, grantDeps);
    expect(await listDelegatedAppointmentSubjects(caregiver, grantDeps)).toEqual([]);

    await acceptAppointmentGrant(caregiver, grantId, grantDeps);
    expect(await listDelegatedAppointmentSubjects(caregiver, grantDeps)).toEqual([
      { grantId, caregiverRelationshipId: parent.id, contractVersion: "family-appointment-read-v3",
        patient: { givenName: "ทดสอบ", familyName: "ศูนย์นัด" }, hospitalName: "รพ.สต. บ้านทดสอบ" },
    ]);
    expect(await listDelegatedAppointmentSubjects(f.patient, grantDeps)).toEqual([]);
    await expect(listOwnPatientAppointmentHub(caregiver, {}, { database: db, now })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await revokeAppointmentGrant(f.patient, grantId, grantDeps);
    expect(await listDelegatedAppointmentSubjects(caregiver, grantDeps)).toEqual([]);
  });
});
