import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import {
  provisionPasswordAuthIdentity,
  type PasswordAuthAdminProvider,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { resolvePasswordLoginIdentity } from "@/modules/auth/services/password-login-identity-service";
import { resolvePerson } from "@/modules/identity/services/identity-service";

const prisma = getPrisma();

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createPersonRecord(identityValue: string): Promise<{ id: string }> {
  return prisma.person.create({
    data: {
      identityKeyHash: `integration-${identityValue}`,
    },
    select: { id: true },
  });
}

describe("Phase 1 PostgreSQL constraints", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reuses an identity and rejects a duplicate identity key", async () => {
    const input = {
      identity: { namespace: "integration", value: "person-1" },
      givenName: "Integration",
    };

    const first = await resolvePerson(input);
    const second = await resolvePerson({ ...input, givenName: "Ignored" });

    expect(second.id).toBe(first.id);
    await expect(
      prisma.person.create({ data: { identityKeyHash: first.identityKeyHash } }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.person.count()).toBe(1);
  });

  it("resolves a Thai National ID to the mapped provider login identity", async () => {
    const nationalId = "1000000000009";
    const person = await resolvePerson({
      identity: { namespace: "thai-national-id", value: nationalId },
    });
    const user = await prisma.user.create({
      data: {
        personId: person.id,
        authSubject: "provider-subject-1",
        status: UserStatus.ACTIVE,
      },
    });

    await expect(resolvePasswordLoginIdentity(nationalId)).resolves.toEqual({
      authSubject: "provider-subject-1",
      providerLoginAlias: `${user.id}@auth.demi.internal`,
    });
    expect(person.identityKeyHash).not.toContain(nationalId);
  });

  it("persists a provisioned provider subject without changing DEMI account lifecycle", async () => {
    const person = await createPersonRecord("auth-provisioning");
    const user = await prisma.user.create({
      data: {
        personId: person.id,
        status: UserStatus.PROVISIONED,
      },
    });
    const providerSubject = "22222222-2222-4222-8222-222222222222";
    const provider: PasswordAuthAdminProvider = {
      async createUser(attributes) {
        expect(attributes).toMatchObject({
          email: `${user.id}@auth.demi.internal`,
          email_confirm: true,
        });
        return {
          data: { user: { id: providerSubject } },
          error: null,
        };
      },
      async deleteUser() {
        return { error: null };
      },
    };

    await expect(
      provisionPasswordAuthIdentity(
        { userId: user.id, password: "integration-user-owned-password" },
        { provider },
      ),
    ).resolves.toEqual({ userId: user.id, authSubject: providerSubject });

    await expect(
      prisma.user.findUnique({
        where: { id: user.id },
        select: { authSubject: true, status: true },
      }),
    ).resolves.toEqual({
      authSubject: providerSubject,
      status: UserStatus.PROVISIONED,
    });

    const otherPerson = await createPersonRecord("auth-subject-uniqueness");
    const otherUser = await prisma.user.create({
      data: { personId: otherPerson.id },
    });

    await expect(
      prisma.user.update({
        where: { id: otherUser.id },
        data: { authSubject: providerSubject },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one User for one Person", async () => {
    const person = await createPersonRecord("one-user");

    await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
    });

    await expect(
      prisma.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("supports multiple roles on one User", async () => {
    const person = await createPersonRecord("multi-role");
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
    });

    await prisma.userRole.createMany({
      data: [
        { userId: user.id, role: Role.OSM },
        { userId: user.id, role: Role.PATIENT },
      ],
    });

    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      orderBy: { role: "asc" },
      select: { role: true },
    });

    expect(roles.map(({ role }) => role)).toEqual([Role.OSM, Role.PATIENT]);
  });

  it("supports multiple hospital memberships and rejects duplicates", async () => {
    const person = await createPersonRecord("multi-hospital");
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
    });
    const hospitals = await prisma.hospital.createManyAndReturn({
      data: [
        { hospitalCode: "INTEGRATION-A", name: "Hospital A", status: HospitalStatus.ACTIVE },
        { hospitalCode: "INTEGRATION-B", name: "Hospital B", status: HospitalStatus.ACTIVE },
      ],
      select: { id: true },
    });

    await prisma.hospitalMembership.createMany({
      data: hospitals.map(({ id }) => ({
        userId: user.id,
        hospitalId: id,
        membershipType: MembershipType.MEMBER,
        status: MembershipStatus.ACTIVE,
      })),
    });

    await expect(
      prisma.hospitalMembership.create({
        data: {
          userId: user.id,
          hospitalId: hospitals[0].id,
          membershipType: MembershipType.MEMBER,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await prisma.hospitalMembership.count({ where: { userId: user.id } })).toBe(2);
  });

  it("keeps hospital ownership separate from platform ADMIN", async () => {
    const person = await createPersonRecord("hospital-owner");
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
    });
    const hospital = await prisma.hospital.create({
      data: { hospitalCode: "INTEGRATION-OWNER", name: "Owner Hospital", status: HospitalStatus.ACTIVE },
    });

    await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
    await prisma.hospitalMembership.create({
      data: {
        userId: user.id,
        hospitalId: hospital.id,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    expect(await prisma.userRole.findUnique({ where: { userId_role: { userId: user.id, role: Role.ADMIN } } })).toBeNull();
  });

  it("retains the actor foreign key for audit history", async () => {
    const person = await createPersonRecord("audit-actor");
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "integration.test",
        resourceType: "TestResource",
      },
    });

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: "P2003",
    });

    expect(await prisma.auditEvent.count({ where: { actorUserId: user.id } })).toBe(1);
  });
});
