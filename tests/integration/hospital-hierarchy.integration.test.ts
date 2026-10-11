import { randomUUID } from "node:crypto";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  listHospitalReportingHospitals,
} from "@/modules/reporting/services/hospital-report-access-service";
import {
  APPROVED_HOSPITAL_MASTER_COUNTS,
  reconcileHospitalMaster,
  validateHospitalMasterSource,
} from "@/modules/hospital-hierarchy/services/hospital-master-reconciliation-service";
import {
  getHospitalHierarchyContext,
  getHospitalHierarchyDirectory,
  resolveDirectChildFacilities,
  resolveHospitalNetworkScope,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

import approvedSource from "../../prisma/seed/hospital-master-v2.json";

const prisma = getPrisma();
const previousReportingEnabled = process.env.DEMI_HOSPITAL_REPORTING_ENABLED;

type Fixture = {
  hospitalCodes: string[];
  personIds: string[];
  userIds: string[];
};

type ActorFixture = { actor: ActorContext; userId: string; membershipId: string | null };

let currentFixture: Fixture | null = null;

function newFixture(): Fixture {
  return { hospitalCodes: [], personIds: [], userIds: [] };
}

async function cleanFixture(fixture: Fixture): Promise<void> {
  if (fixture.userIds.length > 0) {
    await prisma.hospitalMembership.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  }
  if (fixture.personIds.length > 0) {
    await prisma.person.deleteMany({ where: { id: { in: fixture.personIds } } });
  }

  const hospitals = fixture.hospitalCodes.length > 0
    ? await prisma.hospital.findMany({
        where: { hospitalCode: { startsWith: fixture.hospitalCodes[0] } },
        select: { id: true },
      })
    : [];
  const hospitalIds = hospitals.map(({ id }) => id);
  if (hospitalIds.length > 0) {
    await prisma.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { parentHospitalId: null } });
    await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  }
}

async function createHospital(
  fixture: Fixture,
  codePrefix: string,
  name: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
  parentHospitalId: string | null = null,
): Promise<{ id: string; hospitalCode: string; name: string; status: HospitalStatus }> {
  const hospital = await prisma.hospital.create({
    data: {
      hospitalCode: `${codePrefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`,
      name,
      status,
      parentHospitalId,
    },
    select: { id: true, hospitalCode: true, name: true, status: true },
  });
  fixture.hospitalCodes.push(hospital.hospitalCode);
  return hospital;
}

async function createActor(
  fixture: Fixture,
  input: {
    roles: readonly Role[];
    membership?: {
      hospitalId: string;
      hospitalStatus: HospitalStatus;
      membershipType: MembershipType;
      status: MembershipStatus;
    };
    userStatus?: UserStatus;
  },
): Promise<ActorFixture> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `hierarchy-${randomUUID()}`,
      givenName: "ผู้ดูแล",
      familyName: randomUUID().slice(0, 8),
    },
    select: { id: true },
  });
  fixture.personIds.push(person.id);
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: randomUUID(),
      status: input.userStatus ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  fixture.userIds.push(user.id);
  await prisma.userRole.createMany({ data: input.roles.map((role) => ({ userId: user.id, role })) });

  let membershipId: string | null = null;
  const hospitalMemberships: ActorContext["hospitalMemberships"][number][] = [];
  if (input.membership) {
    const membership = await prisma.hospitalMembership.create({
      data: {
        userId: user.id,
        hospitalId: input.membership.hospitalId,
        membershipType: input.membership.membershipType,
        status: input.membership.status,
      },
      select: { id: true },
    });
    membershipId = membership.id;
    hospitalMemberships.push({
      hospitalId: input.membership.hospitalId,
      membershipType: input.membership.membershipType,
      profession: null,
      status: input.membership.status,
      hospitalStatus: input.membership.hospitalStatus,
    });
  }

  return {
    userId: user.id,
    membershipId,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: input.roles,
      hospitalMemberships,
      osmHospitalRelationships: [],
    },
  };
}

