import { randomUUID } from "node:crypto";
import { Prisma, type AppointmentStatus, Role } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { FAMILY_APPOINTMENT_READ_CONTRACT, FAMILY_APPOINTMENT_WINDOW_MS } from "@/modules/family/domain/appointment-grant-contract";
import { acceptAppointmentGrant, proposeAppointmentGrant, revokeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import { getAppointmentGrantManagement } from "@/modules/family/services/appointment-grant-management-query-service";
import { getDelegatedAppointment, listDelegatedAppointments } from "@/modules/family/services/delegated-appointment-query-service";
import { getFamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";
import { revokeCaregiverRelationship, withdrawOwnCaregiverRelationship } from "@/modules/family/services/caregiver-relationship-service";

const db = getPrisma();
const now = new Date("2026-10-02T00:00:00.000Z");
const deps = { database: db, enabled: true, now: () => now };

async function actor(roles: Role[] = []): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName: "เดมี" } });
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function withIndependentRole(account: ActorContext, kind: "OSM" | "MEMBER" | "OWNER" | "ADMIN" | "PATIENT", hospitalId: string): Promise<ActorContext> {
  const role = kind === "MEMBER" || kind === "OWNER" ? Role.HOSPITAL : Role[kind];
  await db.userRole.create({ data: { userId: account.userId, role } });
  if (kind === "MEMBER" || kind === "OWNER") {
    await db.hospitalMembership.create({ data: { userId: account.userId, hospitalId, membershipType: kind, status: "ACTIVE" } });
    return { ...account, roles: [...account.roles, role], hospitalMemberships: [{ hospitalId, membershipType: kind, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }] };
  }
  if (kind === "OSM") {
    await db.osmHospitalRelationship.create({ data: { userId: account.userId, hospitalId, status: "ACTIVE" } });
    return { ...account, roles: [...account.roles, role], osmHospitalRelationships: [{ hospitalId, status: "ACTIVE", hospitalStatus: "ACTIVE" }] };
  }
  if (kind === "PATIENT") await db.patientProfile.create({ data: { personId: account.personId } });
  return { ...account, roles: [...account.roles, role] };
}

