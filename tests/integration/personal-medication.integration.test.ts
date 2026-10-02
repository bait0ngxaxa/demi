import { randomUUID } from "node:crypto";
import { Role, type PersonalMedicationStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMedication as create, updatePersonalMedication as update, stopPersonalMedication as stop } from "@/modules/medications/services/personal-medication-service";
import { getOwnPersonalMedication as detail, listOwnPersonalMedications as list } from "@/modules/medications/services/personal-medication-query-service";
import type { PersonalMedicationDto } from "@/modules/medications/domain/personal-medication-definitions";

const db = getPrisma();
const now = new Date("2026-10-02T12:00:00.000Z");
const deps = { database: db, now: () => now };
const actorIds: string[] = [];
const personIds: string[] = [];
const hospitalIds: string[] = [];

async function actor(roles: Role[] = [Role.PATIENT], profile = true): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ข้อมูลส่วนบุคคลทดสอบ" } });
  personIds.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } } });
  actorIds.push(user.id);
  if (profile) await db.patientProfile.create({ data: { personId: person.id } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}
async function owner(a: ActorContext): Promise<string> {
  return (await db.patientProfile.findUniqueOrThrow({ where: { personId: a.personId } })).id;
}
function token(item: PersonalMedicationDto): { medicationId: string; expectedUpdatedAt: string } {
  return { medicationId: item.id, expectedUpdatedAt: item.updatedAt };
}
async function raw(a: ActorContext, status: PersonalMedicationStatus = "ACTIVE", instant = now): Promise<PersonalMedicationDto> {
  const row = await db.personalMedication.create({ data: { patientProfileId: await owner(a), medicationName: "ยาไทย", instructionText: "ข้อความลับ\nบรรทัดสอง", status, stoppedAt: status === "STOPPED" ? instant : null, createdAt: instant, updatedAt: instant } });
  return { id: row.id, medicationName: row.medicationName, instructionText: row.instructionText, status: row.status, stoppedAt: row.stoppedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function cleanup(): Promise<void> {
  await db.caregiverAppointmentGrant.deleteMany({ where: { caregiverUserId: { in: actorIds } } });
  await db.caregiverRelationship.deleteMany({ where: { caregiverUserId: { in: actorIds } } });
  await db.caregiverInvitation.deleteMany({ where: { caregiverUserId: { in: actorIds } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
  await db.personalMedication.deleteMany({ where: { patientProfile: { personId: { in: personIds } } } });
  await db.patientOsmAssignment.deleteMany({ where: { assignedByUserId: { in: actorIds } } });
  await db.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: actorIds } } });
  await db.osmHospitalRelationship.deleteMany({ where: { userId: { in: actorIds } } });
  await db.patientProfile.deleteMany({ where: { personId: { in: personIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: actorIds } } });
  await db.user.deleteMany({ where: { id: { in: actorIds } } });
  await db.person.deleteMany({ where: { id: { in: personIds } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  actorIds.length = 0; personIds.length = 0; hospitalIds.length = 0;
}

describe("PersonalMedication real PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified disposable integration environment required");
    await db.$connect();
  });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("owns all queries/mutations and returns minimal DTO without foreign existence disclosure", async () => {
    const a = await actor(); const b = await actor();
    const own = await create(a, { medicationName: " ยาไทย   A ", instructionText: " บันทึก\nเอง " }, deps);
    const foreign = await create(b, { medicationName: "ยา B" }, deps);
    expect(own).toMatchObject({ medicationName: "ยาไทย A", instructionText: "บันทึก\nเอง", status: "ACTIVE", stoppedAt: null });
    expect(Object.keys(own).sort()).toEqual(["id", "medicationName", "instructionText", "status", "stoppedAt", "createdAt", "updatedAt"].sort());
    expect((await list(a, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([own.id]);
    for (const id of [foreign.id, randomUUID()]) {
      await expect(detail(a, id, db)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
      await expect(update(a, { ...token(foreign), medicationId: id, medicationName: "โจมตี" }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(stop(a, { ...token(foreign), medicationId: id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(list(a, { status: "ACTIVE", cursor: id }, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await detail(b, foreign.id, db)).toEqual(foreign);
  });

  it("fails closed on persisted inactive/removed role/missing profile/exact identity mismatch", async () => {
    const a = await actor(); const b = await actor(); const noProfile = await actor([Role.PATIENT], false);
    const item = await raw(a);
    const denied = [null, { ...a, userId: b.userId }, { ...a, personId: b.personId }, noProfile];
    for (const bad of denied) {
      await expect(list(bad, { status: "ACTIVE" }, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(create(bad, { medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await db.user.update({ where: { id: a.userId }, data: { status: "SUSPENDED" } });
    await expect(detail(a, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(update(a, { ...token(item), medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({ where: { id: a.userId }, data: { status: "ACTIVE" } });
    await db.userRole.deleteMany({ where: { userId: a.userId } });
    await expect(stop(a, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies actual OSM/assigned OSM, Hospital MEMBER/OWNER, ADMIN and active Family/appointment caregiver grants", async () => {
    const patient = await actor(); const item = await raw(patient); const profileId = await owner(patient);
    const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 30), name: "ทดสอบ", status: "ACTIVE" } }); hospitalIds.push(hospital.id);
    const phr = await db.patientHospitalRelationship.create({ data: { patientProfileId: profileId, hospitalId: hospital.id } });
    const admin = await actor([Role.ADMIN], false);
    const osm = await actor([Role.OSM], false);
    const assignedOsm = await actor([Role.OSM], false);
    const members: ActorContext[] = [];
    for (const membershipType of ["MEMBER", "OWNER"] as const) {
      const member = await actor([Role.HOSPITAL], false);
      await db.hospitalMembership.create({ data: { userId: member.userId, hospitalId: hospital.id, membershipType, status: "ACTIVE" } });
      members.push({ ...member, hospitalMemberships: [{ hospitalId: hospital.id, membershipType, profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" }] });
    }
    await db.osmHospitalRelationship.create({ data: { userId: assignedOsm.userId, hospitalId: hospital.id, status: "ACTIVE" } });
    await db.patientOsmAssignment.create({ data: { patientHospitalRelationshipId: phr.id, osmUserId: assignedOsm.userId, assignedByUserId: admin.userId } });
    const caregiver = await actor([], false);
    const invitation = await db.caregiverInvitation.create({ data: { patientProfileId: profileId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, issuedByUserId: patient.userId, tokenHash: randomUUID(), status: "ACCEPTED", acceptanceContractVersion: "family-delegation-v1", issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), acceptedAt: now } });
    const family = await db.caregiverRelationship.create({ data: { patientProfileId: profileId, caregiverUserId: caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now } });
    const deniedActors = [osm, assignedOsm, ...members, admin, caregiver];
    for (const denied of deniedActors) {
      await expect(list(denied, { status: "ACTIVE" }, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(detail(denied, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(create(denied, { medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(update(denied, { ...token(item), medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(stop(denied, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await db.caregiverAppointmentGrant.create({ data: { caregiverRelationshipId: family.id, patientProfileId: profileId, patientPersonId: patient.personId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, patientHospitalRelationshipId: phr.id, proposedByUserId: patient.userId, proposedAt: now, contractVersion: "family-appointment-read-v1", status: "ACTIVE", acceptedAt: now, acceptedByUserId: caregiver.userId } });
    await expect(detail(caregiver, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stop(caregiver, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.userRole.create({ data: { userId: caregiver.userId, role: "PATIENT" } });
    await db.patientProfile.create({ data: { personId: caregiver.personId } });
    const patientCaregiver = { ...caregiver, roles: [Role.PATIENT] };
    const selfItem = await create(patientCaregiver, { medicationName: "รายการส่วนตัว" }, deps);
    expect((await list(patientCaregiver, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([selfItem.id]);
    await expect(detail(patientCaregiver, item.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(update(patientCaregiver, { ...token(item), medicationName: "เปลี่ยน" }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stop(patientCaregiver, token(item), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("multi-role Patient and Patient caregiver/ADMIN access their own SELF only", async () => {
    const other = await actor(); const foreign = await raw(other);
    for (const roles of [[Role.PATIENT, Role.OSM], [Role.PATIENT, Role.HOSPITAL], [Role.PATIENT, Role.ADMIN]] as Role[][]) {
      const a = await actor(roles); const own = await create(a, { medicationName: "ยา" }, deps);
      expect((await list(a, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([own.id]);
      await expect(detail(a, foreign.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(stop(a, token(foreign), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("enforces FK, enum, CHECK, immutable identity, stop text preservation and every terminal UPDATE", async () => {
    const a = await actor(); const b = await actor(); const item = await raw(a);
    const profileId = await owner(a);
    await expect(db.personalMedication.create({ data: { patientProfileId: randomUUID(), medicationName: "ยา" } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.$executeRaw`INSERT INTO "PersonalMedication" ("id", "patientProfileId", "medicationName", "status", "updatedAt") VALUES (${randomUUID()}::uuid, ${profileId}::uuid, 'ยา', 'INVALID', NOW())`).rejects.toThrow();
    await expect(db.personalMedication.create({ data: { patientProfileId: profileId, medicationName: "ยา", stoppedAt: now } })).rejects.toThrow();
    await expect(db.personalMedication.create({ data: { patientProfileId: profileId, medicationName: "ยา", status: "STOPPED" } })).rejects.toThrow();
    const duplicate = await raw(a); expect(duplicate.id).not.toBe(item.id);
    for (const data of [{ id: randomUUID() }, { patientProfileId: await owner(b) }, { createdAt: new Date(now.getTime() + 1) }, { status: "STOPPED" as const, stoppedAt: now, medicationName: "เปลี่ยน" }, { status: "STOPPED" as const, stoppedAt: now, instructionText: null }]) {
      await expect(db.personalMedication.update({ where: { id: item.id }, data })).rejects.toThrow();
    }
    const terminal = await stop(a, token(item), deps);
    expect(terminal).toMatchObject({ status: "STOPPED", medicationName: item.medicationName, instructionText: item.instructionText });
    for (const data of [{ status: "ACTIVE" as const, stoppedAt: null }, { medicationName: "เปลี่ยน" }, { instructionText: null }, { updatedAt: new Date(now.getTime() + 10) }, { stoppedAt: new Date(now.getTime() + 10) }]) {
      await expect(db.personalMedication.update({ where: { id: item.id }, data })).rejects.toThrow();
    }
    await expect(db.$executeRaw`UPDATE "PersonalMedication" SET "medicationName" = "medicationName" WHERE "id" = ${item.id}::uuid`).rejects.toThrow();
    await expect(db.patientProfile.delete({ where: { id: profileId } })).rejects.toThrow();
    expect(await detail(a, item.id, db)).toEqual(terminal);
  });

  it("full replacement/no-op advance monotonic version, and terminal replay conflicts without extra audits", async () => {
    const a = await actor(); const first = await create(a, { medicationName: "ยา", instructionText: "เดิม" }, deps);
    const second = await update(a, { ...token(first), medicationName: "ยา" }, deps);
    expect(second.instructionText).toBeNull(); expect(new Date(second.updatedAt).getTime()).toBe(now.getTime() + 1);
    const third = await update(a, { ...token(second), medicationName: "ยา" }, deps);
    expect(new Date(third.updatedAt).getTime()).toBe(now.getTime() + 2);
    await expect(update(a, { ...token(first), medicationName: "ใหม่" }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    const terminal = await stop(a, token(third), deps);
    for (const expectedUpdatedAt of [third.updatedAt, terminal.updatedAt]) {
      await expect(stop(a, { medicationId: first.id, expectedUpdatedAt }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(update(a, { medicationId: first.id, expectedUpdatedAt, medicationName: "ใหม่" }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(await detail(a, first.id, db)).toEqual(terminal);
    const audits = await db.auditEvent.findMany({ where: { resourceId: first.id }, select: { action: true, actorUserId: true, resourceType: true, metadata: true } });
    expect(audits.map((x) => x.action).sort()).toEqual(["personal_medication.created", "personal_medication.updated", "personal_medication.updated", "personal_medication.stopped"].sort());
    for (const audit of audits) expect(audit).toMatchObject({ actorUserId: a.userId, resourceType: "PersonalMedication", metadata: null });
  });

  it.each(["update/update", "update/stop", "stop/update", "stop/stop"])("serializable %s race has exactly one winner and one audit", async (scenario) => {
    const a = await actor(); const item = await raw(a);
    const attempts = scenario.split("/").map((operation) => operation === "stop" ? stop(a, token(item), deps) : update(a, { ...token(item), medicationName: "ใหม่" }, deps));
    const results = await Promise.allSettled(attempts);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((x) => x.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toMatchObject({ code: "CONFLICT" });
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(1);
    expect(new Date((await detail(a, item.id, db)).updatedAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it.each(["create", "update", "stop"])("audit failure rolls back %s", async (operation) => {
    const a = await actor(); const original = await raw(a);
    await db.$executeRawUnsafe(`CREATE FUNCTION medication_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" LIKE 'personal_medication.%' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER medication_test_fail_audit_trigger BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION medication_test_fail_audit()`);
    try {
      const mutation = operation === "create" ? create(a, { medicationName: "ข้อความลับ" }, deps) : operation === "update" ? update(a, { ...token(original), medicationName: "ข้อความลับ" }, deps) : stop(a, token(original), deps);
      await expect(mutation).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await detail(a, original.id, db)).toEqual(original);
      expect(await db.personalMedication.count({ where: { patientProfileId: await owner(a) } })).toBe(1);
      expect(await db.auditEvent.count({ where: { actorUserId: a.userId } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER medication_test_fail_audit_trigger ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION medication_test_fail_audit()');
    }
  });

  it.each(["ACTIVE", "STOPPED"] as const)("bounded deterministic %s cursor reaches >50 items and uses ordering index", async (status) => {
    const a = await actor(); const b = await actor();
    const ids: { id: string; at: number }[] = [];
    for (let i = 0; i < 54; i++) { const at = now.getTime() + Math.floor(i / 10); const row = await raw(a, status, new Date(at)); ids.push({ id: row.id, at }); }
    const foreign = await raw(b, status);
    const first = await list(a, { status }, db); const second = await list(a, { status, cursor: first.nextCursor }, db);
    expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(4); expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((x) => x.id)).toEqual(ids.sort((x, y) => y.at - x.at || y.id.localeCompare(x.id)).map((x) => x.id));
    await expect(list(a, { status, cursor: foreign.id }, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const profileId = await owner(a);
    // Small fixtures may prefer a sequential scan. Verify the matching ordered index path is usable.
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return status === "ACTIVE"
        ? tx.$queryRaw<{ "QUERY PLAN": string }[]>`EXPLAIN SELECT "id", "createdAt" FROM "PersonalMedication" WHERE "patientProfileId" = ${profileId}::uuid AND "status" = 'ACTIVE' ORDER BY "createdAt" DESC, "id" DESC LIMIT 51`
        : tx.$queryRaw<{ "QUERY PLAN": string }[]>`EXPLAIN SELECT "id", "stoppedAt" FROM "PersonalMedication" WHERE "patientProfileId" = ${profileId}::uuid AND "status" = 'STOPPED' ORDER BY "stoppedAt" DESC, "id" DESC LIMIT 51`;
    });
    expect(JSON.stringify(plan)).toContain(status === "ACTIVE" ? "PersonalMedication_active_order_idx" : "PersonalMedication_stopped_order_idx");
    expect(JSON.stringify(plan)).not.toContain('"Sort');
  });
});