function syntheticMaster(prefix: string): ReturnType<typeof validateHospitalMasterSource> {
  const approved = validateHospitalMasterSource(approvedSource);
  const codeByApprovedCode = new Map(
    approved.map((record, index) => [record.canonicalCode, `${prefix}${String(index + 1).padStart(2, "0")}`]),
  );
  return approved.map((record) => {
    const canonicalCode = codeByApprovedCode.get(record.canonicalCode);
    const parentCanonicalCode = record.parentCanonicalCode === null
      ? null
      : codeByApprovedCode.get(record.parentCanonicalCode);
    if (!canonicalCode || parentCanonicalCode === undefined) {
      throw new Error("Approved Hospital Master mapping is incomplete");
    }
    return { canonicalCode, nameTh: record.nameTh, parentCanonicalCode };
  });
}

beforeAll(() => {
  process.env.DEMI_HOSPITAL_REPORTING_ENABLED = "true";
});

afterEach(async () => {
  if (currentFixture) await cleanFixture(currentFixture);
  currentFixture = null;
});

afterAll(() => {
  if (previousReportingEnabled === undefined) {
    delete process.env.DEMI_HOSPITAL_REPORTING_ENABLED;
  } else {
    process.env.DEMI_HOSPITAL_REPORTING_ENABLED = previousReportingEnabled;
  }
});

