import {
  AccountRecoveryDeliveryChannel,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import { decideAccountRecoveryIssuePolicy } from "../policies/account-recovery-policy";
import { hashAccountRecoveryToken } from "./account-recovery-token-service";
import {
  ACCOUNT_RECOVERY_TTL_MS,
  completePatientAccountRecovery,
  getPatientAccountRecoveryAvailability,
  issuePatientAccountRecovery,
  type AccountRecoveryDatabase,
} from "./account-recovery-service";

const userId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "77777777-7777-4777-8777-777777777777";
const relationshipId = "33333333-3333-4333-8333-333333333333";
const recoveryId = "44444444-4444-4444-8444-444444444444";
const hospitalId = "55555555-5555-4555-8555-555555555555";
const token = "A".repeat(43);
const nationalId = "1000000000009";
const now = new Date("2026-09-30T05:00:00.000Z");

function ownerActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId,
    personId: "66666666-6666-4666-8666-666666666666",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function createIssuanceDatabase(options: {
  target?: {
    status?: UserStatus;
    authSubject?: string | null;
    roles?: readonly { role: Role }[];
  };
  unresolved?: readonly { id: string; claimedAt: Date | null }[];
  recentCount?: number;
  relationshipVisible?: boolean;
} = {}) {
  const target = {
    id: targetUserId,
    personId,
    authSubject: "supabase-auth-subject",
    status: UserStatus.ACTIVE,
    roles: [{ role: Role.PATIENT }],
    ...options.target,
  };
  const relationshipRecord = {
    id: relationshipId,
    hospitalId,
    patientProfile: {
      personId,
      person: { id: personId, user: target },
    },
  };
  const relationshipFindFirst = vi
    .fn()
    .mockResolvedValueOnce(
      options.relationshipVisible === false ? null : { hospitalId },
    )
    .mockResolvedValue(relationshipRecord);
  const unresolved = [...(options.unresolved ?? [])];
  const recoveryFindMany = vi.fn().mockResolvedValue(unresolved);
  const recoveryCount = vi.fn().mockResolvedValue(options.recentCount ?? 0);
  const recoveryCreate = vi.fn().mockResolvedValue({ id: recoveryId, targetUserId });
  const recoveryUpdateMany = vi.fn().mockResolvedValue({ count: unresolved.length });
  const auditCreate = vi.fn().mockResolvedValue({});
  const transaction = {
    patientHospitalRelationship: { findFirst: relationshipFindFirst },
    accountRecovery: {
      findMany: recoveryFindMany,
      count: recoveryCount,
      create: recoveryCreate,
      updateMany: recoveryUpdateMany,
    },
    auditEvent: { create: auditCreate },
  };
  const transactionCall = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(transaction),
  );
  const database = {
    patientHospitalRelationship: { findFirst: relationshipFindFirst },
    accountRecovery: { updateMany: recoveryUpdateMany },
    $transaction: transactionCall,
  } as unknown as AccountRecoveryDatabase;

  return {
    database,
    relationshipFindFirst,
    recoveryFindMany,
    recoveryCount,
    recoveryCreate,
    recoveryUpdateMany,
    auditCreate,
    transactionCall,
  };
}

function createClaimDatabase(overrides: {
  expiresAt?: Date;
  claimedAt?: Date | null;
  completedAt?: Date | null;
  reconciliationRequiredAt?: Date | null;
  revokedAt?: Date | null;
  userStatus?: UserStatus;
  roles?: readonly { role: Role }[];
  personId?: string;
  relationshipPersonId?: string;
  updateCount?: number;
} = {}) {
  const recovery = {
    id: recoveryId,
    targetUserId,
    expiresAt: overrides.expiresAt ?? new Date(now.getTime() + ACCOUNT_RECOVERY_TTL_MS),
    claimedAt: overrides.claimedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    reconciliationRequiredAt: overrides.reconciliationRequiredAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    targetUser: {
      id: targetUserId,
      personId: overrides.personId ?? personId,
      authSubject: "supabase-auth-subject",
      status: overrides.userStatus ?? UserStatus.ACTIVE,
      roles: overrides.roles ?? [{ role: Role.PATIENT }],
    },
    relationship: {
      patientProfile: { personId: overrides.relationshipPersonId ?? personId },
    },
  };
  const recoveryFindUnique = vi.fn().mockResolvedValue(recovery);
  const recoveryUpdateMany = vi.fn().mockResolvedValue({ count: optionsCount(overrides.updateCount) });
  const auditCreate = vi.fn().mockResolvedValue({});
  const transaction = {
    accountRecovery: { findUnique: recoveryFindUnique, updateMany: recoveryUpdateMany },
    auditEvent: { create: auditCreate },
  };
  const transactionCall = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(transaction),
  );
  const database = {
    accountRecovery: { findUnique: recoveryFindUnique },
    $transaction: transactionCall,
  } as unknown as AccountRecoveryDatabase;

  return { database, recoveryFindUnique, recoveryUpdateMany, auditCreate, transactionCall };
}

