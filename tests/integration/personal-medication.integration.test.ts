import { randomUUID } from "node:crypto";
import { Prisma, Role, type PrismaClient, type PersonalMedicationStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMedication as create, updatePersonalMedication as update, stopPersonalMedication as stop, replacePersonalMedicationSchedules as replace } from "@/modules/medications/services/personal-medication-service";
import { getOwnPersonalMedication as detail, listOwnPersonalMedications as list } from "@/modules/medications/services/personal-medication-query-service";
import type { PersonalMedicationDto } from "@/modules/medications/domain/personal-medication-definitions";
import { fromMedicationTimeCarrier, toMedicationTimeCarrier } from "@/modules/medications/domain/medication-local-time";
import { MEDICATION_SCHEDULE_MAX_TIMES } from "@/modules/medications/domain/personal-medication-definitions";
import { createReminderSourceKey, type MedicationReminderOccurrenceSource } from "@/modules/medications/domain/medication-reminder-occurrence";
import { listOwnPersonalMedicationReminderOccurrences as sources, revalidateOwnPersonalMedicationReminderOccurrence as revalidate } from "@/modules/medications/services/medication-reminder-occurrence-query-service";

const db = getPrisma();
const now = new Date("2026-10-02T12:00:00.000Z");
const deps = { database: db, now: () => now };
const sourceWindow = { from: "2026-10-03T17:00:00.000Z", to: "2026-10-04T17:00:00.000Z" };
function sourceQuery(medicationId: string): { medicationId: string; from: string; to: string } {
  return { medicationId, ...sourceWindow };
}
function unknownSource(medicationId: string): MedicationReminderOccurrenceSource {
  return { sourceKey: createReminderSourceKey("55555555-5555-4555-8555-555555555555", "2026-10-04"), sourceVersion: 1, kind: "PERSONAL_MEDICATION_DAILY", personalMedicationId: medicationId, localDate: "2026-10-04", localTime: "08:00", dueAt: "2026-10-04T01:00:00.000Z", aggregateVersion: now.toISOString() };
}
const actorIds: string[] = [];
const personIds: string[] = [];
const hospitalIds: string[] = [];
let verifiedDisposable = false;

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
  if (!verifiedDisposable) throw new Error("Disposable verification required for child TRUNCATE");
  // This suite runs alone/sequentially in its verified local disposable database.
  await db.$executeRaw`TRUNCATE TABLE "MedicationSchedule"`;
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

function latch(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function waitForDatabaseLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await db.$queryRaw<{ waiting: boolean }[]>`SELECT "wait_event_type" = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid}`;
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected database lock wait was not observed");
}

