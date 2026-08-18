import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { PasswordAuthProvisioningReconciliationError } from "@/modules/auth/services/password-auth-provisioning-service";
import {
  completeWorkforceActivation,
  getWorkforceDetail,
  provisionHospitalMember,
  provisionOsm,
  regenerateWorkforceActivation,
  revokeWorkforceActivation,
  restoreHospitalMembership,
  suspendHospitalMembership,
  updateHospitalMembershipProfession,
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
  lifecycleStaff: "1000000000084",
  lifecycleOtherHospital: "1000000000092",
  lifecycleProvisioned: "1000000000106",
  lifecycleInvited: "1000000000114",
  lifecycleSuspended: "1000000000122",
  lifecycleProjection: "1000000000130",
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
      authSubject: randomUUID(),
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

async function createStaffRelationship(input: {
  hospitalId: string;
  nationalId: string;
  userStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  profession?: "DOCTOR" | "NURSE" | "COORDINATOR" | "OTHER";
  extraRoles?: Role[];
}): Promise<{ userId: string; membershipId: string; personId: string }> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: input.nationalId,
      }),
      givenName: "สมชาย",
      familyName: "บุคลากรต้นแบบ",
    },
    select: { id: true },
  });
  const userStatus = input.userStatus ?? UserStatus.ACTIVE;
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: userStatus === UserStatus.PROVISIONED ? null : `integration-${input.nationalId}`,
      status: userStatus,
    },
    select: { id: true },
  });

  for (const role of [Role.HOSPITAL, ...(input.extraRoles ?? [])]) {
    await prisma.userRole.create({ data: { userId: user.id, role } });
  }

  const membership = await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: input.profession ?? "DOCTOR",
      status: input.membershipStatus ?? MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });

  return { userId: user.id, membershipId: membership.id, personId: person.id };
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

  it("updates only the exact Hospital membership and returns a safe detail projection", async () => {
    const primary = await createOwner("INTEGRATION-LIFECYCLE-A");
    const other = await createOwner("INTEGRATION-LIFECYCLE-B");
    const target = await createStaffRelationship({
      hospitalId: primary.hospitalId,
      nationalId: nationalIds.lifecycleStaff,
      extraRoles: [Role.PATIENT],
      profession: "DOCTOR",
    });
    const otherMembership = await prisma.hospitalMembership.create({
      data: {
        userId: target.userId,
        hospitalId: other.hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: "NURSE",
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, profession: true, status: true },
    });
    const osmRelationship = await prisma.osmHospitalRelationship.create({
      data: {
        userId: target.userId,
        hospitalId: other.hospitalId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, status: true },
    });
    const activation = await prisma.workforceActivation.create({
      data: {
        userId: target.userId,
        tokenHash: hashWorkforceActivationToken("lifecycle-projection-token"),
        mode: "REMOTE",
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        createdByUserId: primary.actor.userId,
      },
      select: { id: true, tokenHash: true },
    });
    const membershipBefore = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: target.membershipId },
      select: { updatedAt: true, profession: true, status: true },
    });

    const result = await updateHospitalMembershipProfession(primary.actor, {
      relationshipId: target.membershipId,
      targetHospitalId: primary.hospitalId,
      expectedUpdatedAt: membershipBefore.updatedAt.toISOString(),
      profession: "COORDINATOR",
    });

    expect(result).toMatchObject({
      relationshipId: target.membershipId,
      hospitalId: primary.hospitalId,
      membershipStatus: MembershipStatus.ACTIVE,
      profession: "COORDINATOR",
    });
    await expect(
      prisma.hospitalMembership.findUnique({
        where: { id: target.membershipId },
        select: { profession: true, status: true },
      }),
    ).resolves.toEqual({ profession: "COORDINATOR", status: MembershipStatus.ACTIVE });
    await expect(
      prisma.hospitalMembership.findUnique({ where: { id: otherMembership.id }, select: { profession: true, status: true } }),
    ).resolves.toEqual({ profession: "NURSE", status: MembershipStatus.ACTIVE });
    await expect(
      prisma.user.findUnique({
        where: { id: target.userId },
        select: { status: true, roles: { select: { role: true }, orderBy: { role: "asc" } } },
      }),
    ).resolves.toEqual({
      status: UserStatus.ACTIVE,
      roles: [{ role: Role.HOSPITAL }, { role: Role.PATIENT }],
    });
    await expect(
      prisma.osmHospitalRelationship.findUnique({ where: { id: osmRelationship.id }, select: { status: true } }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.workforceActivation.findUnique({ where: { id: activation.id }, select: { id: true, tokenHash: true } }),
    ).resolves.toEqual(activation);

    await expect(
      prisma.auditEvent.findMany({
        where: {
          action: "hospital_membership.profession_changed",
          resourceId: target.membershipId,
        },
        select: { actorUserId: true, metadata: true },
      }),
    ).resolves.toEqual([
      {
        actorUserId: primary.actor.userId,
        metadata: { fromProfession: "DOCTOR", toProfession: "COORDINATOR" },
      },
    ]);

    const detail = await getWorkforceDetail(primary.actor, {
      kind: "staff",
      relationshipId: target.membershipId,
    });
    expect(detail).toMatchObject({
      displayName: "สมชาย บุคลากรต้นแบบ",
      membershipType: MembershipType.MEMBER,
      profession: "COORDINATOR",
      relationshipStatus: MembershipStatus.ACTIVE,
      accountStatus: UserStatus.ACTIVE,
      actions: { updateProfession: true, suspend: true, restore: false },
    });
    const serializedDetail = JSON.stringify(detail);
    expect(serializedDetail).not.toContain("identityKeyHash");
    expect(serializedDetail).not.toContain("authSubject");
    expect(serializedDetail).not.toContain(activation.tokenHash);
    expect(serializedDetail).not.toContain("lifecycle-projection-token");
  });

  it("suspends and restores only one Hospital membership with expected-state checks", async () => {
    const primary = await createOwner("INTEGRATION-TRANSITION-A");
    const other = await createOwner("INTEGRATION-TRANSITION-B");
    const target = await createStaffRelationship({
      hospitalId: primary.hospitalId,
      nationalId: nationalIds.lifecycleOtherHospital,
      profession: "DOCTOR",
    });
    const otherMembership = await prisma.hospitalMembership.create({
      data: {
        userId: target.userId,
        hospitalId: other.hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: "NURSE",
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    const osmRelationship = await prisma.osmHospitalRelationship.create({
      data: {
        userId: target.userId,
        hospitalId: other.hospitalId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    const initial = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: target.membershipId },
      select: { updatedAt: true },
    });

    const suspended = await suspendHospitalMembership(primary.actor, {
      relationshipId: target.membershipId,
      targetHospitalId: primary.hospitalId,
      expectedUpdatedAt: initial.updatedAt.toISOString(),
    });

    expect(suspended.membershipStatus).toBe(MembershipStatus.SUSPENDED);
    await expect(
      prisma.hospitalMembership.findUnique({ where: { id: target.membershipId }, select: { status: true } }),
    ).resolves.toEqual({ status: MembershipStatus.SUSPENDED });
    await expect(
      prisma.hospitalMembership.findUnique({ where: { id: otherMembership.id }, select: { status: true } }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.osmHospitalRelationship.findUnique({ where: { id: osmRelationship.id }, select: { status: true } }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.user.findUnique({ where: { id: target.userId }, select: { status: true } }),
    ).resolves.toEqual({ status: UserStatus.ACTIVE });
    await expect(
      prisma.auditEvent.count({ where: { action: "hospital_membership.suspended" } }),
    ).resolves.toBe(1);

    await expect(
      suspendHospitalMembership(primary.actor, {
        relationshipId: target.membershipId,
        targetHospitalId: primary.hospitalId,
        expectedUpdatedAt: suspended.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.auditEvent.count({ where: { action: "hospital_membership.suspended" } }),
    ).resolves.toBe(1);

    const restored = await restoreHospitalMembership(primary.actor, {
      relationshipId: target.membershipId,
      targetHospitalId: primary.hospitalId,
      expectedUpdatedAt: suspended.updatedAt.toISOString(),
    });

    expect(restored.membershipStatus).toBe(MembershipStatus.ACTIVE);
    await expect(
      prisma.hospitalMembership.findUnique({ where: { id: target.membershipId }, select: { status: true } }),
    ).resolves.toEqual({ status: MembershipStatus.ACTIVE });
    await expect(
      prisma.user.findUnique({ where: { id: target.userId }, select: { status: true } }),
    ).resolves.toEqual({ status: UserStatus.ACTIVE });
    await expect(
      prisma.auditEvent.count({ where: { action: "hospital_membership.restored" } }),
    ).resolves.toBe(1);
  });

  it("fails closed for non-owner roles, wrong or hierarchical Hospitals, and inactive boundaries", async () => {
    const parent = await createOwner("INTEGRATION-AUTH-PARENT");
    const child = await createOwner("INTEGRATION-AUTH-CHILD");
    await prisma.hospital.update({
      where: { id: child.hospitalId },
      data: { parentHospitalId: parent.hospitalId },
    });
    const parentTarget = await createStaffRelationship({
      hospitalId: parent.hospitalId,
      nationalId: nationalIds.lifecycleProjection,
    });
    const childTarget = await createStaffRelationship({
      hospitalId: child.hospitalId,
      nationalId: nationalIds.lifecycleOtherHospital,
    });
    const parentVersion = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: parentTarget.membershipId },
      select: { updatedAt: true },
    });
    const childVersion = await prisma.hospitalMembership.findUniqueOrThrow({
      where: { id: childTarget.membershipId },
      select: { updatedAt: true },
    });
    const parentInput = {
      relationshipId: parentTarget.membershipId,
      targetHospitalId: parent.hospitalId,
      expectedUpdatedAt: parentVersion.updatedAt.toISOString(),
      profession: "NURSE" as const,
    };
    const childInput = {
      relationshipId: childTarget.membershipId,
      targetHospitalId: child.hospitalId,
      expectedUpdatedAt: childVersion.updatedAt.toISOString(),
      profession: "NURSE" as const,
    };

    await expect(updateHospitalMembershipProfession(parent.actor, childInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getWorkforceDetail(parent.actor, {
        kind: "staff",
        relationshipId: childTarget.membershipId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateHospitalMembershipProfession(child.actor, parentInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      updateHospitalMembershipProfession({ ...parent.actor, roles: [Role.ADMIN] }, parentInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateHospitalMembershipProfession({
        ...parent.actor,
        hospitalMemberships: [
          {
            ...parent.actor.hospitalMemberships[0],
            membershipType: MembershipType.MEMBER,
          },
        ],
      }, parentInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateHospitalMembershipProfession({ ...parent.actor, roles: [Role.OSM] }, parentInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateHospitalMembershipProfession({ ...parent.actor, roles: [Role.PATIENT] }, parentInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.user.update({ where: { id: parent.actor.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(updateHospitalMembershipProfession(parent.actor, parentInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.user.update({ where: { id: parent.actor.userId }, data: { status: UserStatus.ACTIVE } });

    await prisma.hospital.update({ where: { id: parent.hospitalId }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(updateHospitalMembershipProfession(parent.actor, parentInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.hospital.update({ where: { id: parent.hospitalId }, data: { status: HospitalStatus.ACTIVE } });

    const ownerMembership = await prisma.hospitalMembership.findFirstOrThrow({
      where: {
        userId: parent.actor.userId,
        hospitalId: parent.hospitalId,
        membershipType: MembershipType.OWNER,
      },
      select: { id: true, updatedAt: true },
    });
    await expect(
      updateHospitalMembershipProfession(parent.actor, {
        relationshipId: ownerMembership.id,
        targetHospitalId: parent.hospitalId,
        expectedUpdatedAt: ownerMembership.updatedAt.toISOString(),
        profession: "NURSE",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires the linked User to be ACTIVE for profession, suspend, and restore", async () => {
    const { actor, hospitalId } = await createOwner("INTEGRATION-TARGET-STATUS");
    const targets = [
      [UserStatus.PROVISIONED, nationalIds.lifecycleProvisioned],
      [UserStatus.INVITED, nationalIds.lifecycleInvited],
      [UserStatus.SUSPENDED, nationalIds.lifecycleSuspended],
    ] as const;

    for (const [userStatus, nationalId] of targets) {
      const target = await createStaffRelationship({ hospitalId, nationalId, userStatus });
      const activeVersion = await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: target.membershipId },
        select: { updatedAt: true },
      });
      const professionInput = {
        relationshipId: target.membershipId,
        targetHospitalId: hospitalId,
        expectedUpdatedAt: activeVersion.updatedAt.toISOString(),
        profession: "NURSE" as const,
      };
      const transitionInput = {
        relationshipId: target.membershipId,
        targetHospitalId: hospitalId,
        expectedUpdatedAt: activeVersion.updatedAt.toISOString(),
      };

      await expect(updateHospitalMembershipProfession(actor, professionInput)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(suspendHospitalMembership(actor, transitionInput)).rejects.toMatchObject({
        code: "CONFLICT",
      });

      await prisma.hospitalMembership.update({
        where: { id: target.membershipId },
        data: { status: MembershipStatus.SUSPENDED },
      });
      const suspendedVersion = await prisma.hospitalMembership.findUniqueOrThrow({
        where: { id: target.membershipId },
        select: { updatedAt: true, status: true },
      });
      await expect(
        restoreHospitalMembership(actor, {
          relationshipId: target.membershipId,
          targetHospitalId: hospitalId,
          expectedUpdatedAt: suspendedVersion.updatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        prisma.hospitalMembership.findUnique({ where: { id: target.membershipId }, select: { status: true } }),
      ).resolves.toEqual({ status: MembershipStatus.SUSPENDED });
    }

    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("exposes no lifecycle actions for an OSM or OWNER detail", async () => {
    const { actor, hospitalId } = await createOwner("INTEGRATION-DETAIL-READONLY");
    const osm = await provisionOsm(actor, {
      nationalId: nationalIds.osm,
      givenName: "อาสา",
      familyName: "ทดสอบ",
      targetHospitalId: hospitalId,
    });
    const osmDetail = await getWorkforceDetail(actor, {
      kind: "osm",
      relationshipId: osm.relationshipId,
    });
    expect(osmDetail.actions).toEqual({ updateProfession: false, suspend: false, restore: false });

    const ownerMembership = await prisma.hospitalMembership.findFirstOrThrow({
      where: { userId: actor.userId, hospitalId, membershipType: MembershipType.OWNER },
      select: { id: true },
    });
    const ownerDetail = await getWorkforceDetail(actor, {
      kind: "staff",
      relationshipId: ownerMembership.id,
    });
    expect(ownerDetail.membershipType).toBe(MembershipType.OWNER);
    expect(ownerDetail.actions).toEqual({ updateProfession: false, suspend: false, restore: false });
  });
});
