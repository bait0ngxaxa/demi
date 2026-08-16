import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { PasswordAuthProvisioningReconciliationError } from "@/modules/auth/services/password-auth-provisioning-service";
import {
  completeWorkforceActivation,
  provisionHospitalMember,
  provisionOsm,
  regenerateWorkforceActivation,
  revokeWorkforceActivation,
} from "@/modules/workforce/services/workforce-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { hashWorkforceActivationToken } from "@/modules/workforce/services/activation-token-service";

const prisma = getPrisma();

const nationalIds = {
  staff: "1000000000009",
  osm: "1000000000017",
  active: "1000000000025",
  concurrent: "1000000000033",
  providerFailure: "1000000000041",
  activationConcurrent: "1000000000050",
  adminStaff: "1000000000068",
  adminOsm: "1000000000076",
};

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
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

async function createOwner(hospitalCode = "INTEGRATION-WF"): Promise<{
  actor: ActorContext;
  hospitalId: string;
}> {
  const person = await prisma.person.create({
    data: { identityKeyHash: `integration-owner-${hospitalCode}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: "11111111-1111-4111-8111-111111111111",
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  const hospital = await prisma.hospital.create({
    data: { hospitalCode, name: "โรงพยาบาลทดสอบแรงงาน", status: HospitalStatus.ACTIVE },
    select: { id: true, status: true },
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

  return {
    hospitalId: hospital.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId: hospital.id,
          membershipType: MembershipType.OWNER,
          profession: null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: hospital.status,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

function createProvisioner(authSubject: string) {
  return async ({ userId, password }: { userId: string; password: string }) => {
    expect(password).toBe("integration-workforce-password");
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

async function createAdminTarget(nationalId: string): Promise<{ userId: string }> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: nationalId,
      }),
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: "66666666-6666-4666-8666-666666666666",
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return { userId: user.id };
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe("Phase 4B workforce PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("provisions new Hospital staff, stores only activation digest, and activates with target-owned password", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionHospitalMember(actor, {
      nationalId: nationalIds.staff,
      givenName: "สมชาย",
      familyName: "บุคลากร",
      targetHospitalId: hospitalId,
      profession: "NURSE",
    });

    expect(result.activationToken).toBeTruthy();
    expect(result.activationExpiresAt).toBeInstanceOf(Date);
    const activation = await prisma.workforceActivation.findFirst({
      where: { userId: result.userId },
      select: { tokenHash: true, usedAt: true, revokedAt: true },
    });
    expect(activation?.tokenHash).toBe(hashWorkforceActivationToken(result.activationToken!));
    expect(activation?.tokenHash).not.toBe(result.activationToken);
    expect(activation?.usedAt).toBeNull();
    expect(activation?.revokedAt).toBeNull();

    await completeWorkforceActivation(
      result.activationToken!,
      {
        password: "integration-workforce-password",
        passwordConfirmation: "integration-workforce-password",
      },
      { provisionIdentity: createProvisioner("22222222-2222-4222-8222-222222222222") },
    );

    await expect(
      prisma.user.findUnique({
        where: { id: result.userId },
        select: {
          status: true,
          roles: { select: { role: true } },
          memberships: { select: { membershipType: true, profession: true, status: true } },
        },
      }),
    ).resolves.toEqual({
      status: UserStatus.ACTIVE,
      roles: [{ role: Role.HOSPITAL }],
      memberships: [
        {
          membershipType: MembershipType.MEMBER,
          profession: "NURSE",
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
    expect(await prisma.workforceActivation.findFirst({ where: { userId: result.userId } })).toMatchObject({
      usedAt: expect.any(Date),
    });
    expect(await prisma.auditEvent.count({ where: { action: "workforce_activation.completed" } })).toBe(1);
  });

  it("provisions OSM separately without HospitalMembership or clinical scope", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionOsm(actor, {
      nationalId: nationalIds.osm,
      givenName: "สมหญิง",
      familyName: "อาสา",
      targetHospitalId: hospitalId,
    });

    expect(result.kind).toBe("OSM");
    expect(await prisma.userRole.findMany({ where: { userId: result.userId } })).toMatchObject([
      { role: Role.OSM },
    ]);
    expect(await prisma.hospitalMembership.count({ where: { userId: result.userId } })).toBe(0);
    expect(await prisma.osmHospitalRelationship.findUnique({
      where: { userId_hospitalId: { userId: result.userId, hospitalId } },
      select: { status: true },
    })).toEqual({ status: MembershipStatus.PROVISIONED });
  });

  it("reuses an ACTIVE User, preserves roles, and does not issue activation or call provider", async () => {
    const { actor, hospitalId } = await createOwner();
    const person = await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({
          namespace: "thai-national-id",
          value: nationalIds.active,
        }),
      },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        personId: person.id,
        authSubject: "33333333-3333-4333-8333-333333333333",
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
    const provisionIdentity = vi.fn();

    const result = await provisionHospitalMember(
      actor,
      {
        nationalId: nationalIds.active,
        givenName: "ชื่อใหม่ไม่เขียนทับ",
        familyName: "นามสกุลใหม่",
        targetHospitalId: hospitalId,
        profession: "DOCTOR",
      },
      { provisionIdentity },
    );

    expect(result.userId).toBe(user.id);
    expect(result.activationToken).toBeNull();
    expect(result.relationshipStatus).toBe(MembershipStatus.ACTIVE);
    expect(provisionIdentity).not.toHaveBeenCalled();
    expect(await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: true } })).toEqual([
      { role: Role.PATIENT },
      { role: Role.HOSPITAL },
    ]);
    expect(await prisma.workforceActivation.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.person.findUnique({ where: { id: person.id }, select: { givenName: true } })).toEqual({
      givenName: null,
    });
  });

  it("rejects an existing ADMIN User as Hospital staff without changing workforce state", async () => {
    const { actor, hospitalId } = await createOwner();
    const target = await createAdminTarget(nationalIds.adminStaff);

    await expect(
      provisionHospitalMember(actor, {
        nationalId: nationalIds.adminStaff,
        givenName: "ผู้ดูแล",
        familyName: "ระบบ",
        targetHospitalId: hospitalId,
        profession: "OTHER",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.userRole.findMany({ where: { userId: target.userId }, select: { role: true } }),
    ).resolves.toEqual([{ role: Role.ADMIN }]);
    await expect(prisma.hospitalMembership.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.osmHospitalRelationship.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.workforceActivation.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("rejects an existing ADMIN User as OSM without changing workforce state", async () => {
    const { actor, hospitalId } = await createOwner();
    const target = await createAdminTarget(nationalIds.adminOsm);

    await expect(
      provisionOsm(actor, {
        nationalId: nationalIds.adminOsm,
        givenName: "ผู้ดูแล",
        familyName: "ระบบ",
        targetHospitalId: hospitalId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.userRole.findMany({ where: { userId: target.userId }, select: { role: true } }),
    ).resolves.toEqual([{ role: Role.ADMIN }]);
    await expect(prisma.hospitalMembership.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.osmHospitalRelationship.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.workforceActivation.count({ where: { userId: target.userId } })).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("regeneration revokes the old credential and only the new credential works", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionOsm(actor, {
      nationalId: nationalIds.activationConcurrent,
      givenName: "สมชาย",
      familyName: "เปิดใช้งาน",
      targetHospitalId: hospitalId,
    });
    const regenerated = await regenerateWorkforceActivation(actor, {
      userId: result.userId,
      targetHospitalId: hospitalId,
      kind: "OSM",
      mode: "ASSISTED",
    });

    await expect(
      completeWorkforceActivation(
        result.activationToken!,
        {
          password: "integration-workforce-password",
          passwordConfirmation: "integration-workforce-password",
        },
        { provisionIdentity: createProvisioner("44444444-4444-4444-8444-444444444444") },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await completeWorkforceActivation(
      regenerated.activationToken,
      {
        password: "integration-workforce-password",
        passwordConfirmation: "integration-workforce-password",
      },
      { provisionIdentity: createProvisioner("44444444-4444-4444-8444-444444444444") },
    );

    expect(await prisma.osmHospitalRelationship.findUnique({
      where: { userId_hospitalId: { userId: result.userId, hospitalId } },
      select: { status: true },
    })).toEqual({ status: MembershipStatus.ACTIVE });
    expect(await prisma.workforceActivation.count({ where: { userId: result.userId, revokedAt: { not: null } } })).toBe(1);
  });

  it("rejects regeneration and revocation while an activation claim is in flight", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionOsm(actor, {
      nationalId: nationalIds.activationConcurrent,
      givenName: "ผู้ใช้",
      familyName: "กำลังเปิดใช้งาน",
      targetHospitalId: hospitalId,
    });
    const providerGate = createDeferred();
    const providerStarted = createDeferred();
    const provisionIdentity = vi.fn(async ({ userId, password }: { userId: string; password: string }) => {
      expect(password).toBe("integration-workforce-password");
      providerStarted.resolve();
      await providerGate.promise;
      const authSubject = "77777777-7777-4777-8777-777777777777";
      await prisma.user.update({ where: { id: userId }, data: { authSubject } });
      return { userId, authSubject };
    });

    const completion = completeWorkforceActivation(
      result.activationToken!,
      {
        password: "integration-workforce-password",
        passwordConfirmation: "integration-workforce-password",
      },
      { provisionIdentity },
    );
    await providerStarted.promise;

    await expect(
      regenerateWorkforceActivation(actor, {
        userId: result.userId,
        targetHospitalId: hospitalId,
        kind: "OSM",
        mode: "REMOTE",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      revokeWorkforceActivation(actor, {
        userId: result.userId,
        targetHospitalId: hospitalId,
        kind: "OSM",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      prisma.workforceActivation.findUnique({
        where: { tokenHash: hashWorkforceActivationToken(result.activationToken!) },
        select: { claimedAt: true, usedAt: true, revokedAt: true },
      }),
    ).resolves.toMatchObject({ claimedAt: expect.any(Date), usedAt: null, revokedAt: null });

    providerGate.resolve();
    await completion;
  });

  it("keeps local workforce state provisioned when provider establishment fails", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionHospitalMember(actor, {
      nationalId: nationalIds.providerFailure,
      givenName: "ผู้ใช้",
      familyName: "ผู้ให้บริการล้มเหลว",
      targetHospitalId: hospitalId,
      profession: "OTHER",
    });

    await expect(
      completeWorkforceActivation(
        result.activationToken!,
        {
          password: "integration-workforce-password",
          passwordConfirmation: "integration-workforce-password",
        },
        { provisionIdentity: vi.fn().mockRejectedValue(new Error("provider unavailable")) },
      ),
    ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });

    await expect(
      prisma.user.findUnique({ where: { id: result.userId }, select: { status: true, authSubject: true } }),
    ).resolves.toEqual({ status: UserStatus.PROVISIONED, authSubject: null });
    await expect(
      prisma.hospitalMembership.findUnique({
        where: { userId_hospitalId: { userId: result.userId, hospitalId } },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: MembershipStatus.PROVISIONED });
    await expect(
      prisma.workforceActivation.findFirst({ where: { userId: result.userId }, select: { claimedAt: true } }),
    ).resolves.toEqual({ claimedAt: null });

    const regenerated = await regenerateWorkforceActivation(actor, {
      userId: result.userId,
      targetHospitalId: hospitalId,
      kind: "HOSPITAL_MEMBER",
      mode: "REMOTE",
    });
    expect(regenerated.activationToken).not.toBe(result.activationToken);
    await expect(
      prisma.workforceActivation.findUnique({
        where: { tokenHash: hashWorkforceActivationToken(result.activationToken!) },
        select: { revokedAt: true },
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it("keeps a claimed activation in reconciliation when provider identity ownership is ambiguous", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionHospitalMember(actor, {
      nationalId: nationalIds.providerFailure,
      givenName: "ผู้ใช้",
      familyName: "provider conflict",
      targetHospitalId: hospitalId,
      profession: "OTHER",
    });
    const provisionIdentity = vi
      .fn()
      .mockRejectedValue(new PasswordAuthProvisioningReconciliationError());

    await expect(
      completeWorkforceActivation(
        result.activationToken!,
        {
          password: "integration-workforce-password",
          passwordConfirmation: "integration-workforce-password",
        },
        { provisionIdentity },
      ),
    ).rejects.toMatchObject({
      code: "INFRASTRUCTURE",
      requiresReconciliation: true,
    });

    expect(provisionIdentity).toHaveBeenCalledOnce();
    await expect(
      prisma.workforceActivation.findUnique({
        where: { tokenHash: hashWorkforceActivationToken(result.activationToken!) },
        select: { claimedAt: true, usedAt: true, revokedAt: true },
      }),
    ).resolves.toMatchObject({ claimedAt: expect.any(Date), usedAt: null, revokedAt: null });
    await expect(
      prisma.user.findUnique({ where: { id: result.userId }, select: { status: true, authSubject: true } }),
    ).resolves.toEqual({ status: UserStatus.PROVISIONED, authSubject: null });

    await expect(
      completeWorkforceActivation(
        result.activationToken!,
        {
          password: "integration-workforce-password",
          passwordConfirmation: "integration-workforce-password",
        },
        { provisionIdentity },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provisionIdentity).toHaveBeenCalledOnce();
  });

  it("handles concurrent exact provisioning without duplicate identity or activation", async () => {
    const { actor, hospitalId } = await createOwner();
    const input = {
      nationalId: nationalIds.concurrent,
      givenName: "ผู้ใช้",
      familyName: "พร้อมกัน",
      targetHospitalId: hospitalId,
      profession: "COORDINATOR" as const,
    };
    const outcomes = await Promise.allSettled([
      provisionHospitalMember(actor, input),
      provisionHospitalMember(actor, input),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(await prisma.person.count()).toBe(2);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.hospitalMembership.count({ where: { hospitalId, membershipType: MembershipType.MEMBER } })).toBe(1);
    expect(await prisma.workforceActivation.count()).toBe(1);
  });

  it("allows only one concurrent activation claim", async () => {
    const { actor, hospitalId } = await createOwner();
    const result = await provisionOsm(actor, {
      nationalId: nationalIds.activationConcurrent,
      givenName: "ผู้ใช้",
      familyName: "เปิดพร้อมกัน",
      targetHospitalId: hospitalId,
    });
    const provisionIdentity = vi.fn().mockImplementation(createProvisioner("55555555-5555-4555-8555-555555555555"));
    const input = {
      password: "integration-workforce-password",
      passwordConfirmation: "integration-workforce-password",
    };
    const outcomes = await Promise.allSettled([
      completeWorkforceActivation(result.activationToken!, input, { provisionIdentity }),
      completeWorkforceActivation(result.activationToken!, input, { provisionIdentity }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(provisionIdentity).toHaveBeenCalledOnce();
    expect(await prisma.user.findUnique({ where: { id: result.userId }, select: { status: true } })).toEqual({
      status: UserStatus.ACTIVE,
    });
  });
});
