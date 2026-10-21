import { randomUUID } from "node:crypto";

import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  getHospitalHierarchyContext,
  getHospitalHierarchyDirectory,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

const prisma = getPrisma();
const hospitalIds: string[] = [];
const userIds: string[] = [];
const personIds: string[] = [];

async function hospital(name: string, kind: "PARENT" | "CHILD" | null, status: HospitalStatus = HospitalStatus.ACTIVE): Promise<string> {
  const row = await prisma.hospital.create({
    data: {
      hospitalCode: `HH-${randomUUID().slice(0, 12)}`,
      name,
      status,
      ...(kind ? { serviceAreaEligibility: { create: { kind, verifiedAt: new Date() } } } : {}),
    },
  });
  hospitalIds.push(row.id);
  return row.id;
}

async function actor(roles: Role[], ownerOf?: string): Promise<ActorContext> {
  const person = await prisma.person.create({ data: { identityKeyHash: `hierarchy-${randomUUID()}` } });
  personIds.push(person.id);
  const user = await prisma.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, roles: { create: roles.map((role) => ({ role })) } } });
  userIds.push(user.id);
  if (ownerOf) {
    await prisma.hospitalMembership.create({ data: { userId: user.id, hospitalId: ownerOf, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
  }
  return {
    userId: user.id,
    personId: person.id,
    roles,
    hospitalMemberships: ownerOf
      ? [{ hospitalId: ownerOf, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }]
      : [],
    osmHospitalRelationships: [],
  };
}

afterEach(async () => {
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitalIds } } }),
  ]);
  await prisma.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await prisma.hospitalMembership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  hospitalIds.length = 0;
  userIds.length = 0;
  personIds.length = 0;
});

describe("Hospital network structure (ADR-0015/0016/0017) / PostgreSQL", () => {
  it("builds the governance directory and contexts from network roles and active associations only", async () => {
    const parentId = await hospital("ก แม่ข่าย", "PARENT");
    const childId = await hospital("ข ลูกข่าย", "CHILD");
    const suspendedChildId = await hospital("ค ลูกข่ายระงับ", "CHILD", HospitalStatus.SUSPENDED);
    const freeChildId = await hospital("ง ลูกข่ายว่าง", "CHILD");
    const unclassifiedId = await hospital("จ ยังไม่กำหนด", null, HospitalStatus.PENDING_VERIFICATION);
    const owner = await actor([Role.HOSPITAL], parentId);
    const admin = await actor([Role.ADMIN]);
    await prisma.hospitalServiceArea.createMany({
      data: [childId, suspendedChildId].map((childHospitalId) => ({ parentHospitalId: parentId, childHospitalId, createdByUserId: owner.userId })),
    });

    const directory = await getHospitalHierarchyDirectory(admin);
    const group = directory.groups.find(({ mainHospital }) => mainHospital.id === parentId);
    expect(group?.directChildren.map(({ id }) => id)).toEqual([childId, suspendedChildId]);
    const outside = directory.outsideNetwork.map(({ id }) => id);
    expect(outside).toEqual(expect.arrayContaining([freeChildId, unclassifiedId]));
    expect(outside).not.toContain(childId);

    expect(await getHospitalHierarchyContext(owner, parentId)).toMatchObject({
      classification: "MAIN",
      parentHospital: null,
      directChildCount: 2,
    });
    expect(await getHospitalHierarchyContext(admin, childId)).toMatchObject({
      classification: "SUBORDINATE",
      parentHospital: { id: parentId },
      directChildren: [],
    });
    expect(await getHospitalHierarchyContext(admin, unclassifiedId)).toMatchObject({ classification: "UNASSIGNED", parentHospital: null });
  });

  it("denies non-owners, foreign OWNERs and stale ADMIN accounts", async () => {
    const parentId = await hospital("แม่ข่าย", "PARENT");
    const otherId = await hospital("โรงพยาบาลอื่น", "PARENT");
    const otherOwner = await actor([Role.HOSPITAL], otherId);
    const patient = await actor([Role.PATIENT]);
    const admin = await actor([Role.ADMIN]);

    await expect(getHospitalHierarchyContext(otherOwner, parentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getHospitalHierarchyContext(patient, parentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getHospitalHierarchyDirectory(otherOwner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({ where: { id: admin.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(getHospitalHierarchyDirectory(admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