async function fixture(): Promise<{ patient: ActorContext; caregiver: ActorContext; profileId: string; parentId: string; phrId: string; hospitalId: string }> {
  const patient = await actor([Role.PATIENT]);
  const caregiver = await actor();
  const profile = await db.patientProfile.create({ data: { personId: patient.personId } });
  const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "หน่วยบริการทดสอบ", status: "ACTIVE" } });
  const phr = await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId: hospital.id, hospitalNumber: "SECRET-HN" } });
  const invitation = await db.caregiverInvitation.create({ data: {
    patientProfileId: profile.id, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId,
    issuedByUserId: patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1",
    issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), acceptedAt: now,
  } });
  const parent = await db.caregiverRelationship.create({ data: { patientProfileId: profile.id, caregiverUserId: caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now } });
  return { patient, caregiver, profileId: profile.id, parentId: parent.id, phrId: phr.id, hospitalId: hospital.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function proposal(f: Fixture): { caregiverRelationshipId: string; patientHospitalRelationshipId: string } {
  return { caregiverRelationshipId: f.parentId, patientHospitalRelationshipId: f.phrId };
}
function grantData(f: Fixture): Prisma.CaregiverAppointmentGrantUncheckedCreateInput {
  return { caregiverRelationshipId: f.parentId, patientProfileId: f.profileId, patientPersonId: f.patient.personId,
    caregiverUserId: f.caregiver.userId, caregiverPersonId: f.caregiver.personId, patientHospitalRelationshipId: f.phrId,
    proposedByUserId: f.patient.userId, proposedAt: now, contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT };
}
async function activeGrant(f: Fixture): Promise<string> {
  const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
  await acceptAppointmentGrant(f.caregiver, grantId, deps);
  return grantId;
}
async function appointment(f: Fixture, at: Date = now, status: AppointmentStatus = "SCHEDULED", id: string = randomUUID()): Promise<string> {
  const row = await db.patientAppointment.create({ data: { id, patientHospitalRelationshipId: f.phrId, createdByUserId: f.patient.userId,
    type: "FOLLOW_UP", scheduledAt: at, status, submissionNonce: randomUUID(), durationMinutes: null, locationType: null,
    locationDetail: "SECRET-LOCATION", note: "SECRET-NOTE" } });
  return row.id;
}
async function clear(): Promise<void> {
  await db.auditEvent.deleteMany();
  await db.caregiverAppointmentGrant.deleteMany();
  await db.patientAppointment.deleteMany();
  await db.caregiverRelationship.deleteMany();
  await db.caregiverInvitation.deleteMany();
  await db.patientHospitalRelationship.deleteMany();
  await db.patientProfile.deleteMany();
  await db.hospitalMembership.deleteMany();
  await db.osmHospitalRelationship.deleteMany();
  await db.userRole.deleteMany();
  await db.user.deleteMany();
  await db.hospital.deleteMany();
  await db.person.deleteMany();
}

describe("Phase 17F.2 appointment grants PostgreSQL", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(clear);
  afterAll(async () => { await db.$disconnect(); });

  it("requires separate acceptance, preserves exactly six fields/nulls and audits only lifecycle", async () => {
    const f = await fixture();
    const id = await appointment(f);
    await expect(listDelegatedAppointments(f.caregiver, { grantId: randomUUID() }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    await expect(listDelegatedAppointments(f.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptAppointmentGrant(f.caregiver, grantId, deps);
    const page = await listDelegatedAppointments(f.caregiver, { grantId }, deps);
    expect(page.appointments).toEqual([{ appointmentId: id, hospitalName: "หน่วยบริการทดสอบ", type: "FOLLOW_UP", scheduledAt: now, durationMinutes: null, locationType: null, status: "SCHEDULED" }]);
    expect(await getDelegatedAppointment(f.caregiver, grantId, id, deps)).toEqual(page.appointments[0]);
    const management = await getAppointmentGrantManagement(f.caregiver, {}, deps);
    expect(Object.keys(management?.caregiver.grants[0] ?? {}).sort()).toEqual(["grantId", "status", "proposedAt", "acceptedAt", "revokedAt", "participant", "hospitalName"].sort());
    expect(JSON.stringify(management)).not.toMatch(/SECRET|hospitalNumber|hospitalCode|patientProfileId/);
    const audits = await db.auditEvent.findMany({ orderBy: { createdAt: "asc" }, select: { action: true, metadata: true, resourceId: true, actorUserId: true } });
    expect(audits.map((a) => a.action)).toEqual(["caregiver_appointment_grant.proposed", "caregiver_appointment_grant.accepted"]);
    expect(audits.map((a) => a.actorUserId)).toEqual([f.patient.userId, f.caregiver.userId]);
    expect(audits.every((a) => a.resourceId === grantId && JSON.stringify(a.metadata) === JSON.stringify({ contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT }))).toBe(true);
    expect(await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId } })).toMatchObject({ acceptedByUserId: f.caregiver.userId, acceptedAt: now, status: "ACTIVE" });
  });

  it("denies foreign parent/PHR, non-Patient, inactive Hospital, and client-selected contracts", async () => {
    const f = await fixture(); const other = await fixture();
    for (const input of [{ ...proposal(f), caregiverRelationshipId: other.parentId }, { ...proposal(f), patientHospitalRelationshipId: other.phrId }]) {
      await expect(proposeAppointmentGrant(f.patient, input, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(proposeAppointmentGrant(f.caregiver, proposal(f), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(proposeAppointmentGrant(f.patient, { ...proposal(f), contractVersion: "arbitrary" }, deps)).rejects.toMatchObject({ code: "VALIDATION" });
    await db.hospital.update({ where: { id: f.hospitalId }, data: { status: "SUSPENDED" } });
    await expect(proposeAppointmentGrant(f.patient, proposal(f), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.caregiverAppointmentGrant.count()).toBe(0);
  });

  it("denies every grant operation while disabled but preserves ordinary Family management", async () => {
    const f = await fixture(); const grantId = await activeGrant(f); const id = await appointment(f);
    const disabled = { ...deps, enabled: false };
    for (const operation of [() => proposeAppointmentGrant(f.patient, proposal(f), disabled), () => acceptAppointmentGrant(f.caregiver, grantId, disabled),
      () => revokeAppointmentGrant(f.patient, grantId, disabled), () => listDelegatedAppointments(f.caregiver, { grantId }, disabled), () => getDelegatedAppointment(f.caregiver, grantId, id, disabled)]) {
      await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await getAppointmentGrantManagement(f.caregiver, {}, disabled)).toBeNull();
    expect((await getFamilyManagementOverview(f.patient)).patient?.relationships).toHaveLength(1);
    await withdrawOwnCaregiverRelationship(f.caregiver, f.parentId, { database: db, now: () => now });
    expect((await getFamilyManagementOverview(f.caregiver)).caregiver.relationships[0]?.status).toBe("WITHDRAWN");
  });

  it.each(["patientAccount", "patientRole", "parent", "caregiverAccount", "caregiverPerson"] as const)("proposal rechecks current %s evidence", async (kind) => {
    const f = await fixture();
    if (kind === "patientAccount") await db.user.update({ where: { id: f.patient.userId }, data: { status: "SUSPENDED" } });
    if (kind === "patientRole") await db.userRole.delete({ where: { userId_role: { userId: f.patient.userId, role: Role.PATIENT } } });
    if (kind === "parent") await revokeCaregiverRelationship(f.patient, f.parentId, deps);
    if (kind === "caregiverAccount") await db.user.update({ where: { id: f.caregiver.userId }, data: { status: "SUSPENDED" } });
    // Existing invitation composite FK itself prevents changing the caregiver's persisted Person pair.
    if (kind === "caregiverPerson") {
      const other = await actor();
      await expect(db.user.update({ where: { id: f.caregiver.userId }, data: { personId: other.personId } })).rejects.toThrow();
      await expect(proposeAppointmentGrant({ ...f.patient, personId: other.personId }, proposal(f), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      return;
    }
    await expect(proposeAppointmentGrant(f.patient, proposal(f), deps)).rejects.toMatchObject({ code: kind.startsWith("patient") ? "FORBIDDEN" : "NOT_FOUND" });
    expect(await db.caregiverAppointmentGrant.count()).toBe(0);
  });

  it("conflicts on duplicate PENDING/ACTIVE, permits new lifecycle after pending/active revoke", async () => {
    const f = await fixture();
    const first = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    await expect(proposeAppointmentGrant(f.patient, proposal(f), deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await revokeAppointmentGrant(f.patient, first.grantId, deps);
    await expect(acceptAppointmentGrant(f.caregiver, first.grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const second = await activeGrant(f);
    await expect(proposeAppointmentGrant(f.patient, proposal(f), deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(acceptAppointmentGrant(f.caregiver, second, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await revokeAppointmentGrant(f.patient, second, deps);
    expect(await activeGrant(f)).not.toBe(second);
    expect(await db.caregiverAppointmentGrant.count({ where: { status: "REVOKED" } })).toBe(2);
  });

  it("denies wrong caregiver/Person, other Patient revoke, and foreign appointment/cursor uniformly", async () => {
    const f = await fixture(); const other = await fixture();
    const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    await expect(acceptAppointmentGrant(other.caregiver, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(acceptAppointmentGrant({ ...f.caregiver, personId: other.caregiver.personId }, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptAppointmentGrant(f.caregiver, grantId, deps);
    await expect(revokeAppointmentGrant(other.patient, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const id of [await appointment(other), randomUUID()]) {
      await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listDelegatedAppointments(f.caregiver, { grantId, cursor: id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(listDelegatedAppointments(other.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(["OSM", "MEMBER", "OWNER", "ADMIN", "PATIENT"] as const)("independent %s authority never grants another caregiver's appointment scope", async (kind) => {
    const f = await fixture();
    const wrong = await withIndependentRole(await actor(), kind, f.hospitalId);
    const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    await expect(acceptAppointmentGrant(wrong, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptAppointmentGrant(f.caregiver, grantId, deps);
    const id = await appointment(f);
    await expect(listDelegatedAppointments(wrong, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDelegatedAppointment(wrong, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeAppointmentGrant(wrong, grantId, deps)).rejects.toMatchObject({ code: kind === "PATIENT" ? "NOT_FOUND" : "FORBIDDEN" });
    await expect(proposeAppointmentGrant(wrong, proposal(f), deps)).rejects.toMatchObject({ code: kind === "PATIENT" ? "NOT_FOUND" : "FORBIDDEN" });
    expect((await getAppointmentGrantManagement(wrong, {}, deps))?.caregiver.grants).toEqual([]);
  });

  it.each(["OSM", "MEMBER", "OWNER", "PATIENT"] as const)("intended caregiver plus %s retains only the exact accepted Patient/PHR scope", async (kind) => {
    const f = await fixture(); const other = await fixture();
    const caregiver = await withIndependentRole(f.caregiver, kind, f.hospitalId);
    const grantId = await activeGrant({ ...f, caregiver }); const id = await appointment(f);
    const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "อื่น", status: "ACTIVE" } });
    const phr = await db.patientHospitalRelationship.create({ data: { patientProfileId: f.profileId, hospitalId: hospital.id } });
    const foreignIds = [await appointment(other), await appointment({ ...f, phrId: phr.id })];
    expect((await listDelegatedAppointments(caregiver, { grantId }, deps)).appointments.map((row) => row.appointmentId)).toEqual([id]);
    for (const foreignId of foreignIds) {
      await expect(getDelegatedAppointment(caregiver, grantId, foreignId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listDelegatedAppointments(caregiver, { grantId, cursor: foreignId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const otherGrant = await activeGrant(other);
    await expect(listDelegatedAppointments(caregiver, { grantId: otherGrant }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeAppointmentGrant(caregiver, grantId, deps)).rejects.toMatchObject({ code: kind === "PATIENT" ? "NOT_FOUND" : "FORBIDDEN" });
  });

  it.each(["OSM", "MEMBER", "OWNER"] as const)("Patient owner plus %s may propose/revoke only their own exact Family scope", async (kind) => {
    const f = await fixture(); const other = await fixture();
    const patient = await withIndependentRole(f.patient, kind, f.hospitalId);
    await expect(proposeAppointmentGrant(patient, { ...proposal(f), caregiverRelationshipId: other.parentId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(proposeAppointmentGrant(patient, { ...proposal(f), patientHospitalRelationshipId: other.phrId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { grantId } = await proposeAppointmentGrant(patient, proposal(f), deps);
    await acceptAppointmentGrant(f.caregiver, grantId, deps);
    const otherGrant = await activeGrant(other);
    await expect(revokeAppointmentGrant(patient, otherGrant, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await revokeAppointmentGrant(patient, grantId, deps);
    expect((await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId } })).status).toBe("REVOKED");
    expect((await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: otherGrant } })).status).toBe("ACTIVE");
  });

  it("one caregiver serving two Patients in the same Hospital keeps each accepted grant isolated", async () => {
    const f = await fixture(); const other = await fixture();
    const grantA = await activeGrant(f); const appointmentA = await appointment(f);
    const phr = await db.patientHospitalRelationship.create({ data: { patientProfileId: other.profileId, hospitalId: f.hospitalId } });
    const invitation = await db.caregiverInvitation.create({ data: {
      patientProfileId: other.profileId, caregiverUserId: f.caregiver.userId, caregiverPersonId: f.caregiver.personId,
      issuedByUserId: other.patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1",
      issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), acceptedAt: now,
    } });
    const parent = await db.caregiverRelationship.create({ data: { patientProfileId: other.profileId, caregiverUserId: f.caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now } });
    const patientB = { ...other, caregiver: f.caregiver, hospitalId: f.hospitalId, phrId: phr.id, parentId: parent.id };
    const appointmentB = await appointment(patientB);
    await expect(getDelegatedAppointment(f.caregiver, grantA, appointmentB, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const grantB = await activeGrant(patientB);
    for (const [grantId, ownId, foreignId] of [[grantA, appointmentA, appointmentB], [grantB, appointmentB, appointmentA]]) {
      expect((await listDelegatedAppointments(f.caregiver, { grantId }, deps)).appointments.map((row) => row.appointmentId)).toEqual([ownId]);
      await expect(getDelegatedAppointment(f.caregiver, grantId, foreignId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(listDelegatedAppointments(f.caregiver, { grantId, cursor: foreignId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await revokeAppointmentGrant(f.patient, grantA, deps);
    expect((await getDelegatedAppointment(f.caregiver, grantB, appointmentB, deps)).appointmentId).toBe(appointmentB);
  });

  it.each(["caregiver", "patient", "role", "SUSPENDED", "PENDING_VERIFICATION"] as const)("temporary %s ineligibility denies acceptance/read then resumes unchanged authority", async (kind) => {
    const f = await fixture(); const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    async function eligibility(enabled: boolean): Promise<void> {
      if (kind === "caregiver" || kind === "patient") await db.user.update({ where: { id: f[kind].userId }, data: { status: enabled ? "ACTIVE" : "SUSPENDED" } });
      else if (kind === "role") {
        if (enabled) await db.userRole.create({ data: { userId: f.patient.userId, role: Role.PATIENT } });
        else await db.userRole.delete({ where: { userId_role: { userId: f.patient.userId, role: Role.PATIENT } } });
      } else await db.hospital.update({ where: { id: f.hospitalId }, data: { status: enabled ? "ACTIVE" : kind } });
    }
    await eligibility(false);
    await expect(acceptAppointmentGrant(f.caregiver, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await eligibility(true); await acceptAppointmentGrant(f.caregiver, grantId, deps);
    const id = await appointment(f);
    await eligibility(false);
    await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await eligibility(true);
    expect((await getDelegatedAppointment(f.caregiver, grantId, id, deps)).appointmentId).toBe(id);
    await revokeAppointmentGrant(f.patient, grantId, deps);
    await eligibility(false); await eligibility(true);
    await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(["revoke", "withdraw"] as const)("parent %s immediately denies all children, including pending acceptance and replacement inheritance", async (operation) => {
    const f = await fixture(); const grantId = await activeGrant(f); const id = await appointment(f);
    const secondHospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "อีกแห่ง", status: "ACTIVE" } });
    const secondPhr = await db.patientHospitalRelationship.create({ data: { hospitalId: secondHospital.id, patientProfileId: f.profileId } });
    const pending = await proposeAppointmentGrant(f.patient, { ...proposal(f), patientHospitalRelationshipId: secondPhr.id }, deps);
    if (operation === "revoke") await revokeCaregiverRelationship(f.patient, f.parentId, deps);
    else await withdrawOwnCaregiverRelationship(f.caregiver, f.parentId, deps);
    await expect(listDelegatedAppointments(f.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(acceptAppointmentGrant(f.caregiver, pending.grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const source = await db.caregiverInvitation.create({ data: { patientProfileId: f.profileId, caregiverUserId: f.caregiver.userId, caregiverPersonId: f.caregiver.personId,
      issuedByUserId: f.patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), acceptedAt: now, acceptanceContractVersion: "family-delegation-v1" } });
    await db.caregiverRelationship.create({ data: { patientProfileId: f.profileId, caregiverUserId: f.caregiver.userId, sourceInvitationId: source.id, activatedAt: now } });
    await expect(listDelegatedAppointments(f.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("grant revoke denies read/continuation immediately and leaves another exact grant/parent unchanged", async () => {
    const f = await fixture(); const grantId = await activeGrant(f); const id = await appointment(f);
    const h = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "อีกแห่ง", status: "ACTIVE" } });
    const phr = await db.patientHospitalRelationship.create({ data: { hospitalId: h.id, patientProfileId: f.profileId } });
    const other = { ...f, phrId: phr.id }; const otherGrant = await activeGrant(other); await appointment(other);
    await revokeAppointmentGrant(f.patient, grantId, deps);
    await expect(listDelegatedAppointments(f.caregiver, { grantId, cursor: id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listDelegatedAppointments(f.caregiver, { grantId: otherGrant }, deps)).appointments).toHaveLength(1);
    expect((await db.caregiverRelationship.findUniqueOrThrow({ where: { id: f.parentId } })).status).toBe("ACTIVE");
  });

  it("enforces exact parent/PHR/identity composite FKs", async () => {
    const f = await fixture(); const other = await fixture();
    for (const data of [
      { ...grantData(f), caregiverRelationshipId: other.parentId },
      { ...grantData(f), patientHospitalRelationshipId: other.phrId },
      { ...grantData(f), caregiverUserId: other.caregiver.userId, caregiverPersonId: other.caregiver.personId },
      { ...grantData(f), patientProfileId: other.profileId, patientPersonId: other.patient.personId, proposedByUserId: other.patient.userId },
      { ...grantData(f), caregiverPersonId: other.caregiver.personId },
      { ...grantData(f), proposedByUserId: other.patient.userId },
    ]) await expect(db.caregiverAppointmentGrant.create({ data })).rejects.toMatchObject({ code: "P2003" });
  });

  it("DB enforces actionable uniqueness, accepted caregiver evidence, valid lifecycle, immutable scope and terminal revoke", async () => {
    const f = await fixture(); const other = await actor();
    const pending = await db.caregiverAppointmentGrant.create({ data: grantData(f) });
    await expect(db.caregiverAppointmentGrant.create({ data: grantData(f) })).rejects.toMatchObject({ code: "P2002" });
    for (const data of [
      { status: "ACTIVE" as const, acceptedAt: now },
      { status: "ACTIVE" as const, acceptedAt: now, acceptedByUserId: other.userId },
      { acceptedAt: now, acceptedByUserId: f.caregiver.userId },
      { status: "REVOKED" as const },
      { status: "REVOKED" as const, revokedAt: now, revokedByUserId: other.userId },
      { contractVersion: "changed" },
    ]) await expect(db.caregiverAppointmentGrant.update({ where: { id: pending.id }, data })).rejects.toThrow();
    await acceptAppointmentGrant(f.caregiver, pending.id, deps);
    await expect(db.caregiverAppointmentGrant.create({ data: { ...grantData(f), status: "ACTIVE", acceptedAt: now, acceptedByUserId: f.caregiver.userId } })).rejects.toMatchObject({ code: "P2002" });
    await revokeAppointmentGrant(f.patient, pending.id, deps);
    await expect(db.caregiverAppointmentGrant.update({ where: { id: pending.id }, data: { status: "ACTIVE", revokedAt: null, revokedByUserId: null } })).rejects.toThrow();
    expect(await activeGrant(f)).not.toBe(pending.id);
  });

  it.each(["PENDING", "ACTIVE"] as const)("unknown %s contract fails closed", async (status) => {
    const f = await fixture(); const row = await db.caregiverAppointmentGrant.create({ data: { ...grantData(f), contractVersion: "unknown-v2", status,
      ...(status === "ACTIVE" ? { acceptedAt: now, acceptedByUserId: f.caregiver.userId } : {}) } });
    await expect(acceptAppointmentGrant(f.caregiver, row.id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listDelegatedAppointments(f.caregiver, { grantId: row.id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serializes concurrent proposals and accept attempts, with one transition/audit", async () => {
    const f = await fixture();
    const proposals = await Promise.allSettled([proposeAppointmentGrant(f.patient, proposal(f), deps), proposeAppointmentGrant(f.patient, proposal(f), deps)]);
    expect(proposals.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.caregiverAppointmentGrant.count()).toBe(1);
    const grant = await db.caregiverAppointmentGrant.findFirstOrThrow({ select: { id: true } });
    const accepted = await Promise.allSettled([acceptAppointmentGrant(f.caregiver, grant.id, deps), acceptAppointmentGrant(f.caregiver, grant.id, deps)]);
    expect(accepted.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { resourceId: grant.id } })).toBe(2);
  });

  it("accept/revoke race safely ends revoked, and never revives authority", async () => {
    const f = await fixture(); const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    const results = await Promise.allSettled([acceptAppointmentGrant(f.caregiver, grantId, deps), revokeAppointmentGrant(f.patient, grantId, deps)]);
    expect(results[1]?.status).toBe("fulfilled");
    const row = await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId } });
    expect(row.status).toBe("REVOKED");
    expect(await db.auditEvent.count({ where: { resourceId: grantId, action: "caregiver_appointment_grant.revoked" } })).toBe(1);
    await expect(listDelegatedAppointments(f.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(["revoke", "withdraw"] as const)("parent %s racing grant acceptance leaves no child read authority after commit", async (operation) => {
    const f = await fixture(); const { grantId } = await proposeAppointmentGrant(f.patient, proposal(f), deps);
    const id = await appointment(f);
    const terminate = operation === "revoke"
      ? revokeCaregiverRelationship(f.patient, f.parentId, deps)
      : withdrawOwnCaregiverRelationship(f.caregiver, f.parentId, deps);
    const results = await Promise.allSettled([acceptAppointmentGrant(f.caregiver, grantId, deps), terminate]);
    expect(results[1]?.status).toBe("fulfilled");
    expect((await db.caregiverRelationship.findUniqueOrThrow({ where: { id: f.parentId } })).status).toBe(operation === "revoke" ? "REVOKED" : "WITHDRAWN");
    await expect(acceptAppointmentGrant(f.caregiver, grantId, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listDelegatedAppointments(f.caregiver, { grantId }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.auditEvent.count({ where: { resourceId: grantId, action: "caregiver_appointment_grant.accepted" } })).toBe(results[0]?.status === "fulfilled" ? 1 : 0);
  });

  it.each(["proposed", "accepted", "revoked"] as const)("rolls back %s state and audit atomically on audit failure", async (transition) => {
    const f = await fixture();
    const grantId = transition === "proposed" ? null : (await proposeAppointmentGrant(f.patient, proposal(f), deps)).grantId;
    if (transition === "revoked" && grantId) await acceptAppointmentGrant(f.caregiver, grantId, deps);
    try {
      await db.$executeRawUnsafe(`CREATE FUNCTION family_grant_test_fail_audit() RETURNS trigger AS $$ BEGIN IF NEW."action" = 'caregiver_appointment_grant.${transition}' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await db.$executeRaw`CREATE TRIGGER family_grant_test_fail_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION family_grant_test_fail_audit()`;
      const operation = transition === "proposed" ? proposeAppointmentGrant(f.patient, proposal(f), deps) : transition === "accepted" ? acceptAppointmentGrant(f.caregiver, grantId, deps) : revokeAppointmentGrant(f.patient, grantId, deps);
      await expect(operation).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      if (grantId) expect((await db.caregiverAppointmentGrant.findUniqueOrThrow({ where: { id: grantId } })).status).toBe(transition === "accepted" ? "PENDING" : "ACTIVE");
      else expect(await db.caregiverAppointmentGrant.count()).toBe(0);
      expect(await db.auditEvent.count({ where: { action: `caregiver_appointment_grant.${transition}` } })).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER IF EXISTS family_grant_test_fail_audit ON "AuditEvent"`;
      await db.$executeRaw`DROP FUNCTION IF EXISTS family_grant_test_fail_audit()`;
    }
  });

  it("uses inclusive now/exclusive 90 days and current statuses for list/detail", async () => {
    const f = await fixture(); const grantId = await activeGrant(f);
    const eligible: string[] = [];
    for (const [at, status, included] of [
      [now, "SCHEDULED", true], [new Date(now.getTime() - 1), "SCHEDULED", false],
      [new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS), "SCHEDULED", false],
      [new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS - 1), "SCHEDULED", true],
      [now, "CANCELLED", true], [now, "COMPLETED", false], [now, "NO_SHOW", false],
    ] as const) {
      const id = await appointment(f, at, status);
      if (included) { eligible.push(id); expect((await getDelegatedAppointment(f.caregiver, grantId, id, deps)).appointmentId).toBe(id); }
      else await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    let clockCalls = 0;
    expect(new Set((await listDelegatedAppointments(f.caregiver, { grantId }, { ...deps, now: () => { clockCalls += 1; return now; } })).appointments.map((a) => a.appointmentId))).toEqual(new Set(eligible));
    expect(clockCalls).toBe(1);
  });

  it("live same-PHR appointments enter without reacceptance, changed eligibility is rechecked, new PHR never joins", async () => {
    const f = await fixture(); const grantId = await activeGrant(f);
    expect((await listDelegatedAppointments(f.caregiver, { grantId }, deps)).appointments).toHaveLength(0);
    const id = await appointment(f);
    for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
      await db.patientAppointment.update({ where: { id }, data: { status } });
      if (status === "CANCELLED") expect((await getDelegatedAppointment(f.caregiver, grantId, id, deps)).status).toBe(status);
      else await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await db.patientAppointment.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS) } });
    await expect(getDelegatedAppointment(f.caregiver, grantId, id, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const hospital = await db.hospital.create({ data: { name: "ใหม่", hospitalCode: randomUUID().slice(0, 30), status: "ACTIVE" } });
    const phr = await db.patientHospitalRelationship.create({ data: { hospitalId: hospital.id, patientProfileId: f.profileId } });
    const foreign = await appointment({ ...f, phrId: phr.id });
    await expect(getDelegatedAppointment(f.caregiver, grantId, foreign, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listDelegatedAppointments(f.caregiver, { grantId }, deps)).appointments).toHaveLength(0);
  });

  it("max-50 keyset pagination is stable for duplicate dates and cannot escape current scope/window", async () => {
    const f = await fixture(); const grantId = await activeGrant(f);
    const ids: string[] = [];
    for (let i = 0; i < 53; i++) ids.push(await appointment(f, i < 51 ? now : new Date(now.getTime() + 1000)));
    const first = await listDelegatedAppointments(f.caregiver, { grantId }, deps);
    expect(first.appointments).toHaveLength(50); expect(first.nextCursor).toBeTruthy();
    const second = await listDelegatedAppointments(f.caregiver, { grantId, cursor: first.nextCursor }, deps);
    expect(second.appointments).toHaveLength(3); expect(second.nextCursor).toBeNull();
    expect([...first.appointments, ...second.appointments].map((a) => a.appointmentId)).toEqual([...ids.slice(0, 51).sort(), ...ids.slice(51).sort()]);
    const past = await appointment(f, new Date(now.getTime() - 1));
    await expect(listDelegatedAppointments(f.caregiver, { grantId, cursor: past }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
