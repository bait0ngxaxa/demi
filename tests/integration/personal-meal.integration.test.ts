import { randomUUID } from "node:crypto";
import { Prisma, Role, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createPersonalMeal as create, updatePersonalMeal as update, deletePersonalMeal as remove, type MealMutationResult } from "@/modules/meals/services/personal-meal-service";
import { getOwnPersonalMeal as detail, listOwnPersonalMeals as list } from "@/modules/meals/services/personal-meal-query-service";
import { toMealDateCarrier, type PersonalMealDto } from "@/modules/meals/domain/personal-meal";
import { encodeMealCursor } from "@/modules/meals/services/personal-meal-cursor";

const db = getPrisma();
const now = new Date("2026-10-03T00:00:00.000Z");
const deps = { database: db, now: () => now };
const persons: string[] = []; const users: string[] = []; const hospitals: string[] = [];
const fields = { category: "SNACK", occurredOn: "2026-10-03", description: "ข้อมูลสังเคราะห์ไทย\n<script>literal</script>" };
async function actor(roles: Role[] = [Role.PATIENT], profile = true): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ข้อมูลสังเคราะห์" } }); persons.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } } }); users.push(user.id);
  if (profile) await db.patientProfile.create({ data: { personId: person.id } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}
async function owner(a: ActorContext): Promise<string> { return (await db.patientProfile.findUniqueOrThrow({ where: { personId: a.personId } })).id; }
function item(result: MealMutationResult): PersonalMealDto { if (!("item" in result)) throw new Error("Expected Meal readback"); return result.item; }
function token(row: PersonalMealDto): { entryId: string; expectedUpdatedAt: string } { return { entryId: row.id, expectedUpdatedAt: row.updatedAt }; }
async function make(a: ActorContext, nonce = randomUUID()): Promise<PersonalMealDto> { return item(await create(a, { submissionNonce: nonce, ...fields }, deps)); }

// Both real PostgreSQL transactions establish the same snapshot/read before
// either performs its guarded write. No mocked concurrency outcome.
function raceDatabase(model: "personalMealEntry" | "personalMealCreateReceipt", method: "findFirst" | "findUnique"): PrismaClient {
  let arrived = 0; let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
    let held = false;
    const proxy = new Proxy(tx, { get(target, property) {
      if (property !== model) return Reflect.get(target, property);
      return new Proxy(Reflect.get(target, property), { get(delegate, key) {
        const original: unknown = Reflect.get(delegate, key);
        if (key !== method || typeof original !== "function") return original;
        return async (args: unknown): Promise<unknown> => {
          const result: unknown = await original.call(delegate, args);
          if (!held) { held = true; arrived += 1; if (arrived === 2) release(); await gate; }
          return result;
        };
      } });
    } });
    return operation(proxy);
  }, { ...options, timeout: 15000 }) } as unknown as PrismaClient;
}
function auditFailureDatabase(): PrismaClient {
  return { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: "Serializable" }) => db.$transaction(async (tx) => {
    const proxy = new Proxy(tx, { get(target, property) { if (property === "auditEvent") return { create: async () => { throw new Error("synthetic audit failure"); } }; return Reflect.get(target, property); } });
    return operation(proxy);
  }, options) } as unknown as PrismaClient;
}
async function cleanup(): Promise<void> {
  await db.caregiverAppointmentGrant.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.caregiverRelationship.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.caregiverInvitation.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.patientOsmAssignment.deleteMany({ where: { osmUserId: { in: users } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: users } } });
  await db.osmHospitalRelationship.deleteMany({ where: { userId: { in: users } } });
  await db.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.personalMealCreateReceipt.deleteMany({ where: { patientProfile: { personId: { in: persons } } } });
  await db.personalMealEntry.deleteMany({ where: { patientProfile: { personId: { in: persons } } } });
  await db.patientProfile.deleteMany({ where: { personId: { in: persons } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } }); await db.person.deleteMany({ where: { id: { in: persons } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  persons.length = 0; users.length = 0; hospitals.length = 0;
}
describe("Personal Meal Journal real PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable DB required");
    await db.$connect();
  });
  afterEach(cleanup); afterAll(async () => { await db.$disconnect(); });
  it("create/replay/current edit/NOOP/delete receipts and minimized audits", async () => {
    const a = await actor(); const nonce = randomUUID(); const row = await make(a, nonce);
    expect(row.occurredOn).toBe(fields.occurredOn); expect(await detail(a, row.id, db)).toEqual(row);
    expect(await create(a, { submissionNonce: nonce, ...fields, description: "replacement ignored", occurredOn: "9999-12-31" }, deps)).toEqual({ outcome: "REPLAY", item: row });
    const changed = item(await update(a, { ...token(row), ...fields, description: "แก้แล้ว" }, deps));
    expect(new Date(changed.updatedAt).getTime()).toBe(now.getTime() + 1);
    expect(item(await create(a, { submissionNonce: nonce, ...fields }, deps))).toEqual(changed);
    await expect(update(a, { ...token(row), ...fields, description: changed.description }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await update(a, { ...token(changed), ...fields, description: " แก้แล้ว " }, deps)).toEqual({ outcome: "NOOP", item: changed });
    expect(await remove(a, token(changed), deps)).toEqual({ outcome: "DELETED", entryId: row.id });
    await expect(detail(a, row.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(create(a, { submissionNonce: nonce, ...fields }, deps)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(update(a, { ...token(changed), ...fields }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(remove(a, token(changed), deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const receipt = await db.personalMealCreateReceipt.findUniqueOrThrow({ where: { patientProfileId_submissionNonce: { patientProfileId: await owner(a), submissionNonce: nonce } } });
    expect(Object.keys(receipt).sort()).toEqual(["createdAt", "mealEntryId", "patientProfileId", "submissionNonce"]);
    const audits = await db.auditEvent.findMany({ where: { resourceId: row.id }, orderBy: { createdAt: "asc" } });
    expect(audits.map((x) => x.action)).toEqual(["personal_meal.created", "personal_meal.updated", "personal_meal.deleted"]);
    expect(audits.every((x) => x.metadata === null && x.resourceType === "PersonalMealEntry")).toBe(true);
    expect((await list(a, {}, db)).items).toEqual([]);
  });
  it("intentional identical content/new nonce gives distinct meals; another owner has independent nonce namespace", async () => {
    const a = await actor(); const b = await actor(); const nonce = randomUUID();
    const one = await make(a, nonce); const two = await make(a); const other = await make(b, nonce);
    expect(new Set([one.id, two.id, other.id]).size).toBe(3);
    expect((await list(a, {}, db)).items).toHaveLength(2); expect((await list(b, {}, db)).items).toHaveLength(1);
  });
  it.each(["create", "update", "delete"] as const)("%s audit failure rolls back payload/receipt/version and permits safe retry", async (operation) => {
    const a = await actor(); const nonce = randomUUID(); const broken = { ...deps, database: auditFailureDatabase() };
    if (operation === "create") {
      await expect(create(a, { submissionNonce: nonce, ...fields }, broken)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await db.personalMealEntry.count({ where: { patientProfileId: await owner(a) } })).toBe(0);
      expect(await db.personalMealCreateReceipt.count({ where: { patientProfileId: await owner(a) } })).toBe(0);
      expect(await db.auditEvent.count({ where: { actorUserId: a.userId } })).toBe(0); await make(a, nonce);
    } else {
      const row = await make(a);
      await expect(operation === "update" ? update(a, { ...token(row), ...fields, description: "change" }, broken) : remove(a, token(row), broken)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await detail(a, row.id, db)).toEqual(row); expect(await db.auditEvent.count({ where: { resourceId: row.id } })).toBe(1);
    }
  });
  it("overlapping same nonce creates exactly one entry/receipt/audit then reconciles losing request", async () => {
    const a = await actor(); const input = { submissionNonce: randomUUID(), ...fields };
    const race = { ...deps, database: raceDatabase("personalMealCreateReceipt", "findUnique") };
    const results = await Promise.allSettled([create(a, input, race), create(a, input, race)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected").map((x) => x.status === "rejected" ? (x.reason as { code: string }).code : "")).toEqual(["CONFLICT"]);
    expect(await db.personalMealEntry.count({ where: { patientProfileId: await owner(a) } })).toBe(1);
    expect(await db.personalMealCreateReceipt.count({ where: { patientProfileId: await owner(a) } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: a.userId } })).toBe(1);
    expect((await create(a, input, deps)).outcome).toBe("REPLAY");
  });
  it.each(["edit/edit", "edit/delete", "delete/delete"])("overlapping %s has one winner, no overwrite/resurrection/duplicate audit", async (kind) => {
    const a = await actor(); const row = await make(a); const race = { ...deps, database: raceDatabase("personalMealEntry", "findFirst") };
    const edit = (): Promise<MealMutationResult> => update(a, { ...token(row), ...fields, description: randomUUID() }, race);
    const del = (): Promise<MealMutationResult> => remove(a, token(row), race);
    const results = await Promise.allSettled([kind.startsWith("edit") ? edit() : del(), kind.endsWith("edit") ? edit() : del()]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" });
    expect(await db.auditEvent.count({ where: { resourceId: row.id } })).toBe(2);
    expect(await db.personalMealCreateReceipt.count({ where: { mealEntryId: row.id } })).toBe(1);
    const surviving = await db.personalMealEntry.findUnique({ where: { id: row.id } });
    if (surviving) expect(surviving.updatedAt.getTime()).toBe(now.getTime() + 1);
    else await expect(update(a, { ...token(row), ...fields }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("exact owner scopes foreign and missing read/edit/delete equivalently", async () => {
    const a = await actor(); const b = await actor([Role.PATIENT, Role.HOSPITAL, Role.ADMIN]); const row = await make(a);
    for (const id of [row.id, randomUUID()]) {
      await expect(detail(b, id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(update(b, { ...token(row), entryId: id, ...fields }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(remove(b, { ...token(row), entryId: id }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await list(b, {}, db)).items).toEqual([]); expect(await make(b)).toBeDefined();
  });
  it.each(["SUSPENDED", "PROVISIONED", "role_removed", "invalid_binding", "missing_profile"])("fresh persisted authority denies %s on every operation including replay/continuation", async (change) => {
    const a = await actor(); const nonce = randomUUID(); const row = await make(a, nonce); const patientProfileId = await owner(a);
    const cursor = encodeMealCursor(a, { version: 1, patientProfileId, id: row.id, occurredOn: row.occurredOn, createdAt: row.createdAt, updatedAt: row.updatedAt });
    let stale = a;
    if (change === "SUSPENDED" || change === "PROVISIONED") await db.user.update({ where: { id: a.userId }, data: { status: change } });
    if (change === "role_removed") await db.userRole.deleteMany({ where: { userId: a.userId } });
    if (change === "invalid_binding") stale = { ...a, personId: (await actor()).personId };
    if (change === "missing_profile") stale = await actor([Role.PATIENT], false);
    await Promise.all([list(stale, {}, db), list(stale, { cursor }, db), detail(stale, row.id, db), create(stale, { submissionNonce: nonce, ...fields }, deps), update(stale, { ...token(row), ...fields }, deps), remove(stale, token(row), deps)].map((promise) => expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" })));
    expect(await db.auditEvent.count({ where: { resourceId: row.id } })).toBe(1);
  });
  it.each([{ roles: [Role.HOSPITAL] }, { roles: [Role.OSM] }, { roles: [Role.ADMIN] }, { roles: [] }])("non-Patient roles %s have no Meal authority", async ({ roles }) => {
    const a = await actor(); const row = await make(a); const other = await actor(roles);
    await Promise.all([list(other, {}, db), detail(other, row.id, db), create(other, { submissionNonce: randomUUID(), ...fields }, deps), update(other, { ...token(row), ...fields }, deps), remove(other, token(row), deps)].map((request) => expect(request).rejects.toMatchObject({ code: "FORBIDDEN" })));
  });
  it.each(["MEMBER", "OWNER", "OSM", "FAMILY"])("actual %s relationship/grant is not Meal authority", async (kind) => {
    const a = await actor(); const target = await make(a); const patientProfileId = await owner(a);
    const other = await actor(kind === "OSM" ? [Role.OSM] : kind === "FAMILY" ? [] : [Role.HOSPITAL]);
    const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 20), name: "สังเคราะห์", status: "ACTIVE" } }); hospitals.push(hospital.id);
    const relationship = await db.patientHospitalRelationship.create({ data: { patientProfileId, hospitalId: hospital.id, hospitalNumber: randomUUID() } });
    if (kind === "MEMBER" || kind === "OWNER") await db.hospitalMembership.create({ data: { hospitalId: hospital.id, userId: other.userId, membershipType: kind, status: "ACTIVE" } });
    if (kind === "OSM") {
      await db.osmHospitalRelationship.create({ data: { userId: other.userId, hospitalId: hospital.id, status: "ACTIVE" } });
      await db.patientOsmAssignment.create({ data: { osmUserId: other.userId, patientHospitalRelationshipId: relationship.id, assignedByUserId: a.userId } });
    }
    if (kind === "FAMILY") {
      const invitation = await db.caregiverInvitation.create({ data: { patientProfileId, caregiverUserId: other.userId, caregiverPersonId: other.personId, issuedByUserId: a.userId, tokenHash: randomUUID(), issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), status: "ACCEPTED", acceptedAt: now, acceptanceContractVersion: "family-delegation-v1" } });
      const caregiver = await db.caregiverRelationship.create({ data: { patientProfileId, caregiverUserId: other.userId, sourceInvitationId: invitation.id, activatedAt: now } });
      await db.caregiverAppointmentGrant.create({ data: { caregiverRelationshipId: caregiver.id, patientProfileId, patientPersonId: a.personId, caregiverUserId: other.userId, caregiverPersonId: other.personId, patientHospitalRelationshipId: relationship.id, contractVersion: "family-appointment-read-v1", proposedByUserId: a.userId, proposedAt: now, status: "ACTIVE", acceptedByUserId: other.userId, acceptedAt: now } });
    }
    await expect(detail(other, target.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(create(other, { submissionNonce: randomUUID(), ...fields }, deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("DATE roundtrip in PostgreSQL and process TZ; past/today allowed, future create/edit rollback", async () => {
    const a = await actor();
    for (const occurredOn of ["0001-01-01", "2024-02-29", "2026-10-03"]) {
      const row = item(await create(a, { submissionNonce: randomUUID(), ...fields, occurredOn }, deps)); expect(row.occurredOn).toBe(occurredOn);
      for (const zone of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
        const original = process.env.TZ; process.env.TZ = zone;
        try { expect((await detail(a, row.id, db)).occurredOn).toBe(occurredOn); }
        finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
      }
    }
    const nonce = randomUUID(); await expect(create(a, { submissionNonce: nonce, ...fields, occurredOn: "2026-10-04" }, deps)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.personalMealCreateReceipt.count({ where: { submissionNonce: nonce } })).toBe(0);
    const row = await make(a); await expect(update(a, { ...token(row), ...fields, occurredOn: "2026-10-04" }, deps)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await detail(a, row.id, db)).toEqual(row);
    await expect(create(a, { submissionNonce: randomUUID(), ...fields }, { ...deps, now: () => new Date("2026-10-02T16:59:59.999Z") })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(item(await create(a, { submissionNonce: randomUUID(), ...fields }, { ...deps, now: () => new Date("2026-10-02T17:00:00.000Z") })).occurredOn).toBe(fields.occurredOn);
  });
  it("bounded >50 deterministic history, secure continuations and stale/missing anchors", async () => {
    const a = await actor(); const b = await actor(); const patientProfileId = await owner(a);
    await db.personalMealEntry.createMany({ data: Array.from({ length: 103 }, (_, index) => ({ id: randomUUID(), patientProfileId, category: "SNACK", description: fields.description,
      occurredOn: toMealDateCarrier(index < 60 ? "2026-10-03" : "2026-10-02"), createdAt: new Date(now.getTime() + Math.floor(index / 2)), updatedAt: now })) });
    const first = await list(a, {}, db); expect(first.items).toHaveLength(50); expect(first.nextCursor).toBeTruthy();
    const second = await list(a, { cursor: first.nextCursor }, db); const third = await list(a, { cursor: second.nextCursor }, db);
    expect(second.items).toHaveLength(50); expect(third.items).toHaveLength(3); expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items]; expect(new Set(all.map((x) => x.id)).size).toBe(103);
    const sorted = [...all].sort((x, y) => y.occurredOn.localeCompare(x.occurredOn) || y.createdAt.localeCompare(x.createdAt) || y.id.localeCompare(x.id)); expect(all).toEqual(sorted);
    await expect(list(b, { cursor: first.nextCursor }, db)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(list(a, { cursor: first.nextCursor + "tampered" }, db)).rejects.toMatchObject({ code: "VALIDATION" });
    const anchor = first.items[49]; const changed = item(await update(a, { ...token(anchor), ...fields, description: "anchor changed" }, deps));
    await expect(list(a, { cursor: first.nextCursor }, db)).rejects.toMatchObject({ code: "CONFLICT" });
    await remove(a, token(changed), deps); await expect(list(a, { cursor: first.nextCursor }, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const foreign = encodeMealCursor(b, { version: 1, patientProfileId: await owner(b), id: first.items[0].id, occurredOn: first.items[0].occurredOn, createdAt: first.items[0].createdAt, updatedAt: first.items[0].updatedAt });
    const missing = encodeMealCursor(b, { version: 1, patientProfileId: await owner(b), id: randomUUID(), occurredOn: first.items[0].occurredOn, createdAt: first.items[0].createdAt, updatedAt: first.items[0].updatedAt });
    for (const cursor of [foreign, missing]) await expect(list(b, { cursor }, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("migration types/FKs/index/nonce constraints and absence of content uniqueness", async () => {
    const columns = await db.$queryRaw<{ column_name: string; data_type: string; is_nullable: string }[]>`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'PersonalMealEntry'`;
    expect(columns.find((x) => x.column_name === "occurredOn")).toMatchObject({ data_type: "date", is_nullable: "NO" });
    expect(columns.find((x) => x.column_name === "description")?.is_nullable).toBe("YES");
    const indexes = await db.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('PersonalMealEntry', 'PersonalMealCreateReceipt')`;
    expect(indexes.some((x) => x.indexdef.includes('"patientProfileId", "occurredOn" DESC, "createdAt" DESC, id DESC'))).toBe(true);
    expect(indexes.filter((x) => x.indexdef.includes("UNIQUE") && x.indexdef.includes("occurredOn"))).toEqual([]);
    const a = await actor(); const row = await make(a); const patientProfileId = await owner(a);
    await expect(db.personalMealEntry.create({ data: { patientProfileId: randomUUID(), category: "SNACK", occurredOn: toMealDateCarrier(fields.occurredOn), updatedAt: now } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.personalMealCreateReceipt.create({ data: { patientProfileId, submissionNonce: randomUUID(), mealEntryId: row.id } })).rejects.toMatchObject({ code: "P2002" });
    const receipt = await db.personalMealCreateReceipt.findFirstOrThrow({ where: { mealEntryId: row.id } });
    await expect(db.personalMealCreateReceipt.create({ data: { ...receipt, mealEntryId: randomUUID() } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.$executeRaw`INSERT INTO "PersonalMealEntry" (id, "patientProfileId", category, "occurredOn", "updatedAt") VALUES (${randomUUID()}::uuid, ${patientProfileId}::uuid, 'OTHER', DATE '2026-10-03', CURRENT_TIMESTAMP)`).rejects.toThrow();
    await expect(db.$executeRaw`INSERT INTO "PersonalMealEntry" (id, "patientProfileId", category, "occurredOn", "updatedAt") VALUES (${randomUUID()}::uuid, ${patientProfileId}::uuid, 'SNACK', NULL, CURRENT_TIMESTAMP)`).rejects.toThrow();
  });
});
