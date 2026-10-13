import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { hashWorkforceActivationToken } from "@/modules/workforce/services/activation-token-service";
import {
  completeWorkforceActivation,
  completeWorkforcePasswordReset,
  getWorkforceDetail,
  issueWorkforceActivationSlips,
  issueWorkforcePasswordReset,
  listHospitalOwnersForPasswordReset,
  listWorkforce,
  listWorkforceHospitals,
  previewWorkforceActivation,
  provisionHospitalMember,
  provisionOsm,
  provisionWorkforceBulk,
  regenerateWorkforceActivation,
  revokeIssuedWorkforceActivation,
  revokeWorkforceActivation,
  suspendOsmRelationship,
  WorkforceBulkDuplicateError,
} from "@/modules/workforce/services/workforce-service";
import { InfrastructureError } from "@/shared/errors/application-error";

const { mockedReplacePassword } = vi.hoisted(() => ({ mockedReplacePassword: vi.fn() }));

vi.mock("@/modules/account-security/adapters/supabase-account-security-provider", () => ({
  replacePasswordAndRevokeRecoverySessions: mockedReplacePassword,
}));

const prisma = getPrisma();
const PASSWORD = "integration-workforce-password";
const NEW_PASSWORD = "integration-new-workforce-password";
const GENERIC_UNAVAILABLE = "ไม่สามารถยืนยันได้";

// Valid Thai national IDs (checksum included) so the suite never depends on the test bypass.
function nationalIdFor(sequence: number): string {
  const base = `1${String(sequence).padStart(11, "0")}`;
  const sum = Array.from(base, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);

  return `${base}${(11 - (sum % 11)) % 10}`;
}

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

async function createHospital(code: string): Promise<{ id: string; name: string }> {
  return prisma.hospital.create({
    data: { hospitalCode: code, name: `โรงพยาบาล ${code}`, status: HospitalStatus.ACTIVE },
    select: { id: true, name: true },
  });
}

type TestActor = { actor: ActorContext; userId: string };

async function createMember(
  hospitalId: string,
  membershipType: MembershipType,
  sequence: number,
): Promise<TestActor> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: nationalIdFor(sequence),
      }),
      givenName: "ผู้ดูแล",
      familyName: `หมายเลข${sequence}`,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId,
      membershipType,
      profession: membershipType === MembershipType.MEMBER ? "NURSE" : null,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId,
          membershipType,
          profession: membershipType === MembershipType.MEMBER ? "NURSE" : null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createAdmin(sequence: number): Promise<TestActor> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: nationalIdFor(sequence),
      }),
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createActiveOsm(
  hospitalId: string,
  sequence: number,
): Promise<{ userId: string; authSubject: string; nationalId: string }> {
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }),
      givenName: "สมหญิง",
      familyName: "ใจดี",
    },
    select: { id: true },
  });
  const authSubject = randomUUID();
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE },
  });

  return { userId: user.id, authSubject, nationalId };
}

