import { randomUUID } from "node:crypto";
import { HospitalStatus, Role, type HospitalServiceAreaFacilityKind } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  createHospital as registerHospital,
  HospitalRetirementIneligibleError,
  restoreRetiredHospital,
  retireHospital,
  retireHospitals,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import { approveHospitalOnboarding, submitHospitalOnboarding } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { listOnboardingHospitals } from "@/modules/hospital-onboarding/services/onboarding-hospital-service";
import {
  clearHospitalNetworkRole, setHospitalNetworkRole, transferHospitalServiceArea,
} from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { attachHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";

// Phase N1 (ADR-0017 amendment): RETIRED Hospitals, idempotent registration and DB-enforced network roles.
const db = getPrisma();
const hospitalIds: string[] = [];
const personIds: string[] = [];
const userIds: string[] = [];
let admin: ActorContext;

beforeAll(() => {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
      process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Verified local disposable PostgreSQL required");
  }
});

async function user(roles: Role[], status: "ACTIVE" | "PROVISIONED" = "ACTIVE"): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: `registry-${randomUUID()}`, givenName: "ทดสอบ", familyName: "ทะเบียน" } });
  personIds.push(person.id);
  const created = await db.user.create({
    data: { personId: person.id, status, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } },
  });
  userIds.push(created.id);
  return { userId: created.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function hospital(
  status: HospitalStatus = HospitalStatus.PENDING_VERIFICATION, kind: HospitalServiceAreaFacilityKind | null = "CHILD",
): Promise<{ id: string; hospitalCode: string; name: string; updatedAt: Date }> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `RG${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`, name: `รพ.ทะเบียน ${hospitalIds.length}`, status,
      ...(kind ? { serviceAreaEligibility: { create: { kind, verifiedAt: new Date(), classifiedByUserId: admin.userId } } } : {}),
    },
    select: { id: true, hospitalCode: true, name: true, updatedAt: true },
  });
  hospitalIds.push(row.id);
  return row;
}

async function owner(hospitalId: string): Promise<ActorContext> {
  const actor = await user([Role.HOSPITAL]);
  await db.hospitalMembership.create({ data: { hospitalId, userId: actor.userId, status: "ACTIVE", membershipType: "OWNER" } });
  return { ...actor, hospitalMemberships: [{ hospitalId, hospitalStatus: "ACTIVE", status: "ACTIVE", membershipType: "OWNER", profession: null }] };
}

async function pendingApplication(hospitalId: string): Promise<string> {
  const applicant = await user([], "PROVISIONED");
  const application = await db.hospitalOnboardingApplication.create({ data: { hospitalId, applicantUserId: applicant.userId, status: "PENDING" } });
  return application.id;
}

/** Raw SQL error text carries the SQLSTATE (Prisma P2010 for raw queries). */
const checkViolation = /23514/u;

beforeEach(async () => {
  admin = await user([Role.ADMIN]);
});

