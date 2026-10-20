import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import { resolveParentChildHospitalReportAccessContext } from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import { reportHospitalServiceAreaAdoption } from "@/modules/hospital-service-areas/services/service-area-adoption-report";
import {
  attachHospitalServiceArea, endHospitalServiceArea, listEligibleServiceAreaCandidates,
  listManagedHospitalServiceAreas, resolveActiveHospitalServiceArea,
} from "@/modules/hospital-service-areas/services/hospital-service-area-service";

const db = getPrisma();
const hospitalIds: string[] = [];
const personIds: string[] = [];
const userIds: string[] = [];
let parentId: string;
let childId: string;
let owner: ActorContext;

beforeAll(() => {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
      process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Verified local disposable PostgreSQL required");
  }
});

async function hospital(parentHospitalId: string | null, kind: "PARENT" | "CHILD" | null): Promise<string> {
  const row = await db.hospital.create({ data: {
    hospitalCode: `SA${randomUUID().replaceAll("-", "").slice(0, 20)}`, name: "ทดสอบเขตบริการ", status: "ACTIVE", parentHospitalId,
    ...(kind ? { serviceAreaEligibility: { create: { kind, sourceReference: "synthetic-test-fixture/approved", verifiedAt: new Date() } } } : {}),
  } });
  hospitalIds.push(row.id);
  return row.id;
}

async function actor(hospitalId: string | null, roles: Role[] = ["HOSPITAL"], membershipType: "OWNER" | "MEMBER" = "OWNER"): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: `service-area-${randomUUID()}` } });
  personIds.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } } });
  userIds.push(user.id);
  if (hospitalId) await db.hospitalMembership.create({ data: { hospitalId, userId: user.id, status: "ACTIVE", membershipType } });
  return { userId: user.id, personId: person.id, roles, osmHospitalRelationships: [], hospitalMemberships: hospitalId ? [
    { hospitalId, hospitalStatus: "ACTIVE", status: "ACTIVE", membershipType, profession: null },
  ] : [] };
}

beforeEach(async () => {
  parentId = await hospital(null, "PARENT");
  childId = await hospital(parentId, "CHILD");
  owner = await actor(parentId);
});

afterEach(async () => {
  if (hospitalIds.length === 0 && userIds.length === 0 && personIds.length === 0) return;
  // Disposable integration DB only (runner validates local URL). Bypass append-only history
  // exclusively in this cleanup session, for UUIDs created by this test. No global trigger changes.
  if (hospitalIds.length > 0) await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitalIds } } });
  });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: userIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.person.deleteMany({ where: { id: { in: personIds } } });
  await db.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await db.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { parentHospitalId: null } });
  await db.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  hospitalIds.length = 0; personIds.length = 0; userIds.length = 0;
});

const input = (): { parentHospitalId: string; childHospitalId: string } => ({ parentHospitalId: parentId, childHospitalId: childId });
const attach = (): ReturnType<typeof attachHospitalServiceArea> => attachHospitalServiceArea(owner, input());