function optionsCount(count: number | undefined): number {
  return count ?? 1;
}

const validIssueInput = {
  nationalId,
  nationalIdConfirmation: nationalId,
  identityVerified: true,
};

describe("assisted Patient account recovery service", () => {
  it("issues an ASSISTED one-time capability only for the exact active Owner relationship", async () => {
    const database = createIssuanceDatabase();
    const findPerson = vi.fn().mockResolvedValue({ id: personId });
    const deliver = vi.fn(async (recoveryUrl: string) => ({ handoffUrl: recoveryUrl }));

    const result = await issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
      database: database.database,
      findPerson,
      createToken: () => token,
      now: () => now,
      delivery: { channel: AccountRecoveryDeliveryChannel.ASSISTED, deliver },
    });

    expect(result).toEqual({
      recoveryId,
      deliveryChannel: AccountRecoveryDeliveryChannel.ASSISTED,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      handoffUrl: `/recover#${token}`,
    });
    expect(findPerson).toHaveBeenCalledWith(nationalId);
    expect(database.relationshipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: relationshipId,
          hospital: expect.objectContaining({
            memberships: expect.objectContaining({
              some: expect.objectContaining({
                membershipType: MembershipType.OWNER,
                status: MembershipStatus.ACTIVE,
              }),
            }),
          }),
        }),
      }),
    );
    const storedCapability = database.recoveryCreate.mock.calls[0]?.[0].data;
    expect(storedCapability.tokenHash).toBe(hashAccountRecoveryToken(token));
    expect(storedCapability.tokenHash).not.toBe(token);
    expect(storedCapability.expiresAt).toEqual(new Date(now.getTime() + 15 * 60 * 1000));
    expect(storedCapability.deliveryChannel).toBe(AccountRecoveryDeliveryChannel.ASSISTED);
    expect(JSON.stringify(storedCapability)).not.toContain(nationalId);
    expect(JSON.stringify(database.auditCreate.mock.calls)).not.toContain(nationalId);
    expect(JSON.stringify(database.auditCreate.mock.calls)).not.toContain(token);
  });

  it("does not resolve National ID for an issuer without the exact active Owner scope", async () => {
    const database = createIssuanceDatabase({ relationshipVisible: false });
    const findPerson = vi.fn();

    await expect(
      issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
        database: database.database,
        findPerson,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(findPerson).not.toHaveBeenCalled();
    expect(database.transactionCall).not.toHaveBeenCalled();
  });

  it("requires the National ID lookup and selected relationship to resolve to the same Person", async () => {
    const database = createIssuanceDatabase();
    const findPerson = vi.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" });

    await expect(
      issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
        database: database.database,
        findPerson,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(database.transactionCall).toHaveBeenCalledOnce();
    expect(database.recoveryCreate).not.toHaveBeenCalled();
  });

  it("requires assisted identity attestation and equal National ID confirmation", async () => {
    const database = createIssuanceDatabase();
    const findPerson = vi.fn();

    await expect(
      issuePatientAccountRecovery(
        ownerActor(),
        relationshipId,
        { ...validIssueInput, identityVerified: false },
        { database: database.database, findPerson },
      ),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      issuePatientAccountRecovery(
        ownerActor(),
        relationshipId,
        { ...validIssueInput, nationalIdConfirmation: "1000000000017" },
        { database: database.database, findPerson },
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(findPerson).not.toHaveBeenCalled();
    expect(database.transactionCall).not.toHaveBeenCalled();
  });

  it.each([
    ["PROVISIONED", { status: UserStatus.PROVISIONED }],
    ["SUSPENDED", { status: UserStatus.SUSPENDED }],
    ["missing authSubject", { authSubject: null }],
    ["non-PATIENT", { roles: [{ role: Role.HOSPITAL }] }],
  ] as const)("denies a %s recovery target", async (_label, target) => {
    const database = createIssuanceDatabase({ target });

    await expect(
      issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
        database: database.database,
        findPerson: async () => ({ id: personId }),
        createToken: () => token,
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(database.recoveryCreate).not.toHaveBeenCalled();
  });

  it("revokes an existing unclaimed capability before issuing its replacement", async () => {
    const database = createIssuanceDatabase({
      unresolved: [{ id: "88888888-8888-4888-8888-888888888888", claimedAt: null }],
    });

    await issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
      database: database.database,
      findPerson: async () => ({ id: personId }),
      createToken: () => token,
      now: () => now,
    });

    expect(database.recoveryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetUserId }),
        data: { revokedAt: now },
      }),
    );
    expect(database.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ACCOUNT_RECOVERY_REVOKED",
          resourceId: "88888888-8888-4888-8888-888888888888",
          metadata: { reason: "SUPERSEDED" },
        }),
      }),
    );
  });

  it("refuses reissue while a prior claim is being completed or reconciled", async () => {
    const database = createIssuanceDatabase({
      unresolved: [{ id: recoveryId, claimedAt: now }],
    });

    await expect(
      issuePatientAccountRecovery(ownerActor(), relationshipId, validIssueInput, {
        database: database.database,
        findPerson: async () => ({ id: personId }),
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(database.recoveryCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid, expired, revoked, used, and claimed tokens with one public failure", async () => {
    await expect(getPatientAccountRecoveryAvailability("invalid", { database: createClaimDatabase().database }))
      .rejects.toBeInstanceOf(ConflictError);

    for (const state of [
      { expiresAt: now },
      { revokedAt: now },
      { completedAt: now },
      { claimedAt: now },
      { reconciliationRequiredAt: now },
      { userStatus: UserStatus.SUSPENDED },
      { roles: [{ role: Role.HOSPITAL }] },
      { relationshipPersonId: "77777777-7777-4777-8777-777777777777" },
    ]) {
      await expect(
        getPatientAccountRecoveryAvailability(token, {
          database: createClaimDatabase(state).database,
          now: () => now,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    }
  });

  it("updates the target account password and completes the capability after provider success", async () => {
    const database = createClaimDatabase();
    const replacePasswordAndRevokeSessions = vi.fn().mockResolvedValue(undefined);
    const newPassword = "new-account-password-long";

    await expect(
      completePatientAccountRecovery(
        { token, newPassword, passwordConfirmation: newPassword },
        {
          database: database.database,
          now: () => now,
          replacePasswordAndRevokeSessions,
        },
      ),
    ).resolves.toBeUndefined();
    expect(replacePasswordAndRevokeSessions).toHaveBeenCalledWith({
      userId: targetUserId,
      authSubject: "supabase-auth-subject",
      newPassword,
    });
    expect(database.recoveryUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: hashAccountRecoveryToken(token), claimedAt: null }),
        data: { claimedAt: now },
      }),
    );
    expect(database.recoveryUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { completedAt: expect.any(Date) } }),
    );
    expect(database.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ACCOUNT_RECOVERY_COMPLETED" }) }),
    );
  });

  it("allows only one concurrent token claim", async () => {
    const database = createClaimDatabase({ updateCount: 0 });
    const replacePasswordAndRevokeSessions = vi.fn();

    await expect(
      completePatientAccountRecovery(
        { token, newPassword: "new-account-password-long", passwordConfirmation: "new-account-password-long" },
        { database: database.database, now: () => now, replacePasswordAndRevokeSessions },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(replacePasswordAndRevokeSessions).not.toHaveBeenCalled();
    expect(database.recoveryUpdateMany).toHaveBeenCalledOnce();
  });

  it("does not report success or permit replay after ambiguous provider failure", async () => {
    const database = createClaimDatabase();
    const replacePasswordAndRevokeSessions = vi.fn().mockRejectedValue(new Error("provider timeout"));

    await expect(
      completePatientAccountRecovery(
        { token, newPassword: "new-account-password-long", passwordConfirmation: "new-account-password-long" },
        { database: database.database, now: () => now, replacePasswordAndRevokeSessions },
      ),
    ).rejects.toBeInstanceOf(InfrastructureError);
    expect(database.recoveryUpdateMany).toHaveBeenCalledTimes(2);
    expect(database.recoveryUpdateMany.mock.calls[1]?.[0].data).toEqual({ reconciliationRequiredAt: expect.any(Date) });
    expect(database.recoveryUpdateMany.mock.calls.some(([args]) => "completedAt" in args.data)).toBe(false);
    expect(database.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ACCOUNT_RECOVERY_RECONCILIATION_REQUIRED" }),
      }),
    );
  });

  it("keeps capability hashing one-way", () => {
    expect(hashAccountRecoveryToken(token)).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(decideAccountRecoveryIssuePolicy(ownerActor(), hospitalId).allowed).toBe(true);
  });
});
