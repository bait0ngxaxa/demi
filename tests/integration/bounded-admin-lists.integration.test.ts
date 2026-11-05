import { randomUUID } from "node:crypto";
import { HospitalStatus, Role, type HospitalServiceAreaFacilityKind } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  listPendingHospitalOnboardingApplications,
  PENDING_HOSPITAL_ONBOARDING_PAGE_SIZE,
} from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import {
  OnboardingHospitalSearchRateLimitedError,
  searchOnboardingHospitals,
} from "@/modules/hospital-onboarding/services/onboarding-hospital-service";
import {
  listHospitalNetworkDirectoryForAdmin,
  searchHospitalTransferTargetsForAdmin,
} from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import {
  createPublicSelfRegistrationRateLimiter,
  PUBLIC_SELF_REGISTRATION_RATE_LIMITS,
} from "@/modules/self-registration/services/public-self-registration-rate-limit";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

// Bounded list reads: every ADMIN and public Hospital list is paged (25) or searched (10), never the whole registry.
const db = getPrisma();
const hospitalIds: string[] = [];
const personIds: string[] = [];
const userIds: string[] = [];
let admin: ActorContext;
let token: string;

beforeAll(() => {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
      process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Verified local disposable PostgreSQL required");
  }
});

async function user(roles: Role[], status: "ACTIVE" | "PROVISIONED" = "ACTIVE"): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: `bounded-${randomUUID()}`, givenName: "ทดสอบ", familyName: "รายการ" } });
  personIds.push(person.id);
  const created = await db.user.create({
    data: { personId: person.id, status, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } },
  });
  userIds.push(created.id);
  return { userId: created.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function hospital(
  name: string,
  status: HospitalStatus,
  kind: HospitalServiceAreaFacilityKind | null,
  extra: { registeredForParentHospitalId?: string } = {},
): Promise<{ id: string; hospitalCode: string; name: string }> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `BL${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`, name, status,
      ...(extra.registeredForParentHospitalId
        ? { registeredForParentHospitalId: extra.registeredForParentHospitalId, registeredByUserId: admin.userId }
        : {}),
      ...(status === HospitalStatus.RETIRED
        ? { retiredAt: new Date(), retiredByUserId: admin.userId, retiredReason: "ไม่ใช้งาน" }
        : {}),
      ...(kind ? { serviceAreaEligibility: { create: { kind, verifiedAt: new Date(), classifiedByUserId: admin.userId } } } : {}),
    },
    select: { id: true, hospitalCode: true, name: true },
  });
  hospitalIds.push(row.id);
  return row;
}

const pad = (index: number): string => String(index).padStart(2, "0");

beforeEach(async () => {
  admin = await user([Role.ADMIN]);
  token = `ขอบเขต${randomUUID().slice(0, 8)}`;
});

afterEach(async () => {
  // Disposable integration DB only (runner validates local URL); rows created by this test.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { OR: [{ parentHospitalId: { in: hospitalIds } }, { childHospitalId: { in: hospitalIds } }] } });
    await tx.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  });
  await db.hospitalOnboardingApplication.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await db.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { registeredForParentHospitalId: null } });
  await db.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.person.deleteMany({ where: { id: { in: personIds } } });
  hospitalIds.length = 0; personIds.length = 0; userIds.length = 0;
});