function provisioner(authSubject: string) {
  return async ({ userId, password }: { userId: string; password: string }) => {
    expect(password).toBe(PASSWORD);
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

async function provisionPendingOsm(
  owner: TestActor,
  hospitalId: string,
  sequence: number,
): Promise<{ userId: string; token: string; nationalId: string }> {
  const nationalId = nationalIdFor(sequence);
  const result = await provisionOsm(owner.actor, {
    nationalId,
    givenName: "สมชาย",
    familyName: "ใจดีมาก",
    targetHospitalId: hospitalId,
  });

  return { userId: result.userId, token: result.activationToken!, nationalId };
}

async function auditCount(action: string): Promise<number> {
  return prisma.auditEvent.count({ where: { action } });
}

describe("workforce onboarding v2 PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    mockedReplacePassword.mockReset();
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("activation identity check", () => {
    it("previews only a masked name and treats every unusable token alike", async () => {
      const hospital = await createHospital("V2-PREVIEW");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);

      const preview = await previewWorkforceActivation(pending.token);

      expect(preview).toEqual({ maskedName: "สม*** ใจ***", purpose: "ACTIVATION" });
      expect(JSON.stringify(preview)).not.toContain(pending.nationalId);
      expect(JSON.stringify(preview)).not.toContain("ใจดีมาก");

      await expect(previewWorkforceActivation("unknown-token")).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await prisma.workforceActivation.updateMany({
        where: { userId: pending.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(previewWorkforceActivation(pending.token)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("rejects a wrong national ID with the same error as a bad link and never calls the provider", async () => {
      const hospital = await createHospital("V2-WRONG");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);
      const provisionIdentity = vi.fn();

      const wrongId = await completeWorkforceActivation(
        pending.token,
        { nationalId: nationalIdFor(999), password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity },
      ).catch((error: Error) => error);
      const badLink = await completeWorkforceActivation(
        "not-a-real-token",
        { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity },
      ).catch((error: Error) => error);

      expect(wrongId).toMatchObject({ code: "CONFLICT" });
      expect((wrongId as Error).message).toBe((badLink as Error).message);
      expect((wrongId as Error).message).toContain(GENERIC_UNAVAILABLE);
      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(
        await prisma.workforceActivation.findFirst({
          where: { userId: pending.userId },
          select: { failedVerificationCount: true, revokedAt: true },
        }),
      ).toEqual({ failedVerificationCount: 1, revokedAt: null });
    });

    it("keeps the link usable after four failures and succeeds with the correct ID", async () => {
      const hospital = await createHospital("V2-FOUR");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          completeWorkforceActivation(pending.token, {
            nationalId: nationalIdFor(900 + attempt),
            password: PASSWORD,
            passwordConfirmation: PASSWORD,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      await completeWorkforceActivation(
        pending.token,
        { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity: provisioner(randomUUID()) },
      );

      expect(
        await prisma.user.findUnique({ where: { id: pending.userId }, select: { status: true } }),
      ).toEqual({ status: UserStatus.ACTIVE });
    });

    it("revokes the token after five wrong IDs, audits it, and rejects the correct ID afterwards", async () => {
      const hospital = await createHospital("V2-FIVE");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);
      const provisionIdentity = vi.fn();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(
          completeWorkforceActivation(
            pending.token,
            { nationalId: nationalIdFor(900 + attempt), password: PASSWORD, passwordConfirmation: PASSWORD },
            { provisionIdentity },
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      const activation = await prisma.workforceActivation.findFirstOrThrow({
        where: { userId: pending.userId },
        select: { failedVerificationCount: true, revokedAt: true, usedAt: true },
      });
      expect(activation.failedVerificationCount).toBe(5);
      expect(activation.revokedAt).toBeInstanceOf(Date);
      expect(await auditCount("workforce_activation.verification_failed")).toBe(5);
      expect(await auditCount("workforce_activation.revoked")).toBe(1);

      await expect(
        completeWorkforceActivation(
          pending.token,
          { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
          { provisionIdentity },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(previewWorkforceActivation(pending.token)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();

      const events = await prisma.auditEvent.findMany({
        where: { action: { startsWith: "workforce_activation." } },
        select: { metadata: true },
      });
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(pending.nationalId);
      expect(serialized).not.toContain(pending.token);
    });
  });

  describe("assisted workforce password reset", () => {
    async function setup() {
      const hospital = await createHospital("V2-RESET");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const osm = await createActiveOsm(hospital.id, 200);

      return { hospital, owner, osm };
    }

    it("lets an OWNER reset an ACTIVE OSM: ASSISTED, 15 minutes, RESET purpose, old sessions revoked via the provider", async () => {
      const { hospital, owner, osm } = await setup();
      const now = new Date("2026-10-14T00:00:00.000Z");
      mockedReplacePassword.mockResolvedValue(undefined);

      const issued = await issueWorkforcePasswordReset(
        owner.actor,
        { userId: osm.userId, targetHospitalId: hospital.id },
        { now: () => now },
      );

      expect(issued.targetKind).toBe("OSM");
      expect(issued.activationMode).toBe("ASSISTED");
      expect(issued.activationExpiresAt.toISOString()).toBe("2026-10-14T00:15:00.000Z");
      expect(
        await prisma.workforceActivation.findUniqueOrThrow({
          where: { tokenHash: hashWorkforceActivationToken(issued.activationToken) },
          select: { purpose: true, mode: true, createdByUserId: true, failedVerificationCount: true },
        }),
      ).toEqual({
        purpose: WorkforceActivationPurpose.RESET,
        mode: "ASSISTED",
        createdByUserId: owner.userId,
        failedVerificationCount: 0,
      });
      await expect(previewWorkforceActivation(issued.activationToken, { now: () => now })).resolves.toEqual({
        maskedName: "สม*** ใจ***",
        purpose: "RESET",
      });

      await completeWorkforcePasswordReset(
        issued.activationToken,
        { nationalId: osm.nationalId, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
        { now: () => now },
      );

      expect(mockedReplacePassword).toHaveBeenCalledWith({
        userId: osm.userId,
        authSubject: osm.authSubject,
        newPassword: NEW_PASSWORD,
      });
      expect(
        await prisma.workforceActivation.findUniqueOrThrow({
          where: { id: issued.activationId },
          select: { usedAt: true },
        }),
      ).toEqual({ usedAt: now });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: osm.userId }, select: { status: true, authSubject: true } }),
      ).toEqual({ status: UserStatus.ACTIVE, authSubject: osm.authSubject });
      expect(await auditCount("workforce_password_reset.issued")).toBe(1);
      expect(await auditCount("workforce_password_reset.completed")).toBe(1);

      const audits = JSON.stringify(
        await prisma.auditEvent.findMany({
          where: { action: { startsWith: "workforce_password_reset." } },
          select: { actorUserId: true, action: true, resourceId: true, metadata: true },
        }),
      );
      for (const secret of [issued.activationToken, NEW_PASSWORD, osm.nationalId]) {
        expect(audits).not.toContain(secret);
      }
      expect(audits).toContain(owner.userId);
      expect(audits).toContain(osm.userId);

      await expect(
        completeWorkforcePasswordReset(issued.activationToken, {
          nationalId: osm.nationalId,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockedReplacePassword).toHaveBeenCalledTimes(1);
    });

    it("wires the default provider boundary to replacePasswordAndRevokeRecoverySessions", async () => {
      const { hospital, owner, osm } = await setup();
      mockedReplacePassword.mockResolvedValue(undefined);
      const issued = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });

      await completeWorkforcePasswordReset(issued.activationToken, {
        nationalId: osm.nationalId,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      });

      expect(mockedReplacePassword).toHaveBeenCalledTimes(1);
    });

    it("requires the correct national ID and revokes the reset token after five failures", async () => {
      const { hospital, owner, osm } = await setup();
      const issued = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(
          completeWorkforcePasswordReset(issued.activationToken, {
            nationalId: nationalIdFor(900 + attempt),
            password: NEW_PASSWORD,
            passwordConfirmation: NEW_PASSWORD,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      await expect(
        completeWorkforcePasswordReset(issued.activationToken, {
          nationalId: osm.nationalId,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockedReplacePassword).not.toHaveBeenCalled();
      expect(await auditCount("workforce_password_reset.verification_failed")).toBe(5);
      expect(await auditCount("workforce_password_reset.revoked")).toBe(1);
      expect(await auditCount("workforce_password_reset.completed")).toBe(0);
    });

    it("keeps ACTIVATION and RESET tokens strictly separate", async () => {
      const { hospital, owner, osm } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 201);
      const reset = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });
      const provisionIdentity = vi.fn();

      await expect(
        completeWorkforcePasswordReset(pending.token, {
          nationalId: pending.nationalId,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        completeWorkforceActivation(
          reset.activationToken,
          { nationalId: osm.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
          { provisionIdentity },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(mockedReplacePassword).not.toHaveBeenCalled();
      expect(provisionIdentity).not.toHaveBeenCalled();
      // Purpose mismatches fail closed without consuming the other token or counting an attempt.
      expect(
        await prisma.workforceActivation.findMany({
          where: { id: { in: [reset.activationId] } },
          select: { failedVerificationCount: true, claimedAt: true, usedAt: true, revokedAt: true },
        }),
      ).toEqual([{ failedVerificationCount: 0, claimedAt: null, usedAt: null, revokedAt: null }]);
      expect(
        await prisma.workforceActivation.findFirstOrThrow({
          where: { userId: pending.userId },
          select: { failedVerificationCount: true, claimedAt: true, usedAt: true },
        }),
      ).toEqual({ failedVerificationCount: 0, claimedAt: null, usedAt: null });
    });

    it("does not report success on provider failure and leaves the token reclaimable", async () => {
      const { hospital, owner, osm } = await setup();
      const issued = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });
      const input = {
        nationalId: osm.nationalId,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      };
      mockedReplacePassword.mockRejectedValueOnce(new InfrastructureError("provider down"));

      await expect(completeWorkforcePasswordReset(issued.activationToken, input)).rejects.toBeInstanceOf(
        InfrastructureError,
      );

      expect(
        await prisma.workforceActivation.findUniqueOrThrow({
          where: { id: issued.activationId },
          select: { claimedAt: true, usedAt: true, revokedAt: true },
        }),
      ).toEqual({ claimedAt: null, usedAt: null, revokedAt: null });
      expect(await auditCount("workforce_password_reset.completed")).toBe(0);

      mockedReplacePassword.mockResolvedValueOnce(undefined);
      await expect(completeWorkforcePasswordReset(issued.activationToken, input)).resolves.toEqual({
        userId: osm.userId,
      });
      expect(await auditCount("workforce_password_reset.completed")).toBe(1);
    });

    it("issuing a reset revokes any outstanding token so only the newest works", async () => {
      const { hospital, owner, osm } = await setup();
      const first = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });
      const second = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });
      mockedReplacePassword.mockResolvedValue(undefined);
      const input = { nationalId: osm.nationalId, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD };

      await expect(completeWorkforcePasswordReset(first.activationToken, input)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(completeWorkforcePasswordReset(second.activationToken, input)).resolves.toBeDefined();
      expect(await auditCount("workforce_password_reset.revoked")).toBe(1);
    });

    it("rejects issuing while a reset is being completed", async () => {
      const { hospital, owner, osm } = await setup();
      const issued = await issueWorkforcePasswordReset(owner.actor, {
        userId: osm.userId,
        targetHospitalId: hospital.id,
      });
      await prisma.workforceActivation.update({
        where: { id: issued.activationId },
        data: { claimedAt: new Date() },
      });

      await expect(
        issueWorkforcePasswordReset(owner.actor, { userId: osm.userId, targetHospitalId: hospital.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("enforces the reset authority matrix on the server", async () => {
      const { hospital, owner, osm } = await setup();
      const otherOwner = await createMember(hospital.id, MembershipType.OWNER, 2);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 3);
      const admin = await createAdmin(4);
      const otherHospital = await createHospital("V2-OTHER");
      const foreignOwner = await createMember(otherHospital.id, MembershipType.OWNER, 5);
      const request = (userId: string) => ({ userId, targetHospitalId: hospital.id });

      // OWNER -> MEMBER staff and OSM: allowed.
      await expect(issueWorkforcePasswordReset(owner.actor, request(member.userId))).resolves.toMatchObject({
        targetKind: "HOSPITAL_MEMBER",
      });
      await expect(issueWorkforcePasswordReset(owner.actor, request(osm.userId))).resolves.toMatchObject({
        targetKind: "OSM",
      });
      // OWNER -> another OWNER, and anybody -> self: denied.
      await expect(issueWorkforcePasswordReset(owner.actor, request(otherOwner.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(issueWorkforcePasswordReset(owner.actor, request(owner.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(issueWorkforcePasswordReset(admin.actor, request(admin.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // ADMIN -> OWNER: allowed; ADMIN -> non-OWNER: denied.
      await expect(issueWorkforcePasswordReset(admin.actor, request(otherOwner.userId))).resolves.toMatchObject({
        targetKind: "HOSPITAL_OWNER",
      });
      await expect(issueWorkforcePasswordReset(admin.actor, request(osm.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // MEMBER -> anyone: denied. Cross-Hospital OWNER: denied.
      for (const target of [osm.userId, otherOwner.userId, owner.userId]) {
        await expect(issueWorkforcePasswordReset(member.actor, request(target))).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      }
      await expect(issueWorkforcePasswordReset(foreignOwner.actor, request(osm.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // A forged actor context cannot bypass the database membership re-check.
      await prisma.hospitalMembership.updateMany({
        where: { userId: owner.userId },
        data: { status: MembershipStatus.SUSPENDED },
      });
      await expect(issueWorkforcePasswordReset(owner.actor, request(osm.userId))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects targets that are not ACTIVE with an authentication mapping", async () => {
      const { hospital, owner } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 210);
      const unmapped = await createActiveOsm(hospital.id, 211);
      await prisma.user.update({ where: { id: unmapped.userId }, data: { authSubject: null } });
      const suspended = await createActiveOsm(hospital.id, 212);
      await prisma.osmHospitalRelationship.updateMany({
        where: { userId: suspended.userId },
        data: { status: MembershipStatus.SUSPENDED },
      });

      for (const userId of [pending.userId, unmapped.userId, suspended.userId, randomUUID()]) {
        await expect(
          issueWorkforcePasswordReset(owner.actor, { userId, targetHospitalId: hospital.id }),
        ).rejects.toBeDefined();
      }
      expect(await prisma.workforceActivation.count({ where: { purpose: "RESET" } })).toBe(0);
    });

    it("lets only Platform ADMIN list OWNER reset targets", async () => {
      const { hospital, owner } = await setup();
      const admin = await createAdmin(4);

      await expect(listHospitalOwnersForPasswordReset(admin.actor, hospital.id)).resolves.toEqual([
        { userId: owner.userId, displayName: "ผู้ดูแล หมายเลข1", canReset: true },
      ]);
      await expect(listHospitalOwnersForPasswordReset(owner.actor, hospital.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("MEMBER OSM provisioning (ADR-0008 amendment D1)", () => {
    async function setup() {
      const hospital = await createHospital("V2-MEMBER");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);

      return { hospital, owner, member };
    }

    it("lets an ACTIVE MEMBER provision an OSM and issue or regenerate its activation", async () => {
      const { hospital, member } = await setup();
      const created = await provisionOsm(member.actor, {
        nationalId: nationalIdFor(300),
        givenName: "สมชาย",
        familyName: "ใจดีมาก",
        targetHospitalId: hospital.id,
      });

      expect(created.activationToken).toBeTruthy();
      expect(await auditCount("osm_relationship.provisioned")).toBe(1);

      const regenerated = await regenerateWorkforceActivation(member.actor, {
        userId: created.userId,
        targetHospitalId: hospital.id,
        kind: "OSM",
        mode: "REMOTE",
      });
      expect(regenerated.activationToken).not.toBe(created.activationToken);
      await expect(
        regenerateWorkforceActivation(member.actor, {
          userId: created.userId,
          targetHospitalId: hospital.id,
          kind: "OSM",
          mode: "ASSISTED",
        }),
      ).resolves.toMatchObject({ activationMode: "ASSISTED" });
    });

    it("denies a MEMBER staff provisioning, suspend, restore, revoke, reset and detail of staff", async () => {
      const { hospital, owner, member } = await setup();
      const osm = await createActiveOsm(hospital.id, 301);
      const pending = await provisionPendingOsm(owner, hospital.id, 302);
      const relationship = await prisma.osmHospitalRelationship.findFirstOrThrow({
        where: { userId: osm.userId },
        select: { id: true, updatedAt: true },
      });

      await expect(
        provisionHospitalMember(member.actor, {
          nationalId: nationalIdFor(303),
          givenName: "สมชาย",
          familyName: "บุคลากร",
          targetHospitalId: hospital.id,
          profession: "NURSE",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        suspendOsmRelationship(member.actor, {
          relationshipId: relationship.id,
          targetHospitalId: hospital.id,
          expectedUpdatedAt: relationship.updatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        revokeWorkforceActivation(member.actor, {
          userId: pending.userId,
          targetHospitalId: hospital.id,
          kind: "OSM",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        issueWorkforcePasswordReset(member.actor, { userId: osm.userId, targetHospitalId: hospital.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        regenerateWorkforceActivation(member.actor, {
          userId: pending.userId,
          targetHospitalId: hospital.id,
          kind: "HOSPITAL_MEMBER",
          mode: "REMOTE",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.person.count({ where: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalIdFor(303) }) } })).toBe(0);
      expect(
        await prisma.osmHospitalRelationship.findUniqueOrThrow({
          where: { id: relationship.id },
          select: { status: true },
        }),
      ).toEqual({ status: MembershipStatus.ACTIVE });
      expect(
        await prisma.workforceActivation.findFirstOrThrow({
          where: { userId: pending.userId },
          select: { revokedAt: true },
        }),
      ).toEqual({ revokedAt: null });
    });

    it("re-checks the MEMBER relationship in the database, not only the supplied actor context", async () => {
      const { hospital, member } = await setup();
      await prisma.hospitalMembership.updateMany({
        where: { userId: member.userId },
        data: { status: MembershipStatus.SUSPENDED },
      });

      await expect(
        provisionOsm(member.actor, {
          nationalId: nationalIdFor(310),
          givenName: "สมชาย",
          familyName: "ใจดีมาก",
          targetHospitalId: hospital.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.osmHospitalRelationship.count()).toBe(0);
    });

    it("gives a MEMBER the OSM roster and read-only OSM detail, but no staff data", async () => {
      const { hospital, owner, member } = await setup();
      await provisionPendingOsm(owner, hospital.id, 320);
      const osm = await createActiveOsm(hospital.id, 321);
      await provisionHospitalMember(owner.actor, {
        nationalId: nationalIdFor(322),
        givenName: "สมชาย",
        familyName: "บุคลากร",
        targetHospitalId: hospital.id,
        profession: "DOCTOR",
      });

      const list = await listWorkforce(member.actor, { targetHospitalId: hospital.id });
      const ownerList = await listWorkforce(owner.actor, { targetHospitalId: hospital.id });
      const hospitals = await listWorkforceHospitals(member.actor);

      expect(list.viewerScope).toBe("MEMBER");
      expect(list.rows.every((row) => row.kind === "OSM")).toBe(true);
      expect(list.rows).toHaveLength(2);
      expect(ownerList.viewerScope).toBe("OWNER");
      expect(ownerList.rows.some((row) => row.kind === "HOSPITAL_MEMBER")).toBe(true);
      expect(hospitals).toEqual([
        { id: hospital.id, hospitalCode: "V2-MEMBER", name: hospital.name, scope: "MEMBER" },
      ]);

      const relationship = await prisma.osmHospitalRelationship.findFirstOrThrow({
        where: { userId: osm.userId },
        select: { id: true },
      });
      const detail = await getWorkforceDetail(member.actor, { kind: "osm", relationshipId: relationship.id });
      expect(detail.viewerScope).toBe("MEMBER");
      expect(detail.actions).toEqual({
        updateProfession: false,
        suspend: false,
        restore: false,
        resetPassword: false,
      });

      const staff = await prisma.hospitalMembership.findFirstOrThrow({
        where: { hospitalId: hospital.id, membershipType: MembershipType.MEMBER, profession: "DOCTOR" },
        select: { id: true },
      });
      await expect(
        getWorkforceDetail(member.actor, { kind: "staff", relationshipId: staff.id }),
      ).rejects.toBeDefined();
      const ownerDetail = await getWorkforceDetail(owner.actor, { kind: "osm", relationshipId: relationship.id });
      expect(ownerDetail.actions.resetPassword).toBe(true);
    });

    it("lets a MEMBER undo only the assisted token it just issued", async () => {
      const { hospital, owner, member } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 330);
      const issued = await regenerateWorkforceActivation(member.actor, {
        userId: pending.userId,
        targetHospitalId: hospital.id,
        kind: "OSM",
        mode: "ASSISTED",
      });

      await expect(
        revokeIssuedWorkforceActivation(owner.actor, { activationId: issued.activationId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await revokeIssuedWorkforceActivation(member.actor, { activationId: issued.activationId });

      expect(
        await prisma.workforceActivation.findUniqueOrThrow({
          where: { id: issued.activationId },
          select: { revokedAt: true },
        }),
      ).toEqual({ revokedAt: expect.any(Date) });
      await expect(
        completeWorkforceActivation(issued.activationToken, {
          nationalId: pending.nationalId,
          password: PASSWORD,
          passwordConfirmation: PASSWORD,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("multi-row add", () => {
    async function setup() {
      const hospital = await createHospital("V2-BULK");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);

      return { hospital, owner, member };
    }

    const osmRow = (sequence: number) => ({
      nationalId: nationalIdFor(sequence),
      givenName: "สมชาย",
      familyName: `อสม${sequence}`,
    });

    it("reports created, existing and invalid rows for 50 mixed rows without duplicating identities", async () => {
      const { hospital, owner } = await setup();
      for (let sequence = 1000; sequence < 1010; sequence += 1) {
        await provisionOsm(owner.actor, { ...osmRow(sequence), targetHospitalId: hospital.id });
      }
      const rows: unknown[] = [
        ...Array.from({ length: 20 }, (_, index) => osmRow(1100 + index)),
        ...Array.from({ length: 10 }, (_, index) => osmRow(1000 + index)),
        ...Array.from({ length: 10 }, (_, index) =>
          index % 2 === 0
            ? { ...osmRow(1200 + index), nationalId: `12345678901${index}` }
            : { ...osmRow(1200 + index), givenName: "" },
        ),
        ...Array.from({ length: 10 }, (_, index) => osmRow(1300 + index)),
      ];
      const personsBefore = await prisma.person.count();

      const result = await provisionWorkforceBulk(owner.actor, {
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows,
      });

      expect(result.rows).toHaveLength(50);
      expect(result.rows.map(({ rowNumber }) => rowNumber)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(result.rows.filter(({ status }) => status === "created")).toHaveLength(30);
      expect(result.rows.filter(({ status }) => status === "existing")).toHaveLength(10);
      expect(result.rows.filter((row) => row.status === "invalid")).toEqual(
        Array.from({ length: 10 }, (_, index) => ({
          rowNumber: 31 + index,
          status: "invalid",
          reason: "INVALID_ROW",
        })),
      );
      expect(JSON.stringify(result)).not.toMatch(/token|activationToken/i);
      expect(await prisma.person.count()).toBe(personsBefore + 30);
      expect(await prisma.osmHospitalRelationship.count()).toBe(40);
      expect(await prisma.user.count({ where: { status: UserStatus.PROVISIONED } })).toBe(40);

      const rerun = await provisionWorkforceBulk(owner.actor, {
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows: rows.slice(0, 5),
      });
      expect(rerun.rows.every((row) => row.status === "existing")).toBe(true);
      expect(await prisma.osmHospitalRelationship.count()).toBe(40);
    });

    it("rejects in-batch duplicate national IDs before any write", async () => {
      const { hospital, owner } = await setup();
      const rows = [osmRow(1400), osmRow(1401), { ...osmRow(1400), givenName: "ซ้ำ" }, osmRow(1402)];
      const before = { persons: await prisma.person.count(), users: await prisma.user.count() };

      const error = await provisionWorkforceBulk(owner.actor, {
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WorkforceBulkDuplicateError);
      expect((error as WorkforceBulkDuplicateError).rowNumbers).toEqual([1, 3]);
      expect(await prisma.person.count()).toBe(before.persons);
      expect(await prisma.user.count()).toBe(before.users);
    });

    it("bounds the submission to 1-50 rows", async () => {
      const { hospital, owner } = await setup();

      await expect(
        provisionWorkforceBulk(owner.actor, { kind: "OSM", targetHospitalId: hospital.id, rows: [] }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        provisionWorkforceBulk(owner.actor, {
          kind: "OSM",
          targetHospitalId: hospital.id,
          rows: Array.from({ length: 51 }, (_, index) => osmRow(1500 + index)),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.osmHospitalRelationship.count()).toBe(0);
    });

    it("applies the staff conflicts per row and adds staff in bulk only for an OWNER", async () => {
      const { hospital, owner, member } = await setup();
      const staffRow = (sequence: number, profession: string) => ({
        nationalId: nationalIdFor(sequence),
        givenName: "สมชาย",
        familyName: `บุคลากร${sequence}`,
        profession,
      });
      await provisionHospitalMember(owner.actor, {
        ...staffRow(1600, "DOCTOR"),
        profession: "DOCTOR",
        targetHospitalId: hospital.id,
      });

      const result = await provisionWorkforceBulk(owner.actor, {
        kind: "HOSPITAL_MEMBER",
        targetHospitalId: hospital.id,
        rows: [staffRow(1601, "NURSE"), staffRow(1600, "DOCTOR"), staffRow(1600 + 2, "NOT_A_PROFESSION"), staffRow(1600 + 3, "OTHER")],
      });
      const conflict = await provisionWorkforceBulk(owner.actor, {
        kind: "HOSPITAL_MEMBER",
        targetHospitalId: hospital.id,
        rows: [staffRow(1600, "NURSE")],
      });

      expect(result.rows.map(({ status }) => status)).toEqual(["created", "existing", "invalid", "created"]);
      expect(conflict.rows).toEqual([{ rowNumber: 1, status: "invalid", reason: "CONFLICT" }]);
      await expect(
        provisionWorkforceBulk(member.actor, {
          kind: "HOSPITAL_MEMBER",
          targetHospitalId: hospital.id,
          rows: [staffRow(1700, "NURSE")],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        provisionWorkforceBulk(member.actor, {
          kind: "OSM",
          targetHospitalId: hospital.id,
          rows: [osmRow(1701)],
        }),
      ).resolves.toMatchObject({ rows: [{ status: "created" }] });
    });
  });

  describe("activation slips and the pending view", () => {
    async function setup() {
      const hospital = await createHospital("V2-SLIPS");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);

      return { hospital, owner, member };
    }

    it("issues fresh 72-hour REMOTE tokens, revokes the previous ones, and stores only digests", async () => {
      const { hospital, member } = await setup();
      const now = new Date("2026-10-14T03:00:00.000Z");
      const people = [] as { userId: string; token: string; nationalId: string }[];
      for (const sequence of [2000, 2001, 2002]) {
        const created = await provisionOsm(member.actor, {
          nationalId: nationalIdFor(sequence),
          givenName: "สมชาย",
          familyName: "ใจดีมาก",
          targetHospitalId: hospital.id,
        });
        people.push({ userId: created.userId, token: created.activationToken!, nationalId: nationalIdFor(sequence) });
      }

      const result = await issueWorkforceActivationSlips(
        member.actor,
        { targetHospitalId: hospital.id, kind: "OSM", userIds: people.map(({ userId }) => userId) },
        { now: () => now },
      );

      expect(result.failures).toEqual([]);
      expect(result.slips).toHaveLength(3);
      for (const slip of result.slips) {
        const original = people.find(({ userId }) => userId === slip.userId)!;

        expect(slip.maskedName).toBe("สม*** ใจ***");
        expect(slip.hospitalName).toBe(hospital.name);
        expect(slip.activationExpiresAt.toISOString()).toBe("2026-10-17T03:00:00.000Z");
        expect(slip.activationToken).not.toBe(original.token);
        expect(
          await prisma.workforceActivation.findUniqueOrThrow({
            where: { tokenHash: hashWorkforceActivationToken(original.token) },
            select: { revokedAt: true },
          }),
        ).toEqual({ revokedAt: now });
        expect(
          await prisma.workforceActivation.findUniqueOrThrow({
            where: { tokenHash: hashWorkforceActivationToken(slip.activationToken) },
            select: { mode: true, purpose: true, expiresAt: true },
          }),
        ).toEqual({ mode: "REMOTE", purpose: "ACTIVATION", expiresAt: slip.activationExpiresAt });
        await expect(previewWorkforceActivation(original.token, { now: () => now })).rejects.toMatchObject({
          code: "CONFLICT",
        });
        await expect(previewWorkforceActivation(slip.activationToken, { now: () => now })).resolves.toBeDefined();
      }

      const stored = JSON.stringify(await prisma.workforceActivation.findMany());
      const audits = JSON.stringify(await prisma.auditEvent.findMany());
      for (const { activationToken } of result.slips) {
        expect(stored).not.toContain(activationToken);
        expect(audits).not.toContain(activationToken);
      }
      expect(
        await prisma.auditEvent.count({
          where: { action: "workforce_activation.issued", metadata: { path: ["source"], equals: "activation_slip" } },
        }),
      ).toBe(3);
    });

    it("reports people who are not pending instead of issuing for them, and bounds the selection", async () => {
      const { hospital, owner } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 2100);
      const active = await createActiveOsm(hospital.id, 2101);
      const otherHospital = await createHospital("V2-SLIPS-OTHER");
      const foreign = await provisionPendingOsm(
        await createMember(otherHospital.id, MembershipType.OWNER, 3),
        otherHospital.id,
        2102,
      );

      const result = await issueWorkforceActivationSlips(owner.actor, {
        targetHospitalId: hospital.id,
        kind: "OSM",
        userIds: [pending.userId, active.userId, foreign.userId, randomUUID()],
      });

      expect(result.slips.map(({ userId }) => userId)).toEqual([pending.userId]);
      expect(result.failures).toEqual([
        { userId: active.userId, reason: "NOT_PENDING" },
        { userId: foreign.userId, reason: "NOT_PENDING" },
        expect.objectContaining({ reason: "NOT_PENDING" }),
      ]);
      // The other Hospital's credential is untouched.
      expect(
        await prisma.workforceActivation.findFirstOrThrow({
          where: { userId: foreign.userId },
          select: { revokedAt: true },
        }),
      ).toEqual({ revokedAt: null });
      await expect(
        issueWorkforceActivationSlips(owner.actor, {
          targetHospitalId: hospital.id,
          kind: "OSM",
          userIds: Array.from({ length: 51 }, () => randomUUID()),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("keeps staff slips OWNER-only and reports an in-flight credential", async () => {
      const { hospital, owner, member } = await setup();
      const created = await provisionHospitalMember(owner.actor, {
        nationalId: nationalIdFor(2200),
        givenName: "สมชาย",
        familyName: "บุคลากร",
        targetHospitalId: hospital.id,
        profession: "NURSE",
      });
      const inFlight = await provisionPendingOsm(owner, hospital.id, 2201);
      await prisma.workforceActivation.updateMany({
        where: { userId: inFlight.userId },
        data: { claimedAt: new Date() },
      });

      await expect(
        issueWorkforceActivationSlips(member.actor, {
          targetHospitalId: hospital.id,
          kind: "HOSPITAL_MEMBER",
          userIds: [created.userId],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        issueWorkforceActivationSlips(owner.actor, {
          targetHospitalId: hospital.id,
          kind: "HOSPITAL_MEMBER",
          userIds: [created.userId],
        }),
      ).resolves.toMatchObject({ slips: [{ userId: created.userId }], failures: [] });
      await expect(
        issueWorkforceActivationSlips(member.actor, {
          targetHospitalId: hospital.id,
          kind: "OSM",
          userIds: [inFlight.userId],
        }),
      ).resolves.toMatchObject({ slips: [], failures: [{ userId: inFlight.userId, reason: "IN_USE" }] });
    });

    it("shows pending and expired people with the latest expiry, and never marks active people pending", async () => {
      const { hospital, owner, member } = await setup();
      const fresh = await provisionPendingOsm(owner, hospital.id, 2300);
      const stale = await provisionPendingOsm(owner, hospital.id, 2301);
      const revoked = await provisionPendingOsm(owner, hospital.id, 2302);
      const active = await createActiveOsm(hospital.id, 2303);
      await prisma.workforceActivation.updateMany({
        where: { userId: stale.userId },
        data: { expiresAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      await prisma.workforceActivation.updateMany({
        where: { userId: revoked.userId },
        data: { revokedAt: new Date() },
      });

      const list = await listWorkforce(member.actor, { targetHospitalId: hospital.id });
      const byUser = new Map(list.rows.map((row) => [row.userId, row]));

      expect(byUser.get(fresh.userId)).toMatchObject({ activationStatus: "PENDING", activationRequired: true });
      expect(byUser.get(fresh.userId)!.activationExpiresAt).toBeInstanceOf(Date);
      expect(byUser.get(stale.userId)).toMatchObject({
        activationStatus: "EXPIRED",
        activationExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(byUser.get(revoked.userId)).toMatchObject({ activationStatus: "EXPIRED", activationExpiresAt: null });
      expect(byUser.get(active.userId)).toMatchObject({ activationStatus: null, activationRequired: false });
    });
  });
});
