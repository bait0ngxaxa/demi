import { Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import {
  PasswordAuthProvisioningReconciliationError,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  bootstrapPlatformAdmin,
  type PlatformAdminBootstrapDependencies,
} from "@/modules/platform-admin-bootstrap/services/platform-admin-bootstrap-service";
import { InfrastructureError } from "@/shared/errors/application-error";

const prisma = getPrisma();

const nationalIds = {
  happy: "DEMI-ADMIN-ROOT",
  existingAdmin: "1000000000017",
  existingIdentity: "1000000000025",
  providerFailure: "1000000000033",
  providerReconciliation: "1000000000041",
  unexpectedState: "1000000000050",
  concurrentFirst: "1000000000068",
  concurrentSecond: "1000000000076",
};

const baseInput = {
  givenName: "ผู้ดูแล",
  familyName: "ระบบ",
  password: "correct-horse-battery-staple",
};

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

function inputFor(nationalId: string) {
  return { ...baseInput, nationalId };
}

function createProviderProvisioner(authSubject: string) {
  return async ({ userId }: { userId: string; password: string }) => {
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

function createDependencies(
  authSubject: string,
  deleteProviderIdentity: (subject: string) => Promise<void> = async () => undefined,
): PlatformAdminBootstrapDependencies {
  return {
    provisionIdentity: createProviderProvisioner(authSubject),
    deleteProviderIdentity,
  };
}

describe("Phase 3C platform admin bootstrap PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma.$disconnect();
  });

  it("creates one ACTIVE ADMIN with no hospital role or membership and writes bounded audit", async () => {
    const providerSubject = "11111111-1111-4111-8111-111111111111";

    const result = await bootstrapPlatformAdmin(
      inputFor(nationalIds.happy),
      createDependencies(providerSubject),
    );

    const person = await prisma.person.findUnique({
      where: {
        identityKeyHash: hashIdentityReference({
          namespace: "thai-national-id",
          value: nationalIds.happy,
        }),
      },
      select: { id: true, identityKeyHash: true },
    });
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: {
        status: true,
        authSubject: true,
        roles: { select: { role: true } },
        memberships: true,
      },
    });
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "platform_admin.bootstrapped", resourceId: result.userId },
      select: { actorUserId: true, resourceType: true, metadata: true },
    });

    expect(person?.id).toBeTruthy();
    expect(person?.identityKeyHash).not.toContain(nationalIds.happy);
    expect(user).toEqual({
      status: UserStatus.ACTIVE,
      authSubject: providerSubject,
      roles: [{ role: Role.ADMIN }],
      memberships: [],
    });
    expect(audit).toEqual({
      actorUserId: null,
      resourceType: "User",
      metadata: { role: Role.ADMIN, source: "trusted_cli" },
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain(nationalIds.happy);
    expect(JSON.stringify(audit?.metadata)).not.toContain(baseInput.password);
    expect(await prisma.userRole.count({ where: { role: Role.ADMIN } })).toBe(1);
    expect(await prisma.userRole.count({ where: { role: Role.HOSPITAL } })).toBe(0);
    expect(await prisma.hospitalMembership.count()).toBe(0);
  });

  it("refuses to create a second admin regardless of existing admin status", async () => {
    const person = await prisma.person.create({
      data: { identityKeyHash: "integration-existing-admin" },
    });
    const existingAdmin = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.SUSPENDED },
    });
    await prisma.userRole.create({ data: { userId: existingAdmin.id, role: Role.ADMIN } });
    const provisionIdentity = vi.fn();

    await expect(
      bootstrapPlatformAdmin(inputFor(nationalIds.existingAdmin), {
        provisionIdentity,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(provisionIdentity).not.toHaveBeenCalled();
    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.userRole.count({ where: { role: Role.ADMIN } })).toBe(1);
  });

  it("does not overwrite an existing Person/User or grant ADMIN", async () => {
    const person = await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({
          namespace: "thai-national-id",
          value: nationalIds.existingIdentity,
        }),
      },
    });
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: "existing-subject" },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
    const provisionIdentity = vi.fn();

    await expect(
      bootstrapPlatformAdmin(inputFor(nationalIds.existingIdentity), {
        provisionIdentity,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true, authSubject: true, roles: true },
      }),
    ).resolves.toEqual({
      status: UserStatus.ACTIVE,
      authSubject: "existing-subject",
      roles: [{ userId: user.id, role: Role.HOSPITAL, createdAt: expect.any(Date) }],
    });
    expect(provisionIdentity).not.toHaveBeenCalled();
    expect(await prisma.userRole.count({ where: { role: Role.ADMIN } })).toBe(0);
  });

  it("rejects a blank or oversized admin identifier without creating any local or provider state", async () => {
    const provisionIdentity = vi.fn();

    await expect(
      bootstrapPlatformAdmin(inputFor(" ".repeat(33)), { provisionIdentity }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
    expect(provisionIdentity).not.toHaveBeenCalled();
  });

  it("compensates the new local identity when provider provisioning fails", async () => {
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new InfrastructureError("provider unavailable"));

    await expect(
      bootstrapPlatformAdmin(inputFor(nationalIds.providerFailure), { provisionIdentity }),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.userRole.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("preserves only reconciliation-required provisioned local state", async () => {
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new PasswordAuthProvisioningReconciliationError());

    await expect(
      bootstrapPlatformAdmin(inputFor(nationalIds.providerReconciliation), {
        provisionIdentity,
      }),
    ).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      requiresReconciliation: true,
    });

    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.user.count({ where: { status: UserStatus.PROVISIONED } })).toBe(1);
    expect(await prisma.userRole.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("does not repair a target User whose status changed before finalization", async () => {
    const providerSubject = "22222222-2222-4222-8222-222222222222";
    const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);
    const provisionIdentity = async ({ userId }: { userId: string; password: string }) => {
      await prisma.user.update({
        where: { id: userId },
        data: { authSubject: providerSubject, status: UserStatus.ACTIVE },
      });
      return { userId, authSubject: providerSubject };
    };

    await expect(
      bootstrapPlatformAdmin(inputFor(nationalIds.unexpectedState), {
        provisionIdentity,
        deleteProviderIdentity,
      }),
    ).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      requiresReconciliation: true,
    });

    const person = await prisma.person.findUnique({
      where: {
        identityKeyHash: hashIdentityReference({
          namespace: "thai-national-id",
          value: nationalIds.unexpectedState,
        }),
      },
      select: { id: true },
    });
    const user = await prisma.user.findUnique({
      where: { personId: person?.id ?? "" },
      select: { status: true, authSubject: true, roles: true },
    });

    expect(user?.status).toBe(UserStatus.ACTIVE);
    expect(user?.authSubject).toBe(providerSubject);
    expect(user?.roles).toHaveLength(0);
    expect(deleteProviderIdentity).toHaveBeenCalledWith(providerSubject);
    expect(await prisma.userRole.count({ where: { role: Role.ADMIN } })).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("allows only one concurrent first-admin bootstrap and compensates the loser", async () => {
    const providerSubjects = new Set([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
    const deletedProviderSubjects: string[] = [];
    const providers: Array<PlatformAdminBootstrapDependencies> = [
      {
        provisionIdentity: createProviderProvisioner([...providerSubjects][0]),
        deleteProviderIdentity: async (subject) => {
          deletedProviderSubjects.push(subject);
        },
      },
      {
        provisionIdentity: createProviderProvisioner([...providerSubjects][1]),
        deleteProviderIdentity: async (subject) => {
          deletedProviderSubjects.push(subject);
        },
      },
    ];

    const outcomes = await Promise.allSettled([
      bootstrapPlatformAdmin(inputFor(nationalIds.concurrentFirst), providers[0]),
      bootstrapPlatformAdmin(inputFor(nationalIds.concurrentSecond), providers[1]),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await prisma.userRole.count({ where: { role: Role.ADMIN } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "platform_admin.bootstrapped" } })).toBe(1);
    expect(await prisma.person.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(deletedProviderSubjects).toHaveLength(1);
  });
});
