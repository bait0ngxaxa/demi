import { randomUUID } from "node:crypto";
import { HospitalContentCategory, HospitalContentStatus, HospitalStatus, MembershipType, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getPatientHospitalContent as detail, listPatientHospitalContent as list } from "@/modules/hospital-content/services/hospital-content-patient-query-service";
import { encodeHospitalContentPatientCursor } from "@/modules/hospital-content/services/hospital-content-patient-cursor";
import { archiveHospitalContent, createHospitalContent, publishHospitalContent, withdrawHospitalContent } from "@/modules/hospital-content/services/hospital-content-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const db = getPrisma();
const now = new Date("2026-10-05T12:00:00.000Z");
const persons: string[] = [];
const users: string[] = [];
const hospitals: string[] = [];
let connected = false;
async function actor(roles: Role[] = [Role.PATIENT], profile = true): Promise<ActorContext> {
  const p = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ข้อมูลสังเคราะห์" } }); persons.push(p.id);
  const u = await db.user.create({ data: { personId: p.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } } }); users.push(u.id);
  if (profile) await db.patientProfile.create({ data: { personId: p.id } });
  return { userId: u.id, personId: p.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}
async function profileId(a: ActorContext): Promise<string> {
  return (await db.patientProfile.findUniqueOrThrow({ where: { personId: a.personId }, select: { id: true } })).id;
}
async function hospital(parentHospitalId?: string): Promise<string> {
  const h = await db.hospital.create({ data: { hospitalCode: `HP-${randomUUID().slice(0, 12)}`, name: "โรงพยาบาลสังเคราะห์", status: "ACTIVE", parentHospitalId } }); hospitals.push(h.id); return h.id;
}
async function relate(a: ActorContext, hospitalId: string): Promise<string> {
  return (await db.patientHospitalRelationship.create({ data: { patientProfileId: await profileId(a), hospitalId } })).id;
}
async function content(hospitalId: string, input: { id?: string; category?: HospitalContentCategory; status?: HospitalContentStatus; first?: Date; latest?: Date; updatedAt?: Date } = {}): Promise<string> {
  const first = input.first ?? now;
  const row = await db.hospitalContent.create({ data: {
    id: input.id, hospitalId, submissionNonce: randomUUID(), title: "ข่าวสารสังเคราะห์", body: "เนื้อหาสังเคราะห์\nบรรทัดที่สอง", sourceText: "https://example.com/source",
    category: input.category ?? "OTHER", status: input.status ?? "PUBLISHED", firstPublishedAt: first,
    latestPublishedAt: input.latest ?? first, updatedAt: input.updatedAt ?? now,
  } }); return row.id;
}
async function owner(hospitalId: string, roles: Role[] = [Role.HOSPITAL], membershipType: MembershipType = MembershipType.OWNER): Promise<ActorContext> {
  const a = await actor(roles);
  await db.hospitalMembership.create({ data: { userId: a.userId, hospitalId, membershipType, status: "ACTIVE" } });
  return { ...a, hospitalMemberships: [{ hospitalId, membershipType, status: "ACTIVE", hospitalStatus: "ACTIVE", profession: null }] };
}
async function cleanup(): Promise<void> {
  if (!connected) return;
  await db.caregiverAppointmentGrant.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.caregiverRelationship.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.caregiverInvitation.deleteMany({ where: { caregiverUserId: { in: users } } });
  await db.patientOsmAssignment.deleteMany({ where: { osmUserId: { in: users } } });
  await db.hospitalContent.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: users } } });
  await db.osmHospitalRelationship.deleteMany({ where: { userId: { in: users } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientProfile.deleteMany({ where: { personId: { in: persons } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.hospital.updateMany({ where: { id: { in: hospitals } }, data: { parentHospitalId: null } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  await db.person.deleteMany({ where: { id: { in: persons } } });
  persons.length = 0; users.length = 0; hospitals.length = 0;
}
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve };
}
function beforeContentStatement(method: "findMany" | "findFirst"): { database: PrismaClient; entered: Promise<void>; release: () => void; projections: unknown[] } {
  const entered = deferred(); const resumed = deferred(); const projections: unknown[] = []; let paused = false;
  const delegate = new Proxy(db.hospitalContent, { get(target, property, receiver) {
    if (property === method) return async (args: Prisma.HospitalContentFindManyArgs & Prisma.HospitalContentFindFirstArgs): Promise<unknown> => {
      if (!paused) { paused = true; entered.resolve(); await resumed.promise; }
      const result = method === "findMany" ? await target.findMany(args) : await target.findFirst(args);
      projections.push(result); return result;
    };
    const value: unknown = Reflect.get(target, property, receiver); return typeof value === "function" ? value.bind(target) : value;
  } });
  const database = new Proxy(db, { get(target, property, receiver) {
    if (property === "hospitalContent") return delegate;
    const value: unknown = Reflect.get(target, property, receiver); return typeof value === "function" ? value.bind(target) : value;
  } });
  return { database, entered: entered.promise, release: resumed.resolve, projections };
}
async function seedPages(a: ActorContext, hospitalId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < 53; index++) ids.push(await content(hospitalId, {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`,
    first: new Date(now.getTime() - Math.floor(index / 2) * 1000),
  }));
  expect((await list(a, {}, db)).items).toHaveLength(25);
  return ids;
}

describe("Phase 17I.3 Patient Content real PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Verified local disposable PostgreSQL required");
    await db.$connect(); connected = true;
  });
  afterEach(cleanup);
  afterAll(async () => { if (connected) { await cleanup(); await db.$disconnect(); } });

  it("returns exact approved projections from only the current Patient's own ACTIVE Hospitals", async () => {
    const a = await actor(); const b = await actor(); const h = await hospital(); await relate(a, h); const id = await content(h);
    const page = await list(a, {}, db); expect(page.items.map((row) => row.id)).toEqual([id]);
    expect(Object.keys(page.items[0]).sort()).toEqual(["category", "hospital", "id", "latestPublishedAt", "title"]);
    const item = await detail(a, id, db); expect(Object.keys(item).sort()).toEqual(["body", "category", "hospital", "id", "latestPublishedAt", "sourceText", "title"]);
    expect(Object.keys(item.hospital).sort()).toEqual(["hospitalCode", "name"]);
    expect((await list(b, {}, db)).items).toEqual([]); await expect(detail(b, id, db)).rejects.toBeInstanceOf(NotFoundError);
  });
  it.each(["missing-profile", "mismatched-person", "suspended", "provisioned", "removed-role"])("denies persisted SELF %s even with old ActorContext", async (change) => {
    const a = await actor([Role.PATIENT], change !== "missing-profile");
    if (change === "mismatched-person") a.personId = (await actor()).personId;
    if (change === "suspended" || change === "provisioned") await db.user.update({ where: { id: a.userId }, data: { status: change === "suspended" ? "SUSPENDED" : "PROVISIONED" } });
    if (change === "removed-role") await db.userRole.delete({ where: { userId_role: { userId: a.userId, role: Role.PATIENT } } });
    await expect(list(a, {}, db)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(detail(a, randomUUID(), db)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it.each([Role.ADMIN, Role.HOSPITAL, Role.OSM])("%s-only plus own Profile/relationship cannot read Patient content", async (role) => {
    const h = await hospital(); const a = role === Role.HOSPITAL ? await owner(h) : await actor([role]); await relate(a, h); const id = await content(h);
    await expect(list(a, {}, db)).rejects.toBeInstanceOf(ForbiddenError); await expect(detail(a, id, db)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("MEMBER-only and assigned OSM cannot use Work authority as Patient SELF", async () => {
    const h = await hospital(); const patient = await actor(); const relation = await relate(patient, h);
    const member = await owner(h, [Role.HOSPITAL], MembershipType.MEMBER); const osm = await actor([Role.OSM]);
    await db.osmHospitalRelationship.create({ data: { userId: osm.userId, hospitalId: h, status: "ACTIVE" } });
    await db.patientOsmAssignment.create({ data: { osmUserId: osm.userId, patientHospitalRelationshipId: relation, assignedByUserId: member.userId } });
    for (const a of [member, osm]) await expect(list(a, {}, db)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("active Family relationship and appointment grant never expand a PATIENT caregiver's own feed", async () => {
    const patient = await actor(); const caregiver = await actor(); const h = await hospital(); const relationshipId = await relate(patient, h); const id = await content(h); const patientProfileId = await profileId(patient);
    const invitation = await db.caregiverInvitation.create({ data: { patientProfileId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, issuedByUserId: patient.userId, tokenHash: randomUUID(), issuedAt: now, expiresAt: new Date(now.getTime() + 86400000), status: "ACCEPTED", acceptedAt: now, acceptanceContractVersion: "family-delegation-v1" } });
    const relationship = await db.caregiverRelationship.create({ data: { patientProfileId, caregiverUserId: caregiver.userId, sourceInvitationId: invitation.id, activatedAt: now } });
    await db.caregiverAppointmentGrant.create({ data: { caregiverRelationshipId: relationship.id, patientProfileId, patientPersonId: patient.personId, caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, patientHospitalRelationshipId: relationshipId, contractVersion: "family-appointment-read-v1", proposedByUserId: patient.userId, proposedAt: now, status: "ACTIVE", acceptedByUserId: caregiver.userId, acceptedAt: now } });
    expect((await list(caregiver, {}, db)).emptyState).toBe("EMPTY_A"); await expect(detail(caregiver, id, db)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("forms a globally ordered A+B private union, excluding Work C and hierarchy in both directions", async () => {
    const parent = await hospital(); const child = await hospital(parent); const foreign = await hospital(); const a = await owner(foreign, [Role.PATIENT, Role.HOSPITAL, Role.ADMIN, Role.OSM]);
    await relate(a, parent); const old = await content(parent, { first: new Date(now.getTime() - 1000), latest: new Date(now.getTime() + 10000), updatedAt: new Date(now.getTime() + 20000) });
    const newer = await content(child); const unrelated = await content(foreign);
    expect((await list(a, {}, db)).items.map((row) => row.id)).toEqual([old]);
    await relate(a, child); expect((await list(a, {}, db)).items.map((row) => row.id)).toEqual([newer, old]);
    await expect(detail(a, unrelated, db)).rejects.toBeInstanceOf(NotFoundError);
    const onlyChild = await actor(); await relate(onlyChild, child);
    expect((await list(onlyChild, {}, db)).items.map((row) => row.id)).toEqual([newer]);
  });
  it("uses Publisher lifecycle unchanged: publish/withdraw/republish/archive and no promotion by republish", async () => {
    const h = await hospital(); const publisher = await owner(h); const patient = await actor(); await relate(patient, h);
    const created = await createHospitalContent(publisher, { hospitalId: h, submissionNonce: randomUUID(), title: "ข่าวสาร", body: "เนื้อหา", category: "FOOD", sourceText: null }, { database: db, now: () => now });
    if (created.outcome !== "CREATED") throw new Error("Expected create");
    const id = created.content.id; expect((await list(patient, {}, db)).items).toEqual([]);
    const published = await publishHospitalContent(publisher, { contentId: id, expectedUpdatedAt: created.content.expectedUpdatedAt }, { database: db, now: () => now });
    if (published.outcome === "UNCONFIRMED") throw new Error("Expected publish");
    const newer = await content(h, { first: new Date(now.getTime() + 1000) });
    const withdrawn = await withdrawHospitalContent(publisher, { contentId: id, expectedUpdatedAt: published.content.expectedUpdatedAt }, { database: db, now: () => new Date(now.getTime() + 2000) });
    if (withdrawn.outcome === "UNCONFIRMED") throw new Error("Expected withdraw");
    await expect(detail(patient, id, db)).rejects.toBeInstanceOf(NotFoundError);
    const republished = await publishHospitalContent(publisher, { contentId: id, expectedUpdatedAt: withdrawn.content.expectedUpdatedAt }, { database: db, now: () => new Date(now.getTime() + 3000) });
    if (republished.outcome === "UNCONFIRMED") throw new Error("Expected republish");
    expect((await list(patient, {}, db)).items.map((row) => row.id)).toEqual([newer, id]);
    expect((await detail(patient, id, db)).latestPublishedAt).toBe(republished.content.latestPublishedAt);
    await archiveHospitalContent(publisher, { contentId: id, expectedUpdatedAt: republished.content.expectedUpdatedAt }, { database: db, now: () => new Date(now.getTime() + 4000) });
    await expect(detail(patient, id, db)).rejects.toBeInstanceOf(NotFoundError);
    expect((await list(patient, {}, db)).items.map((row) => row.id)).toEqual([newer]);
  });
  it.each(Object.values(HospitalContentCategory))("filters exactly %s without widening Hospitals", async (category) => {
    const a = await actor(); const own = await hospital(); const foreign = await hospital(); await relate(a, own);
    for (const c of Object.values(HospitalContentCategory)) { await content(own, { category: c }); await content(foreign, { category: c }); }
    expect((await list(a, {}, db)).items).toHaveLength(4);
    const page = await list(a, { category }, db); expect(page.items).toHaveLength(1); expect(page.items[0].category).toBe(category);
  });
  it("pages 25/25/3 with equal-time UUID ties and no duplicates; newer rows stay ahead of the seek", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h);
    const first = await list(a, {}, db); expect(first.nextCursor).toBeTruthy();
    const second = await list(a, { cursor: first.nextCursor }, db); const third = await list(a, { cursor: second.nextCursor }, db);
    expect(second.items).toHaveLength(25); expect(third.items).toHaveLength(3); expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items]; expect(new Set(all.map((row) => row.id)).size).toBe(53);
    const stored = await db.hospitalContent.findMany({ where: { hospitalId: h }, orderBy: [{ firstPublishedAt: "desc" }, { id: "desc" }], select: { id: true } });
    expect(all.map((row) => row.id)).toEqual(stored.map((row) => row.id));
    await content(h, { first: new Date(now.getTime() + 2000) }); expect(await list(a, { cursor: first.nextCursor }, db)).toEqual(second);
  });
  it.each([HospitalContentStatus.DRAFT, HospitalContentStatus.ARCHIVED])("cursor anchor becomes %s but page 2 remains valid without anchor lookup", async (status) => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h);
    const first = await list(a, {}, db); const expected = await list(a, { cursor: first.nextCursor }, db); const anchor = first.items.at(-1);
    if (!anchor) throw new Error("Expected anchor");
    await db.hospitalContent.update({ where: { id: anchor.id }, data: { status } });
    const barrier = beforeContentStatement("findFirst"); // Any anchor lookup would block this non-empty continuation.
    expect(await list(a, { cursor: first.nextCursor }, barrier.database)).toEqual(expected);
    expect(barrier.projections).toEqual([]);
  });
  it("relationship removal and Hospital suspension preserve signed cursor validity but exclude removed scope", async () => {
    const a = await actor(); const h = await hospital(); const relation = await relate(a, h); await seedPages(a, h);
    const first = await list(a, {}, db); await db.patientHospitalRelationship.delete({ where: { id: relation } });
    expect((await list(a, { cursor: first.nextCursor }, db)).emptyState).toBe("EMPTY_A");
    await relate(a, h); await db.hospital.update({ where: { id: h }, data: { status: "SUSPENDED" } });
    expect((await list(a, { cursor: first.nextCursor }, db)).emptyState).toBe("EMPTY_A");
  });
  it("relationship addition preserves cursor and introduces only eligible rows after the boundary", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h);
    const first = await list(a, {}, db); const added = await hospital();
    const behind = await content(added, { first: new Date(now.getTime() - 13000) });
    const ahead = await content(added, { first: new Date(now.getTime() + 1000) }); await relate(a, added);
    const next = await list(a, { cursor: first.nextCursor }, db); expect(next.items.some((row) => row.id === behind)).toBe(true); expect(next.items.some((row) => row.id === ahead)).toBe(false);
  });
  it("rejects tampered, actor/person/Profile/filter-bound cursors", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h); const first = await list(a, {}, db);
    const b = await actor(); await relate(b, h);
    for (const input of [{ cursor: first.nextCursor + "x" }, { cursor: first.nextCursor, category: "FOOD" }]) await expect(list(a, input, db)).rejects.toBeInstanceOf(ValidationError);
    await expect(list(b, { cursor: first.nextCursor }, db)).rejects.toBeInstanceOf(ValidationError);
    const profile = await profileId(a); const valid = { version: 1 as const, category: null, firstPublishedAt: now.toISOString(), id: randomUUID() };
    for (const token of [encodeHospitalContentPatientCursor({ ...a, personId: b.personId }, profile, valid), encodeHospitalContentPatientCursor(a, randomUUID(), valid)]) await expect(list(a, { cursor: token }, db)).rejects.toBeInstanceOf(ValidationError);
    // A signed tuple for an absent row is still a valid continuation.
    expect((await list(a, { cursor: encodeHospitalContentPatientCursor(a, profile, valid) }, db)).items.length).toBeGreaterThan(0);
  });
  it("classifies A/B/C truthfully and checks current authority again after category existence returns zero", async () => {
    const a = await actor(); expect((await list(a, {}, db)).emptyState).toBe("EMPTY_A"); const h = await hospital(); const relation = await relate(a, h);
    expect((await list(a, {}, db)).emptyState).toBe("EMPTY_B"); await content(h, { category: "FOOD" }); expect((await list(a, { category: "NCD" }, db)).emptyState).toBe("EMPTY_C");
    const barrier = beforeContentStatement("findFirst"); const pending = list(a, { category: "NCD" }, barrier.database); await barrier.entered;
    await db.$transaction(async (tx) => { await tx.patientHospitalRelationship.delete({ where: { id: relation } }); }); barrier.release();
    expect((await pending).emptyState).toBe("EMPTY_A"); expect(barrier.projections).toEqual([null]);
  });
  it.each(["missing", "invalid", "foreign", "draft", "archived", "withdrawn", "suspended-hospital", "removed-relationship"])("detail %s has indistinguishable NotFound", async (kind) => {
    const a = await actor(); const h = await hospital(); const r = await relate(a, h);
    let id = kind === "invalid" ? "invalid" : randomUUID();
    if (!["missing", "invalid"].includes(kind)) id = await content(kind === "foreign" ? await hospital() : h, { status: kind === "draft" || kind === "withdrawn" ? "DRAFT" : kind === "archived" ? "ARCHIVED" : "PUBLISHED" });
    if (kind === "suspended-hospital") await db.hospital.update({ where: { id: h }, data: { status: "SUSPENDED" } });
    if (kind === "removed-relationship") await db.patientHospitalRelationship.delete({ where: { id: r } });
    await expect(detail(a, id, db)).rejects.toEqual(new NotFoundError());
  });
  for (const method of ["findMany", "findFirst"] as const) {
    it.each(["role", "relationship", "hospital", "user", "profile", "binding"])(`${method}: committed %s revocation BEFORE Content SELECT returns no projection`, async (kind) => {
      const a = await actor(); const h = await hospital(); const relation = await relate(a, h); const id = await content(h);
      const barrier = beforeContentStatement(method);
      const pending = method === "findMany" ? list(a, {}, barrier.database) : detail(a, id, barrier.database);
      // Attach rejection handling before resuming the SELECT.
      const result = pending.then((value) => ({ value }), (error: unknown) => ({ error }));
      await barrier.entered;
      await db.$transaction(async (tx) => {
        if (kind === "role") await tx.userRole.delete({ where: { userId_role: { userId: a.userId, role: Role.PATIENT } } });
        if (kind === "relationship") await tx.patientHospitalRelationship.delete({ where: { id: relation } });
        if (kind === "hospital") await tx.hospital.update({ where: { id: h }, data: { status: HospitalStatus.SUSPENDED } });
        if (kind === "user") await tx.user.update({ where: { id: a.userId }, data: { status: UserStatus.SUSPENDED } });
        if (kind === "profile") await tx.patientProfile.delete({ where: { personId: a.personId } });
        if (kind === "binding") { const person = await tx.person.create({ data: { identityKeyHash: randomUUID() } }); persons.push(person.id); await tx.user.update({ where: { id: a.userId }, data: { personId: person.id } }); }
      });
      barrier.release(); const outcome = await result;
      expect(barrier.projections[0]).toEqual(method === "findMany" ? [] : null);
      if (kind === "relationship" || kind === "hospital") {
        if ("value" in outcome) expect(outcome.value).toMatchObject({ items: [], emptyState: "EMPTY_A" });
        else expect(outcome.error).toBeInstanceOf(NotFoundError);
      } else { expect("error" in outcome && outcome.error).toBeInstanceOf(ForbiddenError); }
    });
  }
  it("replacing the persisted Profile invalidates a previously signed continuation", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h);
    const first = await list(a, {}, db);
    await db.patientProfile.delete({ where: { personId: a.personId } });
    await db.patientProfile.create({ data: { personId: a.personId } }); await relate(a, h);
    await expect(list(a, { cursor: first.nextCursor }, db)).rejects.toBeInstanceOf(ValidationError);
  });
  it("role loss during selected-category existence classification is Forbidden, never B/C", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await content(h, { category: "FOOD" });
    const barrier = beforeContentStatement("findFirst");
    const pending = list(a, { category: "NCD" }, barrier.database).then((value) => ({ value }), (error: unknown) => ({ error }));
    await barrier.entered;
    await db.$transaction(async (tx) => { await tx.userRole.delete({ where: { userId_role: { userId: a.userId, role: Role.PATIENT } } }); });
    barrier.release(); const outcome = await pending;
    expect(barrier.projections).toEqual([null]); expect("error" in outcome && outcome.error).toBeInstanceOf(ForbiddenError);
  });
  it("ordinary feed/detail/category/continuation reads neither audit nor update stored rows", async () => {
    const a = await actor(); const h = await hospital(); await relate(a, h); await seedPages(a, h);
    const before = await db.hospitalContent.findMany({ where: { hospitalId: h }, orderBy: { id: "asc" } }); const audits = await db.auditEvent.count();
    const first = await list(a, {}, db); await detail(a, first.items[0].id, db); await list(a, { category: "OTHER" }, db); await list(a, { cursor: first.nextCursor }, db);
    expect(await db.auditEvent.count()).toBe(audits);
    expect(await db.hospitalContent.findMany({ where: { hospitalId: h }, orderBy: { id: "asc" } })).toEqual(before);
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_name = 'PatientHospitalRelationship' AND table_schema = 'public'`;
    expect(columns.some((column) => column.column_name === "status")).toBe(false);
  });
});