describe("Hospital operational service areas / PostgreSQL", () => {
  it("produces repeatable read-only adoption reports without creating or restoring assignments", async () => {
    const report = await reportHospitalServiceAreaAdoption(db);
    expect(await reportHospitalServiceAreaAdoption(db)).toEqual(report);
    expect(report.find((row) => row.childHospitalId === childId)?.disposition).toBe("READY_FOR_OWNER_ATTACH");
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId } })).toBe(0);
    const area = await attach();
    expect((await reportHospitalServiceAreaAdoption(db)).find((row) => row.childHospitalId === childId)?.disposition).toBe("ALREADY_ACTIVE");
    await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" });
    expect((await reportHospitalServiceAreaAdoption(db)).find((row) => row.childHospitalId === childId)?.disposition).toBe("ENDED_REQUIRES_EXPLICIT_REATTACH");
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId, endedAt: null } })).toBe(0);
    await db.hospitalServiceAreaEligibility.delete({ where: { hospitalId: childId } });
    expect((await reportHospitalServiceAreaAdoption(db)).find((row) => row.childHospitalId === childId)?.disposition).toBe("BLOCKED_CLASSIFICATION_OR_HIERARCHY");
  });
  it("attaches, lists, resolves, ends and reattaches with separate immutable history and exact audit attribution", async () => {
    expect((await listEligibleServiceAreaCandidates(owner, { parentHospitalId: parentId })).items.map(({ id }) => id)).toEqual([childId]);
    const area = await attach();
    expect((await resolveActiveHospitalServiceArea(owner, input())).id).toBe(area.id);
    expect((await listManagedHospitalServiceAreas(owner, { parentHospitalId: parentId })).items).toEqual([area]);
    expect((await listEligibleServiceAreaCandidates(owner, { parentHospitalId: parentId })).items).toEqual([]);
    await expect(attach()).rejects.toMatchObject({ code: "CONFLICT", message: "Child facility is already attached" });
    const ended = await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "สิ้นสุดเขตบริการ" });
    expect(ended.endedAt).toBeInstanceOf(Date);
    await expect(resolveActiveHospitalServiceArea(owner, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "again" })).rejects.toMatchObject({ code: "CONFLICT" });
    const newArea = await attach();
    expect(newArea.id).not.toBe(area.id);
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId } })).toBe(2);
    const old = await db.hospitalServiceArea.findUniqueOrThrow({ where: { id: area.id } });
    expect(old).toMatchObject({ createdByUserId: owner.userId, endedByUserId: owner.userId, endReason: "สิ้นสุดเขตบริการ" });
    const events = await db.auditEvent.findMany({ where: { resourceId: area.id }, orderBy: { createdAt: "asc" } });
    expect(events.map(({ action }) => action)).toEqual(["hospital_service_area.attached", "hospital_service_area.ended"]);
    expect(events[1]).toMatchObject({ actorUserId: owner.userId, metadata: { parentHospitalId: parentId, childHospitalId: childId, fromStatus: "ACTIVE", toStatus: "ENDED" } });
  });

  it("allows one winner under duplicate concurrent attachment and double-ending", async () => {
    const attempts = await Promise.allSettled([attach(), attach()]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId, endedAt: null } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: owner.userId, action: "hospital_service_area.attached" } })).toBe(1);
    const [area] = (await listManagedHospitalServiceAreas(owner, { parentHospitalId: parentId })).items;
    const ends = await Promise.allSettled([1, 2].map(() => endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "จบงาน" })));
    expect(ends.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { actorUserId: owner.userId, action: "hospital_service_area.ended" } })).toBe(1);
  });

  it("keeps paginated candidates/areas scoped and handles stale eligibility without granting data access", async () => {
    const secondChild = await hospital(parentId, "CHILD");
    const otherParent = await hospital(null, "PARENT");
    await hospital(otherParent, "CHILD");
    const candidates = await listEligibleServiceAreaCandidates(owner, { parentHospitalId: parentId, limit: 1 });
    expect(candidates.items).toHaveLength(1);
    const remaining = await listEligibleServiceAreaCandidates(owner, { parentHospitalId: parentId, limit: 1, afterId: candidates.nextAfterId });
    expect(new Set([...candidates.items, ...remaining.items].map(({ id }) => id))).toEqual(new Set([childId, secondChild]));
    const area = await attach();
    await attachHospitalServiceArea(owner, { parentHospitalId: parentId, childHospitalId: secondChild });
    const first = await listManagedHospitalServiceAreas(owner, { parentHospitalId: parentId, limit: 1 });
    const last = await listManagedHospitalServiceAreas(owner, { parentHospitalId: parentId, limit: 1, afterId: first.nextAfterId });
    expect(last.nextAfterId).toBeNull();
    expect(new Set([...first.items, ...last.items].map(({ childHospitalId }) => childHospitalId))).toEqual(new Set([childId, secondChild]));
    await db.hospital.update({ where: { id: childId }, data: { status: "SUSPENDED" } });
    await expect(resolveActiveHospitalServiceArea(owner, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A stale/now-inactive Child must still be removable by the active Parent OWNER.
    await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "suspended" });
    await db.hospital.update({ where: { id: childId }, data: { status: "ACTIVE" } });
    await attach();
    await hospital(childId, "CHILD");
    await expect(resolveActiveHospitalServiceArea(owner, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("denies stale ownership on subsequent reads and end, while multi-role OWNER must qualify independently", async () => {
    await db.userRole.create({ data: { userId: owner.userId, role: "ADMIN" } });
    const multiRoleOwner = { ...owner, roles: ["HOSPITAL", "ADMIN"] as const };
    const area = await attachHospitalServiceArea(multiRoleOwner, input());
    await db.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { membershipType: "MEMBER" } });
    await expect(listManagedHospitalServiceAreas(multiRoleOwner, { parentHospitalId: parentId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveActiveHospitalServiceArea(multiRoleOwner, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(endHospitalServiceArea(multiRoleOwner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.hospitalServiceArea.findUniqueOrThrow({ where: { id: area.id } })).endedAt).toBeNull();
  });

  it("enforces uniqueness between competing Parents at the database boundary", async () => {
    const otherParent = await hospital(null, "PARENT");
    const data = { childHospitalId: childId, createdByUserId: owner.userId };
    const attempts = await Promise.allSettled([parentId, otherParent].map((parentHospitalId) => db.hospitalServiceArea.create({ data: { ...data, parentHospitalId } })));
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "P2002" });
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId, endedAt: null } })).toBe(1);
  });

  it("blocks competing Parent services and cross-Parent transfers, including after canonical reconciliation", async () => {
    const otherParent = await hospital(null, "PARENT");
    const otherOwner = await actor(otherParent);
    const attempts = await Promise.allSettled([attach(), attachHospitalServiceArea(otherOwner, { parentHospitalId: otherParent, childHospitalId: childId })]);
    expect(attempts.map(({ status }) => status)).toEqual(["fulfilled", "rejected"]);
    const [area] = (await listManagedHospitalServiceAreas(owner, { parentHospitalId: parentId })).items;
    await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" });
    await db.hospital.update({ where: { id: childId }, data: { parentHospitalId: otherParent } });
    await expect(attachHospitalServiceArea(otherOwner, { parentHospitalId: otherParent, childHospitalId: childId })).rejects.toMatchObject({ code: "CONFLICT", message: "Cross-Parent transfer requires a separately approved workflow" });
  });

  it("rejects self, unknown, ineligible, inactive and unsupported nested facilities", async () => {
    await expect(attachHospitalServiceArea(owner, { parentHospitalId: parentId, childHospitalId: parentId })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(attachHospitalServiceArea(owner, { parentHospitalId: parentId, childHospitalId: randomUUID() })).rejects.toMatchObject({ code: "VALIDATION" });
    await db.hospitalServiceAreaEligibility.delete({ where: { hospitalId: childId } });
    await expect(attach()).rejects.toMatchObject({ code: "VALIDATION" });
    await db.hospitalServiceAreaEligibility.create({ data: { hospitalId: childId, kind: "CHILD", sourceReference: "test", verifiedAt: new Date() } });
    for (const status of ["SUSPENDED", "PENDING_VERIFICATION"] as const) {
      await db.hospital.update({ where: { id: childId }, data: { status } });
      await expect(attach()).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await db.hospital.update({ where: { id: childId }, data: { status: "ACTIVE" } });
    await hospital(childId, "CHILD");
    await expect(attach()).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("denies MEMBER, Child-only OWNER, unrelated OWNER and ADMIN/OSM/PATIENT-only", async () => {
    const unrelated = await hospital(null, "PARENT");
    const denied = [await actor(parentId, ["HOSPITAL"], "MEMBER"), await actor(childId), await actor(unrelated),
      ...await Promise.all((["ADMIN", "OSM", "PATIENT"] as const).map((role) => actor(null, [role])))];
    for (const candidate of denied) {
      await expect(attachHospitalServiceArea(candidate, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listManagedHospitalServiceAreas(candidate, { parentHospitalId: parentId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(attachHospitalServiceArea(null, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("revalidates account, role, direct ownership, exact person and Parent on every operation", async () => {
    for (const status of ["SUSPENDED", "ENDED", "INVITED", "PROVISIONED"] as const) {
      const staleActor = await actor(parentId);
      await db.hospitalMembership.updateMany({ where: { userId: staleActor.userId }, data: { status } });
      await expect(attachHospitalServiceArea(staleActor, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await db.user.update({ where: { id: owner.userId }, data: { status: "SUSPENDED" } });
    await expect(attach()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.user.update({ where: { id: owner.userId }, data: { status: "ACTIVE" } });
    await db.userRole.delete({ where: { userId_role: { userId: owner.userId, role: "HOSPITAL" } } });
    await expect(attach()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.userRole.create({ data: { userId: owner.userId, role: "HOSPITAL" } });
    await expect(attachHospitalServiceArea({ ...owner, personId: randomUUID() }, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.hospital.update({ where: { id: parentId }, data: { status: "SUSPENDED" } });
    await expect(attach()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.hospital.update({ where: { id: parentId }, data: { status: "ACTIVE" } });
    await db.hospitalServiceAreaEligibility.delete({ where: { hospitalId: parentId } });
    await expect(attach()).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("does not trust forged membership context or leak other Parent relationship state", async () => {
    const otherParent = await hospital(null, "PARENT");
    const otherOwner = await actor(otherParent);
    const forged = { ...otherOwner, hospitalMemberships: owner.hospitalMemberships };
    await expect(attachHospitalServiceArea(forged, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const area = await attach();
    await expect(endHospitalServiceArea(otherOwner, { parentHospitalId: otherParent, areaId: area.id, confirm: true, endReason: "end" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(endHospitalServiceArea(otherOwner, { parentHospitalId: otherParent, areaId: randomUUID(), confirm: true, endReason: "end" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enforces immutable identities, terminal history, lifecycle checks, restrictive FK and no hard-delete in PostgreSQL", async () => {
    const area = await attach();
    await expect(db.hospitalServiceArea.create({ data: { parentHospitalId: parentId, childHospitalId: parentId, createdByUserId: owner.userId } })).rejects.toThrow();
    await expect(db.hospitalServiceArea.create({ data: { parentHospitalId: parentId, childHospitalId: randomUUID(), createdByUserId: owner.userId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.hospitalServiceArea.update({ where: { id: area.id }, data: { childHospitalId: randomUUID() } })).rejects.toThrow();
    await expect(db.hospitalServiceArea.update({ where: { id: area.id }, data: { endedAt: new Date() } })).rejects.toThrow();
    await expect(db.hospitalServiceArea.delete({ where: { id: area.id } })).rejects.toThrow();
    await expect(db.hospital.delete({ where: { id: childId } })).rejects.toMatchObject({ code: "P2003" });
    await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" });
    await expect(db.hospitalServiceArea.update({ where: { id: area.id }, data: { endedAt: null, endedByUserId: null, endReason: null } })).rejects.toThrow();
    await expect(db.hospitalServiceArea.update({ where: { id: area.id }, data: { endReason: "rewrite" } })).rejects.toThrow();
  });

  it("rolls back attachment and termination if the required audit write fails", async () => {
    const failing = db.$extends({ query: { auditEvent: { async create(): Promise<never> { throw new Error("simulated audit failure"); } } } });
    const dependencies = { database: failing as unknown as PrismaClient };
    await expect(attachHospitalServiceArea(owner, input(), dependencies)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId } })).toBe(0);
    const area = await attach();
    await expect(endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" }, dependencies)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect((await db.hospitalServiceArea.findUniqueOrThrow({ where: { id: area.id } })).endedAt).toBeNull();
    expect(await db.auditEvent.count({ where: { resourceId: area.id } })).toBe(1);
  });

  it("rolls back audit and state on a subsequent transaction failure", async () => {
    await expect(db.$transaction(async (tx) => {
      const area = await tx.hospitalServiceArea.create({ data: { ...input(), createdByUserId: owner.userId } });
      await tx.auditEvent.create({ data: { actorUserId: owner.userId, action: "hospital_service_area.attached", resourceType: "HospitalServiceArea", resourceId: area.id } });
      throw new Error("rollback");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })).rejects.toThrow("rollback");
    expect(await db.hospitalServiceArea.count({ where: { childHospitalId: childId } })).toBe(0);
    expect(await db.auditEvent.count({ where: { actorUserId: owner.userId } })).toBe(0);
  });

  it("preserves hierarchy, Patient/workforce relationships, summary permissions and direct scope", async () => {
    const beforeChild = await db.hospital.findUniqueOrThrow({ where: { id: childId } });
    const before = await db.hospitalMembership.count({ where: { hospitalId: childId } });
    const patients = await db.patientHospitalRelationship.count({ where: { hospitalId: childId } });
    const report = await resolveParentChildHospitalReportAccessContext(owner, parentId, childId);
    const area = await attach();
    expect(hasDirectHospitalPatientReadScope(owner, parentId)).toBe(true);
    expect(hasDirectHospitalPatientReadScope(owner, childId)).toBe(false);
    expect(await resolveParentChildHospitalReportAccessContext(owner, parentId, childId)).toEqual(report);
    await endHospitalServiceArea(owner, { parentHospitalId: parentId, areaId: area.id, confirm: true, endReason: "end" });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: childId } })).toEqual(beforeChild);
    expect(await db.hospitalMembership.count({ where: { hospitalId: childId } })).toBe(before);
    expect(await db.patientHospitalRelationship.count({ where: { hospitalId: childId } })).toBe(patients);
    expect(await resolveParentChildHospitalReportAccessContext(owner, parentId, childId)).toEqual(report);
  });

  it("does not give canonical-unrelated Parent reporting or Patient access through an operational row", async () => {
    const otherParent = await hospital(null, "PARENT");
    const otherOwner = await actor(otherParent);
    // Deliberately inconsistent trusted fixture proves current report policy never consumes this table.
    await db.hospitalServiceArea.create({ data: { parentHospitalId: otherParent, childHospitalId: childId, createdByUserId: otherOwner.userId } });
    expect(hasDirectHospitalPatientReadScope(otherOwner, childId)).toBe(false);
    await expect(resolveParentChildHospitalReportAccessContext(otherOwner, otherParent, childId)).rejects.toThrow();
    await expect(resolveActiveHospitalServiceArea(otherOwner, { parentHospitalId: otherParent, childHospitalId: childId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