describe("PersonalMedication real PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified disposable integration environment required");
    await db.$connect();
    verifiedDisposable = true;
  });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("source lifecycle preserves retained identity, revalidates known elapsed sources and never writes/audits", async () => {
    const a = await actor(); const item = await create(a, { medicationName: "ยาไทย", instructionText: "ข้อความส่วนตัว" }, deps);
    expect((await sources(a, sourceQuery(item.id), deps)).items).toEqual([]);
    let current = await replace(a, { ...token(item), times: ["23:59", "08:00", "00:00"] }, deps);
    async function read(): Promise<MedicationReminderOccurrenceSource[]> {
      const before = await db.personalMedication.findUniqueOrThrow({ where: { id: item.id }, select: { updatedAt: true } });
      const audits = await db.auditEvent.count({ where: { resourceId: item.id } });
      const result = await sources(a, sourceQuery(item.id), deps);
      for (const known of result.items) expect(await revalidate(a, known, { database: db, now: () => { throw new Error("Revalidation must not read clock"); } })).toEqual({ status: "CURRENT", aggregateVersion: current.updatedAt });
      expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(audits);
      expect(await db.personalMedication.findUniqueOrThrow({ where: { id: item.id }, select: { updatedAt: true } })).toEqual(before);
      return result.items;
    }
    const first = await read();
    expect(first.map((x) => x.dueAt)).toEqual(["2026-10-03T17:00:00.000Z", "2026-10-04T01:00:00.000Z", "2026-10-04T16:59:00.000Z"]);
    expect(first.map((x) => x.localTime)).toEqual(["00:00", "08:00", "23:59"]);
    const old = first[1];
    const children = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" }, select: { id: true, localTime: true } });
    expect(first.map((x) => x.sourceKey)).toEqual(children.map((child) => createReminderSourceKey(child.id, "2026-10-04")));
    current = { ...current, ...await update(a, { ...token(current), medicationName: "แก้ข้อความ" }, deps) };
    expect((await read()).map((x) => x.sourceKey)).toEqual(first.map((x) => x.sourceKey));
    expect(await revalidate(a, old, deps)).toEqual({ status: "CURRENT", aggregateVersion: current.updatedAt });
    current = await replace(a, { ...token(current), times: ["08:00", "00:00", "23:59"] }, deps);
    expect((await read()).map((x) => x.sourceKey)).toEqual(first.map((x) => x.sourceKey));
    expect(await revalidate(a, old, deps)).toEqual({ status: "CURRENT", aggregateVersion: current.updatedAt });
    expect((await sources(a, sourceQuery(item.id), { database: db, now: () => new Date(sourceWindow.to) })).items).toEqual([]);
    expect(await revalidate(a, old, { database: db, now: () => new Date(sourceWindow.to) })).toEqual({ status: "CURRENT", aggregateVersion: current.updatedAt });
    current = await replace(a, { ...token(current), times: ["00:00", "23:59"] }, deps);
    expect(await revalidate(a, old, deps)).toEqual({ status: "STALE" });
    current = await replace(a, { ...token(current), times: ["00:00", "08:00", "23:59"] }, deps);
    const readded = (await read())[1]; expect(readded.sourceKey).not.toBe(old.sourceKey);
    expect(await revalidate(a, old, deps)).toEqual({ status: "STALE" });
    const audits = await db.auditEvent.count({ where: { resourceId: item.id } });
    current = { ...current, ...await stop(a, token(current), deps) };
    expect((await sources(a, sourceQuery(item.id), deps)).items).toEqual([]);
    expect(await revalidate(a, readded, deps)).toEqual({ status: "STALE" });
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(audits + 1);
    const retracked = await create(a, { medicationName: item.medicationName }, deps);
    expect(retracked.id).not.toBe(item.id); expect((await sources(a, sourceQuery(retracked.id), deps)).items).toEqual([]);
  });

  it.each(["text", "identical", "stop"])("source pagination conflicts after %s but retains keys only when structurally backed", async (change) => {
    const a = await actor(); const item = await raw(a);
    const times = Array.from({ length: 101 }, (_, minute) => `${String(8 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
    const scheduled = await replace(a, { ...token(item), times }, deps);
    const page = await sources(a, sourceQuery(item.id), deps);
    expect(page.items).toHaveLength(100); expect(page.nextCursor).not.toBeNull();
    const next = await sources(a, { ...sourceQuery(item.id), cursor: page.nextCursor }, { database: db, now: () => { throw new Error("Continuation must not read clock"); } });
    expect(next.items).toHaveLength(1); expect(next.evaluationAsOf).toBe(page.evaluationAsOf);
    expect(new Set([...page.items, ...next.items].map((x) => x.sourceKey)).size).toBe(101);
    const version = change === "text" ? await update(a, { ...token(scheduled), medicationName: "ข้อความใหม่" }, deps) : change === "identical" ? await replace(a, { ...token(scheduled), times: [...times].reverse() }, deps) : await stop(a, token(scheduled), deps);
    const audits = await db.auditEvent.count({ where: { resourceId: item.id } });
    await expect(sources(a, { ...sourceQuery(item.id), cursor: page.nextCursor }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await revalidate(a, page.items[0], deps)).toEqual(change === "stop" ? { status: "STALE" } : { status: "CURRENT", aggregateVersion: version.updatedAt });
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(audits);
    expect((await db.personalMedication.findUniqueOrThrow({ where: { id: item.id } })).updatedAt.toISOString()).toBe(version.updatedAt);
  });

  it.each(["replace", "stop", "text"])("source reads coherent old snapshot while %s commits, then sees fresh committed truth", async (change) => {
    const a = await actor(); const item = await raw(a);
    const scheduled = await replace(a, { ...token(item), times: ["08:00"] }, deps);
    const initial = await sources(a, sourceQuery(item.id), deps);
    const held = latch(); const release = latch();
    const database = { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, property) {
        if (property !== "person") return Reflect.get(target, property);
        return { findFirst: async (args: Prisma.PersonFindFirstArgs) => { const result = await tx.person.findFirst(args); held.release(); await release.promise; return result; } };
      } });
      return operation(proxy);
    }, { ...options, timeout: 10000 }) } as unknown as PrismaClient;
    const pending = sources(a, sourceQuery(item.id), { ...deps, database });
    const settled = Promise.allSettled([pending]);
    await held.promise;
    try {
      if (change === "replace") await replace(a, { ...token(scheduled), times: ["11:00"] }, deps);
      else if (change === "stop") await stop(a, token(scheduled), deps);
      else await update(a, { ...token(scheduled), medicationName: "แก้ไข" }, deps);
    } finally { release.release(); }
    const result = (await settled)[0];
    expect(result.status).toBe("fulfilled"); if (result.status === "fulfilled") expect(result.value).toEqual(initial);
    const fresh = await sources(a, sourceQuery(item.id), deps);
    expect(fresh.aggregateVersion).not.toBe(initial.aggregateVersion);
    expect(fresh.items.map((x) => x.localTime)).toEqual(change === "stop" ? [] : [change === "replace" ? "11:00" : "08:00"]);
    expect(await revalidate(a, initial.items[0], deps)).toEqual(change === "text" ? { status: "CURRENT", aggregateVersion: fresh.aggregateVersion } : { status: "STALE" });
  });

  it.each(["UTC", "Asia/Bangkok"])("source timezone evidence: process TZ and transaction session %s", async (timezone) => {
    const a = await actor(); const item = await raw(a);
    await replace(a, { ...token(item), times: ["00:00", "08:00", "23:59"] }, deps);
    const database = { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
      return operation(tx);
    }, options) } as unknown as PrismaClient;
    const result = await sources(a, sourceQuery(item.id), { ...deps, database });
    expect(result.items.map((x) => x.dueAt)).toEqual(["2026-10-03T17:00:00.000Z", "2026-10-04T01:00:00.000Z", "2026-10-04T16:59:00.000Z"]);
    expect(result).toEqual(await sources(a, sourceQuery(item.id), deps));
  });

  it("source continuation rechecks persisted eligibility after account/role changes without audit", async () => {
    const a = await actor(); const item = await raw(a);
    const times = Array.from({ length: 101 }, (_, minute) => `${String(8 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
    const current = await replace(a, { ...token(item), times }, deps);
    const first = await sources(a, sourceQuery(item.id), deps);
    const audits = await db.auditEvent.count({ where: { resourceId: item.id } });
    await db.user.update({ where: { id: a.userId }, data: { status: "SUSPENDED" } });
    await expect(sources(a, { ...sourceQuery(item.id), cursor: first.nextCursor }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(a, first.items[0], deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({ where: { id: a.userId }, data: { status: "ACTIVE" } });
    await db.userRole.deleteMany({ where: { userId: a.userId } });
    await expect(sources(a, { ...sourceQuery(item.id), cursor: first.nextCursor }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(a, first.items[0], deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(audits);
    expect((await db.personalMedication.findUniqueOrThrow({ where: { id: item.id } })).updatedAt.toISOString()).toBe(current.updatedAt);
  });

  it.each([["00:00", "09:00", 1], ["03:00", "11:00", 1], ["03:00", "09:00", 0], ["01:00", "08:00", 0]] as const)("source real edit at UTC %s to Bangkok %s discovers %s today", async (clock, time, count) => {
    const a = await actor(); const item = await raw(a);
    const original = await replace(a, { ...token(item), times: ["08:00"] }, deps);
    const old = (await sources(a, sourceQuery(item.id), deps)).items[0];
    await replace(a, { ...token(original), times: [time] }, deps);
    const result = await sources(a, sourceQuery(item.id), { database: db, now: () => new Date(`2026-10-04T${clock}:00.000Z`) });
    expect(result.items).toHaveLength(count); if (count) expect(result.items[0].localTime).toBe(time);
    expect(await revalidate(a, old, deps)).toMatchObject({ status: time === "08:00" ? "CURRENT" : "STALE" });
  });

  it("replaces/removes/clears sorted schedules, retains unchanged rows and keeps lists minimal", async () => {
    const a = await actor(); const original = await raw(a);
    expect((await detail(a, original.id, db)).schedules).toEqual([]);
    const first = await replace(a, { ...token(original), times: ["23:59", "08:00", "00:00"] }, deps);
    expect(first.schedules).toEqual([{ localTime: "00:00" }, { localTime: "08:00" }, { localTime: "23:59" }]);
    const rows = await db.medicationSchedule.findMany({ where: { personalMedicationId: original.id }, orderBy: { localTime: "asc" } });
    const second = await replace(a, { ...token(first), times: ["08:00", "00:00", "13:30"] }, deps);
    const nextRows = await db.medicationSchedule.findMany({ where: { personalMedicationId: original.id }, orderBy: { localTime: "asc" } });
    expect(nextRows.slice(0, 2)).toEqual(rows.slice(0, 2));
    expect(nextRows[2].id).not.toBe(rows[2].id);
    const identical = await replace(a, { ...token(second), times: ["13:30", "00:00", "08:00"] }, deps);
    expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: original.id }, orderBy: { localTime: "asc" } })).toEqual(nextRows);
    expect(new Date(identical.updatedAt).getTime()).toBe(now.getTime() + 3);
    const removed = await replace(a, { ...token(identical), times: ["08:00", "13:30"] }, deps);
    expect(removed.schedules).toEqual([{ localTime: "08:00" }, { localTime: "13:30" }]);
    const cleared = await replace(a, { ...token(removed), times: [] }, deps);
    const emptyNoOp = await replace(a, { ...token(cleared), times: [] }, deps);
    expect(emptyNoOp.schedules).toEqual([]);
    for (const item of [first, second, identical, removed, cleared, emptyNoOp]) {
      expect(item).toMatchObject({ medicationName: original.medicationName, instructionText: original.instructionText, status: "ACTIVE", createdAt: original.createdAt, stoppedAt: null });
      expect(Object.keys(item).sort()).toEqual([...Object.keys(original), "schedules"].sort());
      for (const schedule of item.schedules) expect(Object.keys(schedule)).toEqual(["localTime"]);
    }
    expect(Object.keys((await list(a, { status: "ACTIVE" }, db)).items[0]).sort()).toEqual(Object.keys(original).sort());
    const audits = await db.auditEvent.findMany({ where: { resourceId: original.id } });
    expect(audits).toHaveLength(6);
    for (const audit of audits) expect(audit).toMatchObject({ actorUserId: a.userId, resourceType: "PersonalMedication", action: "personal_medication.schedule_updated", metadata: null });
    await expect(replace(a, { ...token(first), times: [] }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await detail(a, original.id, db); await list(a, { status: "ACTIVE" }, db);
    expect(await db.auditEvent.count({ where: { resourceId: original.id } })).toBe(6);
  });

  it.each(["UTC", "Asia/Bangkok"])("native TIME round-trip has no offset in DB session %s", async (timezone) => {
    const a = await actor(); const item = await raw(a);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
      const inserted = await tx.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") } });
      expect(fromMedicationTimeCarrier(inserted.localTime)).toBe("08:00");
      const read = await tx.medicationSchedule.findFirstOrThrow({ where: { personalMedicationId: item.id } });
      expect(fromMedicationTimeCarrier(read.localTime)).toBe("08:00");
      const native = await tx.$queryRaw<{ time: string; type: string }[]>`SELECT "localTime"::text AS time, pg_typeof("localTime")::text AS type FROM "MedicationSchedule" WHERE "personalMedicationId" = ${item.id}::uuid`;
      expect(native).toEqual([{ time: "08:00:00", type: "time without time zone" }]);
    });
    expect((await detail(a, item.id, db)).schedules).toEqual([{ localTime: "08:00" }]);
  });

  it("enforces same-parent UNIQUE, native minute/range CHECK and FK RESTRICT", async () => {
    const a = await actor(); const item = await raw(a); const other = await raw(a);
    await db.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") } });
    await db.medicationSchedule.create({ data: { personalMedicationId: other.id, localTime: toMedicationTimeCarrier("08:00") } });
    await expect(db.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") } })).rejects.toMatchObject({ code: "P2002" });
    for (const invalid of ["08:01:01", "08:01:00.000001", "24:00:00"]) {
      await expect(db.$executeRaw`INSERT INTO "MedicationSchedule" ("id", "personalMedicationId", "localTime") VALUES (${randomUUID()}::uuid, ${item.id}::uuid, ${invalid}::time)`).rejects.toThrow();
    }
    await expect(db.medicationSchedule.create({ data: { personalMedicationId: randomUUID(), localTime: toMedicationTimeCarrier("00:00") } })).rejects.toThrow();
    await expect(db.personalMedication.delete({ where: { id: item.id } })).rejects.toMatchObject({ code: "P2003" });
    const constraints = await db.$queryRaw<{ name: string; definition: string }[]>`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = '"MedicationSchedule"'::regclass`;
    expect(constraints.find((x) => x.name === "MedicationSchedule_personalMedicationId_fkey")?.definition).toContain("ON UPDATE RESTRICT ON DELETE RESTRICT");
  });

  it("rejects every child UPDATE and preserves exact STOPPED rows, including retracking with zero", async () => {
    const a = await actor(); const item = await raw(a); const other = await raw(a);
    const scheduled = await replace(a, { ...token(item), times: ["08:00", "20:00"] }, deps);
    const original = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } });
    const child = original[0];
    for (const data of [{ localTime: toMedicationTimeCarrier("09:00") }, { personalMedicationId: other.id }, { id: randomUUID() }, { createdAt: new Date(now.getTime() + 1) }]) await expect(db.medicationSchedule.update({ where: { id: child.id }, data })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "MedicationSchedule" SET "localTime" = "localTime" WHERE "id" = ${child.id}::uuid`).rejects.toThrow();
    const stopped = await stop(a, token(scheduled), deps);
    expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } })).toEqual(original);
    expect((await detail(a, item.id, db)).schedules).toEqual(scheduled.schedules);
    for (const times of [[], ["08:00", "20:00"], ["09:00"]]) await expect(replace(a, { ...token(stopped), times }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(db.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("09:00") } })).rejects.toThrow();
    await expect(db.medicationSchedule.delete({ where: { id: child.id } })).rejects.toThrow();
    await expect(db.medicationSchedule.update({ where: { id: child.id }, data: { personalMedicationId: other.id } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "MedicationSchedule" SET "id" = "id" WHERE "id" = ${child.id}::uuid`).rejects.toThrow();
    const fresh = await create(a, { medicationName: item.medicationName }, deps);
    expect((await detail(a, fresh.id, db)).schedules).toEqual([]);
    const audits = await db.auditEvent.findMany({ where: { resourceId: item.id }, select: { action: true } });
    expect(audits.map((x) => x.action).sort()).toEqual(["personal_medication.schedule_updated", "personal_medication.stopped"].sort());
  });

  it.each(["replace", "edit", "stop"])("Serializable replacement vs %s same-token race has exactly one winner", async (other) => {
    const a = await actor(); const original = await raw(a);
    const item = await replace(a, { ...token(original), times: ["08:00"] }, deps);
    const results = await Promise.allSettled([
      replace(a, { ...token(item), times: ["13:30"] }, deps),
      other === "replace" ? replace(a, { ...token(item), times: ["20:00"] }, deps) : other === "edit" ? update(a, { ...token(item), medicationName: "แก้ไข" }, deps) : stop(a, token(item), deps),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((x) => x.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toMatchObject({ code: "CONFLICT" });
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(2);
    const current = await detail(a, item.id, db);
    if (current.status === "STOPPED") expect(current.schedules).toEqual(item.schedules);
    else expect(current.schedules).toEqual(other === "replace" && results[1].status === "fulfilled" ? [{ localTime: "20:00" }] : other === "edit" && results[1].status === "fulfilled" ? item.schedules : [{ localTime: "13:30" }]);
  });

  it.each(["stop-first", "replace-first"])("both aggregate winner orders: %s", async (order) => {
    const a = await actor(); const original = await raw(a);
    const item = await replace(a, { ...token(original), times: ["08:00"] }, deps);
    const before = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id } });
    if (order === "stop-first") {
      await stop(a, token(item), deps);
      await expect(replace(a, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id } })).toEqual(before);
    } else {
      const replaced = await replace(a, { ...token(item), times: ["13:30"] }, deps);
      await expect(stop(a, token(item), deps)).rejects.toMatchObject({ code: "CONFLICT" });
      const after = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id } });
      await stop(a, token(replaced), deps);
      expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id } })).toEqual(after);
    }
  });

  it.each(["stop-first", "replace-first"])("overlapping service race deterministically commits %s", async (order) => {
    const a = await actor(); const original = await raw(a);
    const item = await replace(a, { ...token(original), times: ["08:00"] }, deps);
    const held = latch(); const release = latch(); const waiterStarted = latch(); let waiterPid = 0;
    function database(hold: boolean): PrismaClient {
      return { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
        if (!hold) { const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; waiterPid = rows[0].pid; waiterStarted.release(); }
        const proxy = new Proxy(tx, { get(target, key) {
          if (!hold || key !== "personalMedication") return Reflect.get(target, key);
          return new Proxy(tx.personalMedication, { get(delegate, method) {
            if (method !== "updateMany") return Reflect.get(delegate, method);
            return async (args: Prisma.PersonalMedicationUpdateManyArgs) => { const result = await tx.personalMedication.updateMany(args); held.release(); await release.promise; return result; };
          } });
        } });
        return operation(proxy);
      }, { ...options, timeout: 10000 }) } as unknown as PrismaClient;
    }
    const holderDeps = { ...deps, database: database(true) }; const waiterDeps = { ...deps, database: database(false) };
    const holder = order === "stop-first" ? stop(a, token(item), holderDeps) : replace(a, { ...token(item), times: ["20:00"] }, holderDeps);
    await held.promise;
    const waiter = order === "stop-first" ? replace(a, { ...token(item), times: [] }, waiterDeps) : stop(a, token(item), waiterDeps);
    const resultsPromise = Promise.allSettled([holder, waiter]);
    try { await waiterStarted.promise; await waitForDatabaseLock(waiterPid); } finally { release.release(); }
    const results = await resultsPromise;
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status === "rejected" ? results[1].reason : null).toMatchObject({ code: "CONFLICT" });
    const latest = await detail(a, item.id, db);
    expect(latest.status).toBe(order === "stop-first" ? "STOPPED" : "ACTIVE");
    expect(latest.schedules).toEqual([{ localTime: order === "stop-first" ? "08:00" : "20:00" }]);
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(2);
    if (order === "replace-first") { await stop(a, token(latest), deps); expect((await detail(a, item.id, db)).schedules).toEqual(latest.schedules); }
  });

  it("persists and returns every representable minute without truncation", async () => {
    const a = await actor(); const item = await raw(a);
    const times = Array.from({ length: MEDICATION_SCHEDULE_MAX_TIMES }, (_, minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
    const result = await replace(a, { ...token(item), times: [...times].reverse() }, deps);
    expect(result.schedules.map((x) => x.localTime)).toEqual(times);
    expect((await detail(a, item.id, db)).schedules).toHaveLength(MEDICATION_SCHEDULE_MAX_TIMES);
  });

  it("a real child uniqueness failure rolls back version and deleted rows without audit", async () => {
    const a = await actor(); const item = await raw(a);
    const original = await replace(a, { ...token(item), times: ["08:00", "20:00"] }, deps);
    const children = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } });
    const database = { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== "medicationSchedule") return Reflect.get(target, key);
        return new Proxy(tx.medicationSchedule, { get(delegate, method) {
          if (method !== "createMany") return Reflect.get(delegate, method);
          return async () => tx.medicationSchedule.createMany({ data: [
            { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("13:30") },
            { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") },
          ] });
        } });
      } });
      return operation(proxy);
    }, options) } as unknown as PrismaClient;
    await expect(replace(a, { ...token(original), times: ["08:00", "13:30"] }, { ...deps, database })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await detail(a, item.id, db)).toEqual(original);
    expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } })).toEqual(children);
    expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(1);
  });

  it("audit failure rolls back parent claim and child deletes/inserts", async () => {
    const a = await actor(); const item = await raw(a);
    const original = await replace(a, { ...token(item), times: ["08:00", "20:00"] }, deps);
    const children = await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION medication_schedule_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'personal_medication.schedule_updated' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER medication_schedule_test_fail_audit_trigger BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION medication_schedule_test_fail_audit()`);
    try {
      await expect(replace(a, { ...token(original), times: ["08:00", "13:30"] }, deps)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await detail(a, item.id, db)).toEqual(original);
      expect(await db.medicationSchedule.findMany({ where: { personalMedicationId: item.id }, orderBy: { localTime: "asc" } })).toEqual(children);
      expect(await db.auditEvent.count({ where: { resourceId: item.id } })).toBe(1);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER medication_schedule_test_fail_audit_trigger ON "AuditEvent"');
      await db.$executeRawUnsafe('DROP FUNCTION medication_schedule_test_fail_audit()');
    }
  });

  it("detail stays in one consistent snapshot when replacement commits after SELF resolution", async () => {
    const a = await actor(); const item = await raw(a);
    const original = await replace(a, { ...token(item), times: ["08:00"] }, deps);
    const database = { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== "person") return Reflect.get(target, key);
        return { findFirst: async (args: Prisma.PersonFindFirstArgs) => {
          const person = await tx.person.findFirst(args);
          await replace(a, { ...token(original), times: ["20:00"] }, deps);
          return person;
        } };
      } });
      return operation(proxy);
    }, options) } as unknown as PrismaClient;
    expect(await detail(a, item.id, database)).toEqual(original);
    expect((await detail(a, item.id, db)).schedules).toEqual([{ localTime: "20:00" }]);
  });

  for (const isolationLevel of [Prisma.TransactionIsolationLevel.ReadCommitted, Prisma.TransactionIsolationLevel.Serializable]) {
    for (const operation of ["insert", "delete"] as const) {
      for (const order of ["stop-first", "child-first"] as const) {
        it(`raw ${operation} vs stop: ${isolationLevel}, ${order} locks parent before authorizing`, async () => {
          const a = await actor(); const item = await raw(a);
          if (operation === "delete") await db.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") } });
          const held = latch(); const release = latch(); const waiterStarted = latch(); let waiterPid = 0;
          const childWrite = async (tx: Prisma.TransactionClient): Promise<void> => {
            if (operation === "insert") await tx.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("08:00") } });
            else await tx.medicationSchedule.deleteMany({ where: { personalMedicationId: item.id } });
          };
          const stopWrite = async (tx: Prisma.TransactionClient): Promise<void> => {
            await tx.$executeRaw`UPDATE "PersonalMedication" SET "status" = 'STOPPED', "stoppedAt" = NOW(), "updatedAt" = "updatedAt" + INTERVAL '1 millisecond' WHERE "id" = ${item.id}::uuid`;
          };
          const holder = db.$transaction(async (tx) => {
            await (order === "stop-first" ? stopWrite(tx) : childWrite(tx));
            held.release(); await release.promise;
          }, { isolationLevel, timeout: 10000 });
          await held.promise;
          const waiter = db.$transaction(async (tx) => {
            const pid = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; waiterPid = pid[0].pid;
            waiterStarted.release(); await (order === "stop-first" ? childWrite(tx) : stopWrite(tx));
          }, { isolationLevel, timeout: 10000 });
          // Attach rejection handler immediately while the operation is blocked.
          const resultsPromise = Promise.allSettled([holder, waiter]);
          try { await waiterStarted.promise; await waitForDatabaseLock(waiterPid); } finally { release.release(); }
          const results = await resultsPromise;
          expect(results[0].status).toBe("fulfilled");
          if (order === "stop-first") expect(results[1].status).toBe("rejected");
          // Serializable may abort a direct stop after an overlapping child commit.
          if (order === "child-first" && results[1].status === "rejected") await db.$transaction(stopWrite);
          expect((await detail(a, item.id, db)).status).toBe("STOPPED");
          const count = await db.medicationSchedule.count({ where: { personalMedicationId: item.id } });
          expect(count).toBe(order === "stop-first" ? operation === "insert" ? 0 : 1 : operation === "insert" ? 1 : 0);
          await expect(db.medicationSchedule.create({ data: { personalMedicationId: item.id, localTime: toMedicationTimeCarrier("09:00") } })).rejects.toThrow();
          if (count) await expect(db.medicationSchedule.deleteMany({ where: { personalMedicationId: item.id } })).rejects.toThrow();
        });
      }
    }
  }

  it("owns all queries/mutations and returns minimal DTO without foreign existence disclosure", async () => {
    const a = await actor(); const b = await actor();
    const own = await create(a, { medicationName: " ยาไทย   A ", instructionText: " บันทึก\nเอง " }, deps);
    const foreign = await create(b, { medicationName: "ยา B" }, deps);
    expect(own).toMatchObject({ medicationName: "ยาไทย A", instructionText: "บันทึก\nเอง", status: "ACTIVE", stoppedAt: null });
    expect(Object.keys(own).sort()).toEqual(["id", "medicationName", "instructionText", "status", "stoppedAt", "createdAt", "updatedAt"].sort());
    expect((await list(a, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([own.id]);
    for (const id of [foreign.id, randomUUID()]) {
      await expect(sources(a, sourceQuery(id), deps)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
      await expect(revalidate(a, unknownSource(id), deps)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
      await expect(detail(a, id, db)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
      await expect(update(a, { ...token(foreign), medicationId: id, medicationName: "โจมตี" }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(stop(a, { ...token(foreign), medicationId: id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(replace(a, { ...token(foreign), medicationId: id, times: [] }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(list(a, { status: "ACTIVE", cursor: id }, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await detail(b, foreign.id, db)).toEqual({ ...foreign, schedules: [] });
  });

  it("fails closed on persisted inactive/removed role/missing profile/exact identity mismatch", async () => {
    const a = await actor(); const b = await actor(); const noProfile = await actor([Role.PATIENT], false);
    const item = await raw(a);
    const denied = [null, { ...a, userId: b.userId }, { ...a, personId: b.personId }, noProfile];
    for (const bad of denied) {
      await expect(sources(bad, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revalidate(bad, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(list(bad, { status: "ACTIVE" }, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(create(bad, { medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(detail(bad, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(replace(bad, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await db.user.update({ where: { id: a.userId }, data: { status: "SUSPENDED" } });
    await expect(sources(a, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(a, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(detail(a, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(update(a, { ...token(item), medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(replace(a, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({ where: { id: a.userId }, data: { status: "ACTIVE" } });
    await db.userRole.deleteMany({ where: { userId: a.userId } });
    await expect(sources(a, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(a, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stop(a, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(detail(a, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(replace(a, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
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
      await expect(sources(denied, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revalidate(denied, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(list(denied, { status: "ACTIVE" }, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(detail(denied, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(create(denied, { medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(update(denied, { ...token(item), medicationName: "ยา" }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(stop(denied, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(replace(denied, { ...token(item), times: ["08:00"] }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await db.caregiverAppointmentGrant.create({ data: { caregiverRelationshipId: family.id, patientProfileId: profileId, patientPersonId: patient.personId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, patientHospitalRelationshipId: phr.id, proposedByUserId: patient.userId, proposedAt: now, contractVersion: "family-appointment-read-v1", status: "ACTIVE", acceptedAt: now, acceptedByUserId: caregiver.userId } });
    await expect(sources(caregiver, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(caregiver, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(detail(caregiver, item.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stop(caregiver, token(item), deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(replace(caregiver, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.userRole.create({ data: { userId: caregiver.userId, role: "PATIENT" } });
    await db.patientProfile.create({ data: { personId: caregiver.personId } });
    const patientCaregiver = { ...caregiver, roles: [Role.PATIENT] };
    const selfItem = await create(patientCaregiver, { medicationName: "รายการส่วนตัว" }, deps);
    expect((await sources(patientCaregiver, sourceQuery(selfItem.id), deps)).items).toEqual([]);
    await expect(sources(patientCaregiver, sourceQuery(item.id), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revalidate(patientCaregiver, unknownSource(item.id), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await list(patientCaregiver, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([selfItem.id]);
    await expect(detail(patientCaregiver, item.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(update(patientCaregiver, { ...token(item), medicationName: "เปลี่ยน" }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stop(patientCaregiver, token(item), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(replace(patientCaregiver, { ...token(item), times: [] }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await replace(patientCaregiver, { ...token(selfItem), times: ["08:00"] }, deps)).schedules).toEqual([{ localTime: "08:00" }]);
  });

  it("multi-role Patient and Patient caregiver/ADMIN access their own SELF only", async () => {
    const other = await actor(); const foreign = await raw(other);
    for (const roles of [[Role.PATIENT, Role.OSM], [Role.PATIENT, Role.HOSPITAL], [Role.PATIENT, Role.ADMIN]] as Role[][]) {
      const a = await actor(roles); const own = await create(a, { medicationName: "ยา" }, deps);
      expect((await sources(a, sourceQuery(own.id), deps)).items).toEqual([]);
      await expect(sources(a, sourceQuery(foreign.id), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(revalidate(a, unknownSource(foreign.id), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await list(a, { status: "ACTIVE" }, db)).items.map((x) => x.id)).toEqual([own.id]);
      await expect(detail(a, foreign.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(stop(a, token(foreign), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(replace(a, { ...token(foreign), times: [] }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await replace(a, { ...token(own), times: ["08:00"] }, deps)).schedules).toEqual([{ localTime: "08:00" }]);
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
    expect(await detail(a, item.id, db)).toEqual({ ...terminal, schedules: [] });
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
    expect(await detail(a, first.id, db)).toEqual({ ...terminal, schedules: [] });
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
      expect(await detail(a, original.id, db)).toEqual({ ...original, schedules: [] });
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
    const planText = plan.map((row) => row["QUERY PLAN"]).join("\n");
    expect(planText).toContain(status === "ACTIVE" ? "PersonalMedication_active_order_idx" : "PersonalMedication_stopped_order_idx");
    expect(planText).not.toMatch(/^\s*(?:->\s*)?Sort\b/m);
  });
});