afterEach(async () => {
  // Disposable integration DB only (runner validates local URL). Bypass append-only history exclusively in this
  // cleanup session, for rows created by this test.
  const createdHospitalIds = await db.hospital.findMany({
    where: { OR: [{ id: { in: hospitalIds } }, { registeredByUserId: { in: userIds } }] }, select: { id: true },
  });
  const allHospitalIds = createdHospitalIds.map(({ id }) => id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: allHospitalIds } } });
    await tx.hospitalRetirementEvent.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
    await tx.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
  });
  await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { resourceId: { in: allHospitalIds } }] } });
  await db.hospitalOnboardingApplication.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: userIds } } });
  await db.hospital.deleteMany({ where: { id: { in: allHospitalIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.person.deleteMany({ where: { id: { in: personIds } } });
  hospitalIds.length = 0; personIds.length = 0; userIds.length = 0;
});

describe("Hospital retirement (N1-D1/D2)", () => {
  it("retires a PENDING Hospital with a reason, keeps history, audits, and restores it", async () => {
    const target = await hospital();
    const retired = await retireHospital(admin, {
      hospitalId: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), reason: "  ลูกค้าไม่ใช้งาน  ",
    });
    expect(retired).toMatchObject({ id: target.id, status: HospitalStatus.RETIRED, retiredReason: "ลูกค้าไม่ใช้งาน" });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: target.id }, select: { retiredByUserId: true, retiredAt: true, hospitalCode: true } }))
      .toMatchObject({ retiredByUserId: admin.userId, retiredAt: expect.any(Date), hospitalCode: target.hospitalCode });

    // Stale version, wrong state.
    await expect(restoreRetiredHospital(admin, {
      hospitalId: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), reason: "คืน",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(retireHospital(admin, {
      hospitalId: target.id, expectedUpdatedAt: retired.updatedAt.toISOString(), reason: "ซ้ำ",
    })).rejects.toBeInstanceOf(HospitalRetirementIneligibleError);

    const restored = await restoreRetiredHospital(admin, {
      hospitalId: target.id, expectedUpdatedAt: retired.updatedAt.toISOString(), reason: "ลูกค้าเปลี่ยนใจ",
    });
    expect(restored).toMatchObject({ status: HospitalStatus.PENDING_VERIFICATION, retiredAt: null, retiredReason: null });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: target.id }, select: { retiredByUserId: true } })).toEqual({ retiredByUserId: null });
    await expect(restoreRetiredHospital(admin, {
      hospitalId: target.id, expectedUpdatedAt: restored.updatedAt.toISOString(), reason: "ซ้ำ",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await db.hospitalRetirementEvent.findMany({
      where: { hospitalId: target.id }, orderBy: { createdAt: "asc" }, select: { kind: true, reason: true, actorUserId: true },
    })).toEqual([
      { kind: "RETIRED", reason: "ลูกค้าไม่ใช้งาน", actorUserId: admin.userId },
      { kind: "RESTORED", reason: "ลูกค้าเปลี่ยนใจ", actorUserId: admin.userId },
    ]);
    expect(await db.auditEvent.findMany({
      where: { resourceId: target.id }, orderBy: { createdAt: "asc" }, select: { action: true, actorUserId: true, metadata: true },
    })).toEqual([
      { action: "hospital.retired", actorUserId: admin.userId,
        metadata: { hospitalCode: target.hospitalCode, fromStatus: "PENDING_VERIFICATION", toStatus: "RETIRED", reasonStored: true } },
      { action: "hospital.retired_restored", actorUserId: admin.userId,
        metadata: { hospitalCode: target.hospitalCode, fromStatus: "RETIRED", toStatus: "PENDING_VERIFICATION", reasonStored: true } },
    ]);
  });

  it("refuses ACTIVE, SUSPENDED, a pending application, blank reasons, stale versions and non-ADMIN actors", async () => {
    for (const status of [HospitalStatus.ACTIVE, HospitalStatus.SUSPENDED]) {
      const target = await hospital(status);
      await expect(retireHospital(admin, { hospitalId: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), reason: "x" }))
        .rejects.toMatchObject({ code: "CONFLICT", ineligible: [{ hospitalId: target.id, reason: "NOT_PENDING" }] });
    }

    const applied = await hospital();
    await pendingApplication(applied.id);
    await expect(retireHospital(admin, { hospitalId: applied.id, expectedUpdatedAt: applied.updatedAt.toISOString(), reason: "x" }))
      .rejects.toMatchObject({ code: "CONFLICT", ineligible: [{ hospitalId: applied.id, reason: "PENDING_APPLICATION" }] });

    const target = await hospital();
    const input = { hospitalId: target.id, expectedUpdatedAt: target.updatedAt.toISOString() };
    await expect(retireHospital(admin, { ...input, reason: "   " })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(retireHospital(admin, { ...input, reason: "ก".repeat(501) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(retireHospital(admin, { ...input, expectedUpdatedAt: new Date(0).toISOString(), reason: "x" }))
      .rejects.toMatchObject({ code: "CONFLICT" });

    const hospitalOwner = await owner((await hospital(HospitalStatus.ACTIVE, "PARENT")).id);
    await expect(retireHospital(hospitalOwner, { ...input, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Self-demoted ADMIN: the context still says ADMIN, the database no longer does.
    const demoted = await user([Role.ADMIN]);
    await db.userRole.deleteMany({ where: { userId: demoted.userId } });
    await expect(retireHospital(demoted, { ...input, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(restoreRetiredHospital(demoted, { ...input, reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await db.hospital.count({ where: { id: { in: hospitalIds }, status: HospitalStatus.RETIRED } })).toBe(0);
    expect(await db.hospitalRetirementEvent.count({ where: { hospitalId: { in: hospitalIds } } })).toBe(0);
  });

  it("keeps the retirement columns and history consistent in PostgreSQL", async () => {
    const target = await hospital();
    await expect(db.$executeRaw`UPDATE "Hospital" SET "status" = 'RETIRED' WHERE "id" = ${target.id}::uuid`).rejects.toThrow(checkViolation);
    await expect(db.$executeRaw`UPDATE "Hospital" SET "retiredReason" = 'x' WHERE "id" = ${target.id}::uuid`).rejects.toThrow(checkViolation);
    const retired = await retireHospital(admin, { hospitalId: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), reason: "x" });
    await expect(db.$executeRaw`UPDATE "Hospital" SET "retiredReason" = ' ' WHERE "id" = ${retired.id}::uuid`).rejects.toThrow(checkViolation);
    await expect(db.$executeRaw`UPDATE "HospitalRetirementEvent" SET "reason" = 'rewrite' WHERE "hospitalId" = ${target.id}::uuid`).rejects.toThrow(checkViolation);
    await expect(db.$executeRaw`DELETE FROM "HospitalRetirementEvent" WHERE "hospitalId" = ${target.id}::uuid`).rejects.toThrow(checkViolation);
    await expect(db.hospital.delete({ where: { id: target.id } })).rejects.toMatchObject({ code: "P2003" });
  });
});

describe("Bulk retirement (N1-D4)", () => {
  it("retires every eligible Hospital in one transaction with one audit event each", async () => {
    const targets = await Promise.all([hospital(), hospital(), hospital(HospitalStatus.PENDING_VERIFICATION, "PARENT")]);
    const retired = await retireHospitals(admin, { hospitalIds: targets.map(({ id }) => id), reason: "อดีตรายการ Master" });
    expect(retired).toHaveLength(3);
    expect(retired.every(({ status }) => status === HospitalStatus.RETIRED)).toBe(true);
    expect(await db.auditEvent.count({ where: { action: "hospital.retired", resourceId: { in: targets.map(({ id }) => id) } } })).toBe(3);
    expect(await db.hospitalRetirementEvent.count({ where: { hospitalId: { in: targets.map(({ id }) => id) }, kind: "RETIRED" } })).toBe(3);
  });

  it("changes nothing and names the ineligible Hospital when one selection is ineligible", async () => {
    const eligible = await Promise.all([hospital(), hospital()]);
    const active = await hospital(HospitalStatus.ACTIVE);
    const attempt = retireHospitals(admin, { hospitalIds: [...eligible, active].map(({ id }) => id), reason: "x" });
    await expect(attempt).rejects.toBeInstanceOf(HospitalRetirementIneligibleError);
    await expect(attempt).rejects.toMatchObject({
      ineligible: [{ hospitalId: active.id, hospitalCode: active.hospitalCode, name: active.name, reason: "NOT_PENDING" }],
    });
    expect(await db.hospital.count({ where: { id: { in: hospitalIds }, status: HospitalStatus.RETIRED } })).toBe(0);
    expect(await db.auditEvent.count({ where: { action: "hospital.retired" , resourceId: { in: hospitalIds } } })).toBe(0);
  });

  it("refuses a PENDING Hospital in an active network association (ADR-0018 ACTIVE_SERVICE_AREA)", async () => {
    const parent = await hospital(HospitalStatus.ACTIVE, "PARENT");
    const parentOwner = await owner(parent.id);
    const attachedPending = await hospital();
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: attachedPending.id, createdByUserId: parentOwner.userId } });
    const eligible = await hospital();
    await expect(retireHospitals(admin, { hospitalIds: [eligible.id, attachedPending.id], reason: "x" })).rejects.toMatchObject({
      ineligible: [{ hospitalId: attachedPending.id, hospitalCode: attachedPending.hospitalCode, name: attachedPending.name, reason: "ACTIVE_SERVICE_AREA" }],
    });
    expect(await db.hospital.count({ where: { id: { in: [eligible.id, attachedPending.id] }, status: HospitalStatus.RETIRED } })).toBe(0);
  });

  it("validates the selection size and uniqueness", async () => {
    await expect(retireHospitals(admin, { hospitalIds: Array.from({ length: 101 }, () => randomUUID()), reason: "x" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const target = await hospital();
    await expect(retireHospitals(admin, { hospitalIds: [target.id, target.id], reason: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(retireHospitals(admin, { hospitalIds: [], reason: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("A RETIRED Hospital is withdrawn everywhere (N1-D3)", () => {
  it("is absent from onboarding, refuses submit and approval, and is outside network changes", async () => {
    const retiredChild = await hospital();
    const retiredParent = await hospital(HospitalStatus.PENDING_VERIFICATION, "PARENT");
    await retireHospitals(admin, { hospitalIds: [retiredChild.id, retiredParent.id], reason: "ไม่ใช้งาน" });

    const listed = (await listOnboardingHospitals()).map(({ id }) => id);
    expect(listed).not.toContain(retiredChild.id);
    expect(listed).not.toContain(retiredParent.id);
    await expect(submitHospitalOnboarding({
      hospitalCode: retiredChild.hospitalCode, nationalId: "1000000000009", givenName: "สมชาย", familyName: "ใจดี",
      password: "correct-horse-battery-staple", passwordConfirmation: "correct-horse-battery-staple",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    // A leftover application (e.g. from before retirement) still cannot activate the Hospital.
    const applicationId = await pendingApplication(retiredChild.id);
    await expect(approveHospitalOnboarding({ applicationId, reviewerUserId: admin.userId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: retiredChild.id } })).status).toBe(HospitalStatus.RETIRED);

    const parent = await hospital(HospitalStatus.ACTIVE, "PARENT");
    const parentOwner = await owner(parent.id);
    await expect(attachHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, childHospitalId: retiredChild.id }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const child = await hospital(HospitalStatus.ACTIVE, "CHILD");
    const area = await attachHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, childHospitalId: child.id });
    await expect(transferHospitalServiceArea(admin, { areaId: area.id, toParentHospitalId: retiredParent.id, confirm: true, reason: "ย้าย" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setHospitalNetworkRole(admin, { hospitalId: retiredChild.id, kind: "PARENT" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(clearHospitalNetworkRole(admin, { hospitalId: retiredChild.id, confirm: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.hospitalServiceAreaEligibility.findUniqueOrThrow({ where: { hospitalId: retiredChild.id } })).kind).toBe("CHILD");
  });
});

describe("Idempotent registration (N1-D5)", () => {
  it("returns the same Hospital for a replayed nonce and refuses any other use of it", async () => {
    const submissionNonce = randomUUID();
    const input = { name: "โรงพยาบาลส่งซ้ำ", submissionNonce };
    const first = await registerHospital(admin, input);
    const replayed = await registerHospital(admin, input);
    expect(replayed).toEqual(first);
    expect(await db.hospital.count({ where: { registrationNonce: submissionNonce } })).toBe(1);
    expect(await db.hospital.findUniqueOrThrow({ where: { id: first.id }, select: { registeredByUserId: true } }))
      .toEqual({ registeredByUserId: admin.userId });
    expect(await db.auditEvent.count({ where: { action: "hospital.created", resourceId: first.id } })).toBe(1);

    await expect(registerHospital(admin, { ...input, name: "ชื่ออื่น" })).rejects.toMatchObject({ code: "CONFLICT" });
    // A code is never accepted from the client (always generated).
    await expect(registerHospital(admin, { ...input, hospitalCode: "OTHER-CODE" })).rejects.toMatchObject({ code: "VALIDATION" });
    const otherAdmin = await user([Role.ADMIN]);
    await expect(registerHospital(otherAdmin, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(registerHospital(admin, { name: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.hospital.count({ where: { registeredByUserId: { in: userIds } } })).toBe(1);
  });

  it("creates exactly one row for a concurrent double submit", async () => {
    const input = { name: "โรงพยาบาลกดซ้ำพร้อมกัน", submissionNonce: randomUUID() };
    const results = await Promise.allSettled([registerHospital(admin, input), registerHospital(admin, input)]);
    expect(await db.hospital.count({ where: { registrationNonce: input.submissionNonce } })).toBe(1);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(2);
    expect(new Set(fulfilled.map((result) => result.value.id)).size).toBe(1);
  });
});

describe("Network roles are enforced by PostgreSQL", () => {
  async function area(parentHospitalId: string, childHospitalId: string): Promise<number> {
    return db.$executeRaw`INSERT INTO "HospitalServiceArea" ("id", "parentHospitalId", "childHospitalId", "createdByUserId")
      VALUES (${randomUUID()}::uuid, ${parentHospitalId}::uuid, ${childHospitalId}::uuid, ${admin.userId}::uuid)`;
  }

  it("refuses an area whose Parent is not PARENT or whose Child has no CHILD role", async () => {
    const parent = await hospital(HospitalStatus.ACTIVE, "PARENT");
    const child = await hospital(HospitalStatus.ACTIVE, "CHILD");
    const otherChild = await hospital(HospitalStatus.ACTIVE, "CHILD");
    const roleless = await hospital(HospitalStatus.ACTIVE, null);
    await expect(area(child.id, otherChild.id)).rejects.toThrow(checkViolation);
    await expect(area(parent.id, roleless.id)).rejects.toThrow(checkViolation);
    await expect(area(roleless.id, child.id)).rejects.toThrow(checkViolation);
    await expect(area(parent.id, child.id)).resolves.toBe(1);
  });

  it("refuses changing or clearing a role referenced by an active area, and allows it once the area ended", async () => {
    const parent = await hospital(HospitalStatus.ACTIVE, "PARENT");
    const child = await hospital(HospitalStatus.ACTIVE, "CHILD");
    await area(parent.id, child.id);
    await expect(db.$executeRaw`UPDATE "HospitalServiceAreaEligibility" SET "kind" = 'PARENT' WHERE "hospitalId" = ${child.id}::uuid`)
      .rejects.toThrow(checkViolation);
    await expect(db.$executeRaw`UPDATE "HospitalServiceAreaEligibility" SET "kind" = 'CHILD' WHERE "hospitalId" = ${parent.id}::uuid`)
      .rejects.toThrow(checkViolation);
    await expect(db.$executeRaw`DELETE FROM "HospitalServiceAreaEligibility" WHERE "hospitalId" = ${child.id}::uuid`)
      .rejects.toThrow(checkViolation);
    // Re-classifying with the same kind (verifiedAt/actor only) stays allowed.
    await expect(db.$executeRaw`UPDATE "HospitalServiceAreaEligibility" SET "verifiedAt" = CURRENT_TIMESTAMP WHERE "hospitalId" = ${child.id}::uuid`)
      .resolves.toBe(1);

    await db.$executeRaw`UPDATE "HospitalServiceArea" SET "endedAt" = CURRENT_TIMESTAMP, "endedByUserId" = ${admin.userId}::uuid, "endReason" = 'end'
      WHERE "childHospitalId" = ${child.id}::uuid AND "endedAt" IS NULL`;
    await expect(db.$executeRaw`UPDATE "HospitalServiceAreaEligibility" SET "kind" = 'PARENT' WHERE "hospitalId" = ${child.id}::uuid`).resolves.toBe(1);
    await expect(db.$executeRaw`DELETE FROM "HospitalServiceAreaEligibility" WHERE "hospitalId" = ${parent.id}::uuid`).resolves.toBe(1);
  });
});