describe("Hospital hierarchy and Master reconciliation on synthetic PostgreSQL", () => {
  it("reconciles all approved records transactionally without overwriting or deleting unrelated data", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const prefix = `HM${randomUUID().replaceAll("-", "").slice(0, 6)}`.toUpperCase();
    fixture.hospitalCodes.push(prefix);
    const source = syntheticMaster(prefix);
    const unexpected = await createHospital(
      fixture,
      `${prefix}U`,
      "หน่วยบริการสังเคราะห์ที่เพิ่มใหม่",
      HospitalStatus.SUSPENDED,
    );
    const cycleA = await createHospital(fixture, `${prefix}X`, "หน่วยทดสอบวงจร A");
    const cycleB = await createHospital(fixture, `${prefix}Y`, "หน่วยทดสอบวงจร B");
    await prisma.hospital.update({ where: { id: cycleA.id }, data: { parentHospitalId: cycleB.id } });
    await prisma.hospital.update({ where: { id: cycleB.id }, data: { parentHospitalId: cycleA.id } });

    const invalidReport = await reconcileHospitalMaster(prisma, source);
    expect(invalidReport.categories.INVALID_HIERARCHY.filter(({ reason }) => reason === "cyclic Hospital hierarchy"))
      .toHaveLength(2);
    await expect(reconcileHospitalMaster(prisma, source, { mode: "apply" })).rejects.toThrow(/invalid Hospital hierarchy/u);
    await prisma.hospital.updateMany({ where: { id: { in: [cycleA.id, cycleB.id] } }, data: { parentHospitalId: null } });

    const beforeCount = await prisma.hospital.count({ where: { hospitalCode: { startsWith: prefix } } });
    const dryRun = await reconcileHospitalMaster(prisma, source);
    expect(dryRun.approved).toEqual(APPROVED_HOSPITAL_MASTER_COUNTS);
    expect(dryRun.categories.MISSING_HOSPITAL).toHaveLength(78);
    expect(dryRun.categories.MATCHED).toHaveLength(0);
    expect(dryRun.categories.UNEXPECTED_HOSPITAL.map(({ hospitalCode }) => hospitalCode)).toContain(unexpected.hospitalCode);
    expect(await prisma.hospital.count({ where: { hospitalCode: { startsWith: prefix } } })).toBe(beforeCount);

    const imported = await reconcileHospitalMaster(prisma, source, { mode: "apply" });
    expect(imported.categories.MATCHED).toHaveLength(78);
    expect(imported.categories.MISSING_HOSPITAL).toHaveLength(0);
    expect(imported.categories.MISSING_PARENT).toHaveLength(0);
    expect(imported.applied.created).toHaveLength(78);
    expect(imported.categories.UNEXPECTED_HOSPITAL.map(({ hospitalCode }) => hospitalCode)).toContain(unexpected.hospitalCode);

    const childSource = source.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    const otherMainSource = source.find(
      ({ canonicalCode, parentCanonicalCode }) => canonicalCode !== childSource?.parentCanonicalCode && parentCanonicalCode === null,
    );
    if (!childSource || !otherMainSource) throw new Error("Synthetic Master fixture is incomplete");
    const childBefore = await prisma.hospital.findUniqueOrThrow({
      where: { hospitalCode: childSource.canonicalCode },
      select: { id: true, status: true, parentHospitalId: true },
    });
    const otherMain = await prisma.hospital.findUniqueOrThrow({
      where: { hospitalCode: otherMainSource.canonicalCode },
      select: { id: true },
    });
    await prisma.hospital.update({
      where: { id: childBefore.id },
      data: { name: "ชื่อที่ต้องตรวจยืนยัน", parentHospitalId: otherMain.id, status: HospitalStatus.ACTIVE },
    });
    const hospitalOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: childBefore.id,
        hospitalStatus: HospitalStatus.ACTIVE,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const mismatchDryRun = await reconcileHospitalMaster(prisma, source);
    expect(mismatchDryRun.categories.NAME_MISMATCH.map(({ hospitalCode }) => hospitalCode)).toContain(childSource.canonicalCode);
    expect(mismatchDryRun.categories.PARENT_MISMATCH.map(({ hospitalCode }) => hospitalCode)).toContain(childSource.canonicalCode);
    await expect(reconcileHospitalMaster(prisma, source, { mode: "apply" })).rejects.toThrow(/confirm-name-changes/u);
    const unchanged = await prisma.hospital.findUniqueOrThrow({
      where: { id: childBefore.id },
      select: { id: true, name: true, status: true, parentHospitalId: true },
    });
    expect(unchanged).toMatchObject({ name: "ชื่อที่ต้องตรวจยืนยัน", status: HospitalStatus.ACTIVE, parentHospitalId: otherMain.id });

    const corrected = await reconcileHospitalMaster(prisma, source, {
      mode: "apply",
      confirmNameChanges: true,
      confirmParentChanges: true,
    });
    expect(corrected.categories.MATCHED).toHaveLength(78);
    expect(corrected.applied.renamed).toContain(childSource.canonicalCode);
    expect(corrected.applied.reparented).toContain(childSource.canonicalCode);
    expect(await prisma.hospital.findUniqueOrThrow({ where: { id: childBefore.id }, select: { id: true, name: true, status: true } }))
      .toEqual({ id: childBefore.id, name: childSource.nameTh, status: HospitalStatus.ACTIVE });
    expect(await prisma.hospitalMembership.findUnique({
      where: { userId_hospitalId: { userId: hospitalOwner.userId, hospitalId: childBefore.id } },
      select: { status: true },
    })).toEqual({ status: MembershipStatus.ACTIVE });
    expect(await prisma.hospital.findUnique({ where: { id: unexpected.id }, select: { id: true } })).toEqual({ id: unexpected.id });
  });

  it("resolves direct-child-only structure, status eligibility and P/C/N without clinical data", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const prefix = `HX${randomUUID().replaceAll("-", "").slice(0, 5)}`;
    fixture.hospitalCodes.push(prefix);
    const parent = await createHospital(fixture, `${prefix}P`, "โรงพยาบาลแม่ข่าย");
    const sibling = await createHospital(fixture, `${prefix}S`, "โรงพยาบาลลูกข่ายอีกแห่ง", HospitalStatus.ACTIVE, parent.id);
    const activeChild = await createHospital(fixture, `${prefix}A`, "โรงพยาบาลลูกข่าย A", HospitalStatus.ACTIVE, parent.id);
    const pendingChild = await createHospital(fixture, `${prefix}W`, "โรงพยาบาลลูกข่ายรอยืนยัน", HospitalStatus.PENDING_VERIFICATION, parent.id);
    const suspendedChild = await createHospital(fixture, `${prefix}Z`, "โรงพยาบาลลูกข่ายที่ถูกระงับ", HospitalStatus.SUSPENDED, parent.id);
    const grandchild = await createHospital(fixture, `${prefix}G`, "หน่วยระดับหลาน", HospitalStatus.ACTIVE, activeChild.id);
    const unrelated = await createHospital(fixture, `${prefix}N`, "โรงพยาบาลอิสระ");
    const standalone = await createHospital(fixture, `${prefix}T`, "โรงพยาบาลแม่ข่ายเดี่ยว");
    const parentOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parent.id,
        hospitalStatus: parent.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const standaloneOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: standalone.id,
        hospitalStatus: standalone.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const context = await getHospitalHierarchyContext(parentOwner.actor, parent.id);
    expect(context.classification).toBe("MAIN");
    expect(context.directChildCount).toBe(4);
    expect(new Set(context.directChildren.map(({ id }) => id))).toEqual(
      new Set([activeChild.id, pendingChild.id, sibling.id, suspendedChild.id]),
    );
    expect(context.directChildren.map(({ id }) => id)).not.toContain(grandchild.id);
    expect(context.directChildren.map(({ id }) => id)).not.toContain(unrelated.id);

    const resolvedChildren = await resolveDirectChildFacilities(parentOwner.actor, parent.id);
    expect(resolvedChildren.map(({ id }) => id)).not.toContain(grandchild.id);
    const scope = await resolveHospitalNetworkScope(parentOwner.actor, parent.id);
    expect(scope.P.hospitalIds).toEqual([parent.id]);
    expect(new Set(scope.C.hospitalIds)).toEqual(new Set([activeChild.id, sibling.id]));
    expect(new Set(scope.N.hospitalIds)).toEqual(new Set([parent.id, activeChild.id, sibling.id]));
    expect(JSON.stringify(scope)).not.toMatch(/patient|clinical/iu);

    const childOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: activeChild.id,
        hospitalStatus: activeChild.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const childContext = await getHospitalHierarchyContext(childOwner.actor, activeChild.id);
    expect(childContext.classification).toBe("SUBORDINATE");
    expect(childContext.parentHospital?.id).toBe(parent.id);
    expect(childContext.directChildren).toEqual([]);
    await expect(getHospitalHierarchyContext(childOwner.actor, parent.id)).rejects.toThrow();
    await expect(resolveHospitalNetworkScope(childOwner.actor, activeChild.id)).rejects.toThrow(/main Hospital/u);

    const standaloneContext = await getHospitalHierarchyContext(standaloneOwner.actor, standalone.id);
    expect(standaloneContext.classification).toBe("MAIN");
    expect(standaloneContext.directChildCount).toBe(0);
    expect((await resolveHospitalNetworkScope(standaloneOwner.actor, standalone.id)).N.hospitalIds).toEqual([standalone.id]);
  });

  it("revalidates OWNER authority, keeps reporting selection exact and gives ADMIN directory-only access", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const prefix = `HA${randomUUID().replaceAll("-", "").slice(0, 5)}`;
    fixture.hospitalCodes.push(prefix);
    const parent = await createHospital(fixture, `${prefix}P`, "โรงพยาบาลแม่ข่าย");
    const child = await createHospital(fixture, `${prefix}C`, "โรงพยาบาลลูกข่าย", HospitalStatus.ACTIVE, parent.id);
    const owner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parent.id,
        hospitalStatus: parent.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const member = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parent.id,
        hospitalStatus: parent.status,
        membershipType: MembershipType.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const childOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: child.id,
        hospitalStatus: child.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const inactiveMembershipOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parent.id,
        hospitalStatus: parent.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.SUSPENDED,
      },
    });
    const inactiveUserOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parent.id,
        hospitalStatus: parent.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      userStatus: UserStatus.SUSPENDED,
    });
    const admin = await createActor(fixture, { roles: [Role.ADMIN] });
    const suspendedHospital = await createHospital(fixture, `${prefix}X`, "โรงพยาบาลที่ถูกระงับ", HospitalStatus.SUSPENDED);
    const suspendedHospitalOwner = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: suspendedHospital.id,
        hospitalStatus: HospitalStatus.ACTIVE,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    expect((await resolveDirectChildFacilities(owner.actor, parent.id)).map(({ id }) => id)).toEqual([child.id]);
    await expect(getHospitalHierarchyContext(member.actor, parent.id)).rejects.toThrow();
    await expect(getHospitalHierarchyContext(childOwner.actor, parent.id)).rejects.toThrow();
    await expect(getHospitalHierarchyContext(inactiveMembershipOwner.actor, parent.id)).rejects.toThrow();
    await expect(getHospitalHierarchyContext(inactiveUserOwner.actor, parent.id)).rejects.toThrow();
    await expect(getHospitalHierarchyContext(suspendedHospitalOwner.actor, suspendedHospital.id)).rejects.toThrow();
    const adminDirectory = await getHospitalHierarchyDirectory(admin.actor);
    expect(adminDirectory.groups.some(({ mainHospital }) => mainHospital.id === parent.id)).toBe(true);
    await expect(resolveHospitalNetworkScope(admin.actor, parent.id)).rejects.toThrow();
    expect(await listHospitalReportingHospitals(admin.actor)).toEqual([]);
    expect((await listHospitalReportingHospitals(owner.actor)).map(({ id }) => id)).toEqual([parent.id]);

    await prisma.hospital.update({ where: { id: parent.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(resolveHospitalNetworkScope(owner.actor, parent.id)).rejects.toThrow();
    await prisma.hospital.update({ where: { id: parent.id }, data: { status: HospitalStatus.ACTIVE } });

    const ownerContext = await getHospitalHierarchyContext(owner.actor, parent.id);
    expect(Object.keys(ownerContext).sort()).toEqual([
      "classification",
      "directChildCount",
      "directChildren",
      "hospital",
      "issues",
      "parentHospital",
    ]);
    expect(JSON.stringify(ownerContext)).not.toMatch(/patient|hospitalNumber|program/iu);

    if (!owner.membershipId) throw new Error("Hospital owner fixture has no membership");
    await prisma.hospitalMembership.update({ where: { id: owner.membershipId }, data: { status: MembershipStatus.SUSPENDED } });
    await expect(getHospitalHierarchyContext(owner.actor, parent.id)).rejects.toThrow();
    await prisma.user.update({ where: { id: admin.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(getHospitalHierarchyDirectory(admin.actor)).rejects.toThrow();
  });

  it("moves only the current direct-child scope after reparenting", async () => {
    const fixture = newFixture();
    currentFixture = fixture;
    const prefix = `HR${randomUUID().replaceAll("-", "").slice(0, 5)}`;
    fixture.hospitalCodes.push(prefix);
    const parentA = await createHospital(fixture, `${prefix}A`, "โรงพยาบาลแม่ข่าย A");
    const parentB = await createHospital(fixture, `${prefix}B`, "โรงพยาบาลแม่ข่าย B");
    const child = await createHospital(fixture, `${prefix}C`, "โรงพยาบาลลูกข่าย", HospitalStatus.ACTIVE, parentA.id);
    const ownerA = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parentA.id,
        hospitalStatus: parentA.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const ownerB = await createActor(fixture, {
      roles: [Role.HOSPITAL],
      membership: {
        hospitalId: parentB.id,
        hospitalStatus: parentB.status,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    expect((await resolveHospitalNetworkScope(ownerA.actor, parentA.id)).C.hospitalIds).toContain(child.id);
    await prisma.hospital.update({ where: { id: child.id }, data: { parentHospitalId: parentB.id } });
    expect((await resolveHospitalNetworkScope(ownerA.actor, parentA.id)).C.hospitalIds).not.toContain(child.id);
    expect((await resolveHospitalNetworkScope(ownerB.actor, parentB.id)).C.hospitalIds).toContain(child.id);
  });
});