describe("ADMIN Hospital directory (paged, filtered in SQL)", () => {
  it("pages 25 at a time by name, code and id, clamps a page past the end and filters by status in the query", async () => {
    for (let index = 0; index < 27; index += 1) {
      await hospital(`${token} ${pad(index)}`, index % 2 === 0 ? HospitalStatus.ACTIVE : HospitalStatus.PENDING_VERIFICATION, "PARENT");
    }
    const retired = await hospital(`${token} ถอน`, HospitalStatus.RETIRED, "PARENT");

    const first = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", value: ` ${token} `, page: 1 });
    expect(first).toMatchObject({ page: 1, totalPages: 2, hasPreviousPage: false, hasNextPage: true, total: 27 });
    expect(first.items.map(({ name }) => name)).toEqual(Array.from({ length: 25 }, (_, index) => `${token} ${pad(index)}`));
    const last = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", value: token, page: 99 });
    expect(last).toMatchObject({ page: 2, totalPages: 2, hasPreviousPage: true, hasNextPage: false });
    expect(last.items.map(({ name }) => name)).toEqual([`${token} 25`, `${token} 26`]);
    // N1-D3: RETIRED is outside the network view and is the whole "ถอนแล้ว" view.
    expect([...first.items, ...last.items].map(({ id }) => id)).not.toContain(retired.id);
    const retiredPage = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "retired", value: token });
    expect(retiredPage.items.map(({ id }) => id)).toEqual([retired.id]);
    const pending = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "pending", value: token });
    expect(pending.total).toBe(13);
    expect(pending.items.every(({ status }) => status === HospitalStatus.PENDING_VERIFICATION)).toBe(true);
    // The code search matches too.
    const byCode = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "retired", value: retired.hospitalCode.slice(0, 12).toLowerCase() });
    expect(byCode.items.map(({ id }) => id)).toEqual([retired.id]);
    const nothing = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", value: `${token}-ไม่มี`, page: 4 });
    expect(nothing).toMatchObject({ items: [], page: 1, totalPages: 1, total: 0 });
  });

  it("names each row's active Parent and registering Parent from only the Parents the page refers to", async () => {
    const parent = await hospital(`${token} แม่ข่าย`, HospitalStatus.ACTIVE, "PARENT");
    const child = await hospital(`${token} ลูกข่าย`, HospitalStatus.ACTIVE, "CHILD", { registeredForParentHospitalId: parent.id });
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: child.id, createdByUserId: admin.userId } });

    const page = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", value: `${token} ลูก` });
    expect(page.items).toEqual([expect.objectContaining({
      id: child.id,
      role: "CHILD",
      networkParentId: parent.id,
      networkParentName: parent.name,
      registeredForParentHospitalId: parent.id,
      registeredForParentHospitalName: parent.name,
    })]);
  });

  it("narrows the network view by placement in the query, counts the structure and counts each Parent's active Children", async () => {
    const before = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", value: `${token}-ไม่มี` });
    const parent = await hospital(`${token} ก แม่ข่าย`, HospitalStatus.ACTIVE, "PARENT");
    const placed = await hospital(`${token} ข ลูกข่ายมีแม่`, HospitalStatus.ACTIVE, "CHILD");
    const ended = await hospital(`${token} ค ลูกข่ายสิ้นสุด`, HospitalStatus.ACTIVE, "CHILD");
    const free = await hospital(`${token} ง ลูกข่ายว่าง`, HospitalStatus.PENDING_VERIFICATION, "CHILD");
    const unclassified = await hospital(`${token} จ ไม่กำหนด`, HospitalStatus.ACTIVE, null);
    // RETIRED stays out of every network count and placement.
    await hospital(`${token} ฉ ถอน`, HospitalStatus.RETIRED, null);
    await hospital(`${token} ช ถอนแม่`, HospitalStatus.RETIRED, "PARENT");
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: placed.id, createdByUserId: admin.userId } });
    await db.hospitalServiceArea.create({
      data: { parentHospitalId: parent.id, childHospitalId: ended.id, createdByUserId: admin.userId,
        createdAt: new Date(Date.now() - 60_000), endedAt: new Date(), endedByUserId: admin.userId, endReason: "สิ้นสุด" },
    });

    const ids = async (placement: string): Promise<string[]> =>
      (await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", placement, value: token })).items.map(({ id }) => id);
    expect(await ids("all")).toEqual([parent.id, placed.id, ended.id, free.id, unclassified.id]);
    expect(await ids("parent")).toEqual([parent.id]);
    // A Child whose only area has ended has no active Parent.
    expect(await ids("child_unplaced")).toEqual([ended.id, free.id]);
    expect(await ids("unclassified")).toEqual([unclassified.id]);

    const page = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", placement: "parent", value: token });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: parent.id, activeChildCount: 1 });
    expect((await listHospitalNetworkDirectoryForAdmin(admin, { filter: "network", placement: "all", value: `${token} ข` })).items[0])
      .toMatchObject({ id: placed.id, activeChildCount: 0 });

    // The counts cover the whole non-RETIRED network, whatever the search and placement.
    expect(page.networkCounts).toEqual({
      parents: before.networkCounts!.parents + 1,
      childrenWithoutParent: before.networkCounts!.childrenWithoutParent + 2,
      unclassified: before.networkCounts!.unclassified + 1,
      total: before.networkCounts!.total + 5,
    });
    const notRetired = { status: { not: HospitalStatus.RETIRED } } as const;
    expect(page.networkCounts).toEqual({
      parents: await db.hospital.count({ where: { ...notRetired, serviceAreaEligibility: { is: { kind: "PARENT" } } } }),
      childrenWithoutParent: await db.hospital.count({
        where: { ...notRetired, serviceAreaEligibility: { is: { kind: "CHILD" } }, serviceAreaAssignments: { none: { endedAt: null } } },
      }),
      unclassified: await db.hospital.count({ where: { ...notRetired, serviceAreaEligibility: { is: null } } }),
      total: await db.hospital.count({ where: notRetired }),
    });

    // The placement applies to the network view only; the other views carry no counts.
    const retiredView = await listHospitalNetworkDirectoryForAdmin(admin, { filter: "retired", placement: "parent", value: token });
    expect(retiredView.items).toHaveLength(2);
    expect(retiredView.networkCounts).toBeNull();
    await expect(listHospitalNetworkDirectoryForAdmin(admin, { placement: "orphans" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a non-ADMIN and a search longer than 100 characters", async () => {
    await expect(listHospitalNetworkDirectoryForAdmin(await user([Role.HOSPITAL]), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listHospitalNetworkDirectoryForAdmin(admin, { value: "ก".repeat(101) })).rejects.toBeInstanceOf(ValidationError);
    await expect(listHospitalNetworkDirectoryForAdmin(admin, { filter: "everything" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ADMIN transfer targets (server search, 10 results)", () => {
  it("answers the first ten ACTIVE Parents by name or code, never the current Parent, a Child or an inactive Parent", async () => {
    const current = await hospital(`${token} ปัจจุบัน`, HospitalStatus.ACTIVE, "PARENT");
    const child = await hospital(`${token} ลูกข่ายโอน`, HospitalStatus.ACTIVE, "CHILD");
    await db.hospitalServiceArea.create({ data: { parentHospitalId: current.id, childHospitalId: child.id, createdByUserId: admin.userId } });
    const targets = [];
    for (let index = 0; index < 12; index += 1) {
      targets.push(await hospital(`${token} ปลายทาง ${pad(index)}`, HospitalStatus.ACTIVE, "PARENT"));
    }
    await hospital(`${token} ปลายทาง รอ`, HospitalStatus.PENDING_VERIFICATION, "PARENT");
    await hospital(`${token} ปลายทาง ลูก`, HospitalStatus.ACTIVE, "CHILD");

    const found = await searchHospitalTransferTargetsForAdmin(admin, { hospitalId: child.id, value: token });
    expect(found.map(({ id }) => id)).toEqual(targets.slice(0, 10).map(({ id }) => id));
    expect(found.map(({ id }) => id)).not.toContain(current.id);
    expect(found[0]).toEqual({ id: targets[0]!.id, hospitalCode: targets[0]!.hospitalCode, name: targets[0]!.name, status: HospitalStatus.ACTIVE });
    expect(await searchHospitalTransferTargetsForAdmin(admin, { hospitalId: child.id, value: targets[11]!.hospitalCode }))
      .toEqual([expect.objectContaining({ id: targets[11]!.id })]);
    // No active Parent: nothing to transfer from.
    expect(await searchHospitalTransferTargetsForAdmin(admin, { hospitalId: current.id, value: token })).toEqual([]);
    await expect(searchHospitalTransferTargetsForAdmin(await user([Role.HOSPITAL]), { hospitalId: child.id, value: token }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Public onboarding Hospital search (min 2 characters, 10 results, rate limited)", () => {
  const allow = { consume: async (): Promise<boolean> => true };

  it("answers at most ten onboardable Parents by name, matching the name or the code", async () => {
    const parents = [];
    for (let index = 0; index < 12; index += 1) {
      parents.push(await hospital(`${token} สมัคร ${pad(index)}`, HospitalStatus.PENDING_VERIFICATION, "PARENT"));
    }
    const child = await hospital(`${token} สมัคร ลูก`, HospitalStatus.PENDING_VERIFICATION, "CHILD");
    const active = await hospital(`${token} สมัคร ใช้งาน`, HospitalStatus.ACTIVE, "PARENT");

    const found = await searchOnboardingHospitals(token, { ipAddress: "127.0.0.1" }, { rateLimiter: allow });
    expect(found.map(({ id }) => id)).toEqual(parents.slice(0, 10).map(({ id }) => id));
    expect(found.map(({ id }) => id)).not.toContain(child.id);
    expect(found.map(({ id }) => id)).not.toContain(active.id);
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(["hospitalCode", "id", "name", "networkRole"]);
    expect(await searchOnboardingHospitals(parents[11]!.hospitalCode.toLowerCase(), { ipAddress: "127.0.0.1" }, { rateLimiter: allow }))
      .toEqual([expect.objectContaining({ id: parents[11]!.id })]);
    await expect(searchOnboardingHospitals("ก", { ipAddress: "127.0.0.1" }, { rateLimiter: allow })).rejects.toBeInstanceOf(ValidationError);
  });

  it("limits each client with the public rate limiter and fails closed without a client address", async () => {
    const rateLimiter = createPublicSelfRegistrationRateLimiter(db, "integration-rate-limit-secret");
    const ipAddress = `198.51.100.${Math.floor(Math.random() * 200) + 1}-${randomUUID()}`.slice(0, 64);
    const now = new Date();
    const { limit } = PUBLIC_SELF_REGISTRATION_RATE_LIMITS.HOSPITAL_SEARCH;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      await searchOnboardingHospitals(token, { ipAddress }, { rateLimiter, now: () => now });
    }
    await expect(searchOnboardingHospitals(token, { ipAddress }, { rateLimiter, now: () => now }))
      .rejects.toBeInstanceOf(OnboardingHospitalSearchRateLimitedError);
    await expect(searchOnboardingHospitals(token, { ipAddress: "" }, { rateLimiter, now: () => now })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });
});

describe("ADMIN pending onboarding applications (paged, oldest first)", () => {
  it("pages the review queue 25 at a time, oldest first, and clamps a page past the end", async () => {
    const before = await db.hospitalOnboardingApplication.count({ where: { status: "PENDING" } });
    const base = Date.UTC(2020, 0, 1);
    for (let index = 0; index < 27; index += 1) {
      const target = await hospital(`${token} คำขอ ${pad(index)}`, HospitalStatus.PENDING_VERIFICATION, "PARENT");
      const applicant = await user([], "PROVISIONED");
      // Older than anything another test leaves, so this fixture is the head of the queue.
      await db.hospitalOnboardingApplication.create({
        data: { hospitalId: target.id, applicantUserId: applicant.userId, status: "PENDING", createdAt: new Date(base + index * 60_000) },
      });
    }

    const first = await listPendingHospitalOnboardingApplications({ page: 1 });
    expect(first.total).toBe(before + 27);
    expect(first.items).toHaveLength(PENDING_HOSPITAL_ONBOARDING_PAGE_SIZE);
    expect(first.items.map(({ hospitalName }) => hospitalName)).toEqual(Array.from({ length: 25 }, (_, index) => `${token} คำขอ ${pad(index)}`));
    const second = await listPendingHospitalOnboardingApplications({ page: 2 });
    expect(second.items.slice(0, 2).map(({ hospitalName }) => hospitalName)).toEqual([`${token} คำขอ 25`, `${token} คำขอ 26`]);
    const clamped = await listPendingHospitalOnboardingApplications({ page: 999 });
    expect(clamped.page).toBe(clamped.totalPages);
    await expect(listPendingHospitalOnboardingApplications({ page: 0 })).rejects.toBeInstanceOf(ValidationError);
  });
});
