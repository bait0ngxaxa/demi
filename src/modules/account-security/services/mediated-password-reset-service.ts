import "server-only";

import { randomUUID } from "node:crypto";

import {
  AccountRecoveryDeliveryChannel,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  WorkforceActivationMode,
  WorkforceActivationOperationState,
  WorkforceActivationPurpose,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { LineMessagingClient } from "@/modules/line/adapters/line-messaging-client";
import { unlinkLineBindingForSuspectedTakeover } from "@/modules/line/services/line-account-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  deleteReplacedProviderIdentity,
  replacePasswordAndRevokeRecoverySessions,
} from "../adapters/supabase-account-security-provider";
import {
  accountRecoveryTokenSchema,
  mediatedPasswordResetCompletionSchema,
  mediatedPasswordResetIssueSchema,
  mediatedPasswordResetSearchSchema,
  type CredentialRecoveryVerificationMethod,
  type MediatedPasswordResetIssueInput,
  type MediatedPasswordResetMode,
  type MediatedPasswordResetTargetKind,
} from "../schemas/account-security-schemas";
import { createAccountRecoveryToken, hashAccountRecoveryToken } from "./account-recovery-token-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

export const MEDIATED_RESET_IN_PERSON_TTL_MS = 15 * 60 * 1000;
export const MEDIATED_RESET_ONLINE_TTL_MS = 24 * 60 * 60 * 1000;
export const MEDIATED_RESET_MAX_FAILED_IDENTITIES = 5;

export type MediatedPasswordResetDatabase = PrismaClient;

export type ReplacementIdentityProvider = (input: {
  userId: string;
  resetId: string;
  authSubject: string;
  newPassword: string;
}) => Promise<{ authSubject: string; providerLoginAlias: string }>;

export type MediatedPasswordResetDependencies = {
  database?: MediatedPasswordResetDatabase;
  now?: () => Date;
  createToken?: () => string;
  createReplacementIdentity?: ReplacementIdentityProvider;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  sendLineMessage?: (lineUserId: string, message: string, retryKey: string) => Promise<{ kind: string }>;
};

type ResetStorage = "WORKFORCE" | "PATIENT";

type ResetRecord = {
  storage: ResetStorage;
  id: string;
  userId: string;
  hospitalId: string;
  relationshipId: string | null;
  targetKind: MediatedPasswordResetTargetKind;
  issuerUserId: string;
  mode: MediatedPasswordResetMode;
  verificationMethod: CredentialRecoveryVerificationMethod;
  expiresAt: Date;
  claimedAt: Date | null;
  usedAt: Date | null;
  completedAt: Date | null;
  revokedAt: Date | null;
  failedVerificationCount: number;
  operationState: WorkforceActivationOperationState;
  reconciliationRequiredAt: Date | null;
  previousAuthSubject: string | null;
  replacementAuthSubject: string | null;
};

type TargetSnapshot = {
  userId: string;
  personId: string;
  authSubject: string | null;
  status: UserStatus;
  roles: { role: Role }[];
  memberships: { hospitalId: string; membershipType: MembershipType; status: MembershipStatus }[];
  osmHospitalRelationships: { hospitalId: string }[];
  patientProfileId: string | null;
  takeoverLock: {
    id: string;
    hospitalId: string;
    lockedAt: Date;
    providerState: UserTakeoverProviderState;
    suspendedMembershipIds: string[];
    suspendedOsmRelationshipIds: string[];
  } | null;
};

const targetUserSelect = {
  id: true,
  personId: true,
  authSubject: true,
  status: true,
  roles: { select: { role: true } },
  memberships: { select: { hospitalId: true, membershipType: true, status: true } },
  osmHospitalRelationships: { select: { hospitalId: true } },
  person: { select: { patientProfile: { select: { id: true } } } },
  takeoverLock: {
    select: {
      id: true,
      hospitalId: true,
      lockedAt: true,
      providerState: true,
      suspendedMembershipIds: true,
      suspendedOsmRelationshipIds: true,
    },
  },
} satisfies Prisma.UserSelect;

type TargetUserPayload = Prisma.UserGetPayload<{ select: typeof targetUserSelect }>;

function toTargetSnapshot(user: TargetUserPayload): TargetSnapshot {
  return {
    userId: user.id,
    personId: user.personId,
    authSubject: user.authSubject,
    status: user.status,
    roles: user.roles,
    memberships: user.memberships,
    osmHospitalRelationships: user.osmHospitalRelationships,
    patientProfileId: user.person.patientProfile?.id ?? null,
    takeoverLock: user.takeoverLock,
  };
}

async function locateTarget(
  transaction: Prisma.TransactionClient,
  input: Pick<MediatedPasswordResetIssueInput, "hospitalId" | "relationshipId" | "targetKind" | "targetUserId">,
): Promise<TargetSnapshot | null> {
  if (input.targetKind === "platform_admin") {
    if (!input.targetUserId || input.relationshipId !== null) return null;
    const user = await transaction.user.findUnique({ where: { id: input.targetUserId }, select: targetUserSelect });
    return user ? toTargetSnapshot(user) : null;
  }
  if (!input.relationshipId) return null;
  if (input.targetKind === "staff") {
    const relationship = await transaction.hospitalMembership.findFirst({
      where: { id: input.relationshipId, hospitalId: input.hospitalId },
      select: { user: { select: targetUserSelect } },
    });
    return relationship ? toTargetSnapshot(relationship.user) : null;
  }
  if (input.targetKind === "osm") {
    const relationship = await transaction.osmHospitalRelationship.findFirst({
      where: { id: input.relationshipId, hospitalId: input.hospitalId },
      select: { user: { select: targetUserSelect } },
    });
    return relationship ? toTargetSnapshot(relationship.user) : null;
  }

  const relationship = await transaction.patientHospitalRelationship.findFirst({
    where: { id: input.relationshipId, hospitalId: input.hospitalId },
    select: { patientProfile: { select: { person: { select: { user: { select: targetUserSelect } } } } } },
  });
  const user = relationship?.patientProfile.person.user;
  return user ? toTargetSnapshot(user) : null;
}

async function hasCaregiverAuthority(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
): Promise<boolean> {
  const patientProfileFilter = target.patientProfileId ? { patientProfileId: target.patientProfileId } : null;
  const patientProfilePersonFilter = target.patientProfileId
    ? { patientProfile: { personId: target.personId } }
    : null;
  const [relationship, grant] = await Promise.all([
    transaction.caregiverRelationship.findFirst({
      where: { OR: [{ caregiverUserId: target.userId }, ...(patientProfileFilter ? [patientProfileFilter] : [])] },
      select: { id: true },
    }),
    transaction.caregiverAppointmentGrant.findFirst({
      where: { OR: [{ caregiverUserId: target.userId }, ...(patientProfilePersonFilter ? [patientProfilePersonFilter] : [])] },
      select: { id: true },
    }),
  ]);
  return Boolean(relationship || grant);
}

async function isOwnerScopedTarget(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  hospitalId: string,
): Promise<boolean> {
  if (
    target.roles.some(({ role }) => role === Role.ADMIN) ||
    target.memberships.some(({ membershipType }) => membershipType === MembershipType.OWNER) ||
    await hasCaregiverAuthority(transaction, target)
  ) {
    return false;
  }

  const [patientRelationships, memberships, osmRelationships] = await Promise.all([
    target.patientProfileId
      ? transaction.patientHospitalRelationship.findMany({
          where: { patientProfileId: target.patientProfileId },
          select: { hospitalId: true },
        })
      : Promise.resolve([]),
    transaction.hospitalMembership.findMany({ where: { userId: target.userId }, select: { hospitalId: true } }),
    transaction.osmHospitalRelationship.findMany({ where: { userId: target.userId }, select: { hospitalId: true } }),
  ]);
  const allHospitals = new Set([
    ...memberships.map(({ hospitalId: id }) => id),
    ...osmRelationships.map(({ hospitalId: id }) => id),
    ...patientRelationships.map(({ hospitalId: id }) => id),
  ]);
  return allHospitals.size > 0 && allHospitals.size === 1 && allHospitals.has(hospitalId);
}

async function authorizeIssuerAndTarget(
  transaction: Prisma.TransactionClient,
  issuerUserId: string,
  input: Pick<MediatedPasswordResetIssueInput, "hospitalId" | "relationshipId" | "targetKind" | "targetUserId">,
  expectedTargetUserId?: string,
): Promise<{ target: TargetSnapshot; mode: "OWNER" | "ADMIN" }> {
  const [issuer, hospital, target] = await Promise.all([
    transaction.user.findUnique({
      where: { id: issuerUserId },
      select: {
        status: true,
        roles: { select: { role: true } },
        memberships: { select: { hospitalId: true, membershipType: true, status: true, hospital: { select: { status: true } } } },
      },
    }),
    transaction.hospital.findUnique({ where: { id: input.hospitalId }, select: { status: true } }),
    locateTarget(transaction, input),
  ]);
  if (!issuer || issuer.status !== UserStatus.ACTIVE) throw new ForbiddenError();
  if (!hospital || hospital.status !== HospitalStatus.ACTIVE || !target) throw new NotFoundError();
  if (target.userId === issuerUserId || (expectedTargetUserId && target.userId !== expectedTargetUserId)) {
    throw new ForbiddenError();
  }
  if (!target.authSubject) throw new ConflictError("The target does not have a password identity to replace");
  const hasActiveTakeoverLock = target.takeoverLock !== null && target.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED;
  if (target.status !== UserStatus.ACTIVE && !(target.status === UserStatus.SUSPENDED && hasActiveTakeoverLock)) {
    throw new ConflictError("The target account is not available for password reset");
  }

  const issuerRoles = issuer.roles.map(({ role }) => role);
  if (input.targetKind === "platform_admin") {
    if (!issuerRoles.includes(Role.ADMIN) || !target.roles.some(({ role }) => role === Role.ADMIN)) throw new ForbiddenError();
    return { target, mode: "ADMIN" };
  }
  if (issuerRoles.includes(Role.ADMIN)) return { target, mode: "ADMIN" };

  const ownerMembership = issuer.memberships.some(
    (membership) =>
      membership.hospitalId === input.hospitalId &&
      membership.membershipType === MembershipType.OWNER &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospital.status === HospitalStatus.ACTIVE,
  );
  if (!issuerRoles.includes(Role.HOSPITAL) || !ownerMembership) throw new ForbiddenError();

  const selectedMemberIsOwner = input.targetKind === "staff" && input.relationshipId !== null
    ? Boolean(await transaction.hospitalMembership.findFirst({
        where: { id: input.relationshipId, membershipType: MembershipType.OWNER },
        select: { id: true },
      }))
    : false;
  const ownerScoped = !selectedMemberIsOwner && await isOwnerScopedTarget(transaction, target, input.hospitalId);
  if (!ownerScoped) throw new ForbiddenError("A platform ADMIN must reset this account");
  return { target, mode: "OWNER" };
}

function modeForRecord(record: { storage: ResetStorage; mode: WorkforceActivationMode | AccountRecoveryDeliveryChannel }): MediatedPasswordResetMode {
  if (record.storage === "WORKFORCE") return record.mode === WorkforceActivationMode.ASSISTED ? "IN_PERSON" : "ONLINE";
  return record.mode === AccountRecoveryDeliveryChannel.ASSISTED ? "IN_PERSON" : "ONLINE";
}

type ResetUpdate = {
  failedVerificationCount?: number;
  revokedAt?: Date;
  claimedAt?: Date;
  usedAt?: Date;
  completedAt?: Date;
  operationState?: WorkforceActivationOperationState;
  reconciliationRequiredAt?: Date | null;
  previousAuthSubject?: string | null;
  replacementAuthSubject?: string | null;
};

async function updateReset(
  transaction: Prisma.TransactionClient,
  record: ResetRecord,
  data: ResetUpdate,
): Promise<number> {
  const { completedAt, usedAt, ...common } = data;
  if (record.storage === "WORKFORCE") {
    const result = await transaction.workforceActivation.updateMany({
      where: { id: record.id, purpose: WorkforceActivationPurpose.RESET },
      data: { ...common, usedAt },
    });
    return result.count;
  }
  const result = await transaction.accountRecovery.updateMany({
    where: { id: record.id },
    data: { ...common, completedAt: completedAt ?? usedAt },
  });
  return result.count;
}

async function findResetByToken(transaction: Prisma.TransactionClient, tokenHash: string): Promise<ResetRecord | null> {
  const [workforce, patient] = await Promise.all([
    transaction.workforceActivation.findFirst({
      where: { tokenHash, purpose: WorkforceActivationPurpose.RESET },
      select: {
        id: true, userId: true, hospitalId: true, relationshipId: true, relationshipKind: true,
        createdByUserId: true, mode: true, verificationMethod: true, expiresAt: true, claimedAt: true,
        usedAt: true, revokedAt: true, failedVerificationCount: true, operationState: true,
        reconciliationRequiredAt: true, previousAuthSubject: true, replacementAuthSubject: true,
      },
    }),
    transaction.accountRecovery.findUnique({
      where: { tokenHash },
      select: {
        id: true, targetUserId: true, patientHospitalRelationshipId: true, hospitalId: true, issuedByUserId: true,
        deliveryChannel: true, verificationMethod: true, expiresAt: true, claimedAt: true,
        completedAt: true, revokedAt: true, failedVerificationCount: true, operationState: true,
        reconciliationRequiredAt: true, previousAuthSubject: true, replacementAuthSubject: true,
      },
    }),
  ]);
  if (workforce && patient) throw new InfrastructureError("A recovery token is ambiguous");
  if (workforce?.hospitalId && workforce.relationshipKind && workforce.verificationMethod) {
    const targetKind = workforce.relationshipKind === "staff" || workforce.relationshipKind === "osm" || workforce.relationshipKind === "patient" || workforce.relationshipKind === "platform_admin" ? workforce.relationshipKind : null;
    if (!targetKind) throw new InfrastructureError("A workforce reset scope is invalid");
    return {
      storage: "WORKFORCE", id: workforce.id, userId: workforce.userId, hospitalId: workforce.hospitalId,
      relationshipId: workforce.relationshipId, targetKind, issuerUserId: workforce.createdByUserId,
      mode: modeForRecord({ storage: "WORKFORCE", mode: workforce.mode }), verificationMethod: workforce.verificationMethod,
      expiresAt: workforce.expiresAt, claimedAt: workforce.claimedAt, usedAt: workforce.usedAt,
      completedAt: null, revokedAt: workforce.revokedAt, failedVerificationCount: workforce.failedVerificationCount,
      operationState: workforce.operationState, reconciliationRequiredAt: workforce.reconciliationRequiredAt,
      previousAuthSubject: workforce.previousAuthSubject, replacementAuthSubject: workforce.replacementAuthSubject,
    };
  }
  if (patient?.verificationMethod && patient.hospitalId) {
    const relationship = await transaction.patientHospitalRelationship.findUnique({
      where: { id: patient.patientHospitalRelationshipId },
      select: { hospitalId: true },
    });
    if (!relationship || relationship.hospitalId !== patient.hospitalId) return null;
    return {
      storage: "PATIENT", id: patient.id, userId: patient.targetUserId, hospitalId: patient.hospitalId,
      relationshipId: patient.patientHospitalRelationshipId, targetKind: "patient", issuerUserId: patient.issuedByUserId,
      mode: modeForRecord({ storage: "PATIENT", mode: patient.deliveryChannel }), verificationMethod: patient.verificationMethod,
      expiresAt: patient.expiresAt, claimedAt: patient.claimedAt, usedAt: patient.completedAt,
      completedAt: patient.completedAt, revokedAt: patient.revokedAt, failedVerificationCount: patient.failedVerificationCount,
      operationState: patient.operationState, reconciliationRequiredAt: patient.reconciliationRequiredAt,
      previousAuthSubject: patient.previousAuthSubject, replacementAuthSubject: patient.replacementAuthSubject,
    };
  }
  return null;
}

function resetLocator(record: ResetRecord): Pick<MediatedPasswordResetIssueInput, "hospitalId" | "relationshipId" | "targetKind" | "targetUserId"> {
  return { hospitalId: record.hospitalId, relationshipId: record.relationshipId, targetKind: record.targetKind, targetUserId: record.userId };
}

function getDatabase(dependencies: MediatedPasswordResetDependencies): MediatedPasswordResetDatabase {
  return dependencies.database ?? getPrisma();
}

function currentTime(dependencies: MediatedPasswordResetDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function asApplicationError(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  throw new InfrastructureError("Mediated password reset could not be completed");
}

export async function issueMediatedPasswordReset(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<{ resetId: string; token: string; mode: MediatedPasswordResetMode; expiresAt: Date }> {
  if (!actor?.userId) throw new ForbiddenError();
  const parsed = mediatedPasswordResetIssueSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password reset data is invalid");
  const database = getDatabase(dependencies);
  const token = accountRecoveryTokenSchema.parse(dependencies.createToken?.() ?? createAccountRecoveryToken());
  const tokenHash = hashAccountRecoveryToken(token);
  const now = currentTime(dependencies);
  const ttl = parsed.data.mode === "IN_PERSON" ? MEDIATED_RESET_IN_PERSON_TTL_MS : MEDIATED_RESET_ONLINE_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl);

  try {
    const issued = await runSerializableTransaction(database, async (transaction) => {
      const { target, mode } = await authorizeIssuerAndTarget(transaction, actor.userId, parsed.data);
      await lockFirstCredentialOperation(transaction, target.userId);
      const [claimedWorkforce, claimedPatient] = await Promise.all([
        transaction.workforceActivation.findFirst({ where: { userId: target.userId, purpose: WorkforceActivationPurpose.RESET, claimedAt: { not: null }, usedAt: null, revokedAt: null }, select: { id: true } }),
        transaction.accountRecovery.findFirst({ where: { targetUserId: target.userId, claimedAt: { not: null }, completedAt: null, revokedAt: null }, select: { id: true } }),
      ]);
      if (claimedWorkforce || claimedPatient) throw new ConflictError("A password reset is already being reconciled");
      const previousResetWhere = { userId: target.userId, purpose: WorkforceActivationPurpose.RESET, claimedAt: null, usedAt: null, revokedAt: null };
      await transaction.workforceActivation.updateMany({ where: previousResetWhere, data: { revokedAt: now } });
      await transaction.accountRecovery.updateMany({
        where: { targetUserId: target.userId, claimedAt: null, completedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });

      const hasOtherAuthority = target.roles.some(({ role }) => role === Role.HOSPITAL || role === Role.OSM || role === Role.ADMIN);
      const patientOnly = parsed.data.targetKind === "patient" &&
        target.memberships.length === 0 &&
        target.osmHospitalRelationships.length === 0 &&
        !hasOtherAuthority;
      let resetId: string;
      if (patientOnly) {
        if (!parsed.data.relationshipId) throw new ValidationError("The patient Hospital relationship is required");
        const reset = await transaction.accountRecovery.create({
          data: {
            targetUserId: target.userId,
            patientHospitalRelationshipId: parsed.data.relationshipId,
            hospitalId: parsed.data.hospitalId,
            issuedByUserId: actor.userId,
            tokenHash,
            deliveryChannel: parsed.data.mode === "IN_PERSON" ? AccountRecoveryDeliveryChannel.ASSISTED : AccountRecoveryDeliveryChannel.ONLINE,
            verificationMethod: parsed.data.verificationMethod,
            expiresAt,
          },
          select: { id: true },
        });
        resetId = reset.id;
      } else {
        const reset = await transaction.workforceActivation.create({
          data: {
            userId: target.userId,
            hospitalId: parsed.data.hospitalId,
            relationshipId: parsed.data.relationshipId,
            relationshipKind: parsed.data.targetKind,
            createdByUserId: actor.userId,
            tokenHash,
            mode: parsed.data.mode === "IN_PERSON" ? WorkforceActivationMode.ASSISTED : WorkforceActivationMode.REMOTE,
            purpose: WorkforceActivationPurpose.RESET,
            verificationMethod: parsed.data.verificationMethod,
            expiresAt,
          },
          select: { id: true },
        });
        resetId = reset.id;
      }
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "account.password_reset.issued",
        resourceType: "User",
        resourceId: target.userId,
        metadata: {
          hospitalId: parsed.data.hospitalId,
          mode: parsed.data.mode,
          verificationMethod: parsed.data.verificationMethod,
          outcome: "ISSUED",
        },
      }, transaction);
      return { resetId, mode };
    });
    return { resetId: issued.resetId, token, mode: parsed.data.mode, expiresAt };
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

export async function getMediatedPasswordResetAvailability(
  token: unknown,
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<{ expiresAt: Date; mode: MediatedPasswordResetMode }> {
  const parsed = accountRecoveryTokenSchema.safeParse(token);
  if (!parsed.success) throw new NotFoundError();
  const database = getDatabase(dependencies);
  const record = await database.$transaction((transaction) => findResetByToken(transaction, hashAccountRecoveryToken(parsed.data)));
  if (!record || record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= currentTime(dependencies)) {
    throw new NotFoundError();
  }
  return { expiresAt: record.expiresAt, mode: record.mode };
}

async function markReconciliationRequired(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  now: Date,
): Promise<void> {
  try {
    await database.$transaction(async (transaction) => {
      await updateReset(transaction, record, {
        operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
        reconciliationRequiredAt: now,
      });
    });
  } catch {
    // A committed claim is already an access quarantine; this marker adds operator-visible provider state.
  }
}

async function verifyIdentityAndClaim(
  database: MediatedPasswordResetDatabase,
  token: string,
  nationalId: string,
  now: Date,
): Promise<{ record: ResetRecord; previousAuthSubject: string }> {
  const tokenHash = hashAccountRecoveryToken(token);
  const outcome = await runSerializableTransaction(database, async (transaction) => {
    const record = await findResetByToken(transaction, tokenHash);
    if (!record || record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= now) throw new NotFoundError();
    await lockFirstCredentialOperation(transaction, record.userId);
    const refreshed = await findResetByToken(transaction, tokenHash);
    if (!refreshed || refreshed.claimedAt || refreshed.usedAt || refreshed.revokedAt || refreshed.expiresAt <= now) {
      throw new ConflictError("This reset link is no longer available");
    }
    const user = await transaction.user.findUnique({ where: { id: refreshed.userId }, select: { personId: true, authSubject: true } });
    if (!user?.authSubject) throw new ConflictError("The target credential changed");
    const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId });
    const person = await transaction.person.findUnique({ where: { identityKeyHash }, select: { id: true } });
    if (!person || person.id !== user.personId) {
      const failedVerificationCount = refreshed.failedVerificationCount + 1;
      const revoked = failedVerificationCount >= MEDIATED_RESET_MAX_FAILED_IDENTITIES;
      await updateReset(transaction, refreshed, {
        failedVerificationCount,
        ...(revoked ? { revokedAt: now } : {}),
      });
      await recordAuditEvent({
        actorUserId: refreshed.issuerUserId,
        action: "account.password_reset.identity_check",
        resourceType: "User",
        resourceId: refreshed.userId,
        metadata: {
          mode: refreshed.mode,
          verificationMethod: refreshed.verificationMethod,
          outcome: revoked ? "REVOKED_ID_FAILURE_LIMIT" : "IDENTITY_MISMATCH",
          failureCount: failedVerificationCount,
        },
      }, transaction);
      return { kind: "WRONG_ID" as const };
    }

    const authorization = await authorizeIssuerAndTarget(transaction, refreshed.issuerUserId, resetLocator(refreshed), refreshed.userId);
    if (authorization.mode !== "ADMIN" && authorization.target.userId !== refreshed.userId) throw new ForbiddenError();
    const claimedAt = now;
    const updated = await updateReset(transaction, refreshed, {
      claimedAt,
      operationState: WorkforceActivationOperationState.CLAIMED,
      previousAuthSubject: user.authSubject,
    });
    if (updated !== 1) throw new ConflictError("This reset link was already used");
    return { kind: "CLAIMED" as const, record: { ...refreshed, claimedAt, operationState: WorkforceActivationOperationState.CLAIMED, previousAuthSubject: user.authSubject }, previousAuthSubject: user.authSubject };
  });
  if (outcome.kind === "WRONG_ID") throw new ForbiddenError("The identity could not be confirmed");
  return outcome;
}

async function markProviderStarted(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    const count = await updateReset(transaction, record, { operationState: WorkforceActivationOperationState.PROVIDER_STARTED });
    if (count !== 1) throw new ConflictError("The reset operation changed");
  });
}

async function restoreTakeoverRelationships(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  issuerUserId: string,
  now: Date,
): Promise<void> {
  const lock = target.takeoverLock;
  if (!lock || lock.providerState === UserTakeoverProviderState.RESOLVED) return;

  await unlinkLineBindingForSuspectedTakeover(transaction, {
    userId: target.userId,
    actorUserId: issuerUserId,
    hospitalId: lock.hospitalId,
    credentialEstablishedAt: lock.lockedAt,
    now,
  });

  let membershipIds = lock.suspendedMembershipIds;
  let osmIds = lock.suspendedOsmRelationshipIds;
  if (membershipIds.length === 0 && osmIds.length === 0) {
    const latestLockAudit = await transaction.auditEvent.findFirst({
      where: { resourceType: "User", resourceId: target.userId, action: "user.takeover_locked" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const expectedCount =
      latestLockAudit?.metadata && typeof latestLockAudit.metadata === "object" && !Array.isArray(latestLockAudit.metadata) &&
      typeof latestLockAudit.metadata.relationshipsSuspended === "number"
        ? latestLockAudit.metadata.relationshipsSuspended
        : null;
    if (expectedCount === null) throw new ConflictError("The suspended relationship snapshot is unavailable");
    const [memberships, osmRelationships] = await Promise.all([
      transaction.hospitalMembership.findMany({ where: { userId: target.userId, hospitalId: lock.hospitalId, membershipType: MembershipType.MEMBER, status: MembershipStatus.SUSPENDED }, select: { id: true } }),
      transaction.osmHospitalRelationship.findMany({ where: { userId: target.userId, hospitalId: lock.hospitalId, status: MembershipStatus.SUSPENDED }, select: { id: true } }),
    ]);
    if (memberships.length + osmRelationships.length !== expectedCount) {
      throw new ConflictError("The suspended relationship snapshot requires reconciliation");
    }
    membershipIds = memberships.map(({ id }) => id);
    osmIds = osmRelationships.map(({ id }) => id);
  }

  const [memberships, osmRelationships] = await Promise.all([
    transaction.hospitalMembership.updateMany({ where: { id: { in: membershipIds }, userId: target.userId, hospitalId: lock.hospitalId, status: MembershipStatus.SUSPENDED }, data: { status: MembershipStatus.ACTIVE } }),
    transaction.osmHospitalRelationship.updateMany({ where: { id: { in: osmIds }, userId: target.userId, hospitalId: lock.hospitalId, status: MembershipStatus.SUSPENDED }, data: { status: MembershipStatus.ACTIVE } }),
  ]);
  if (memberships.count !== membershipIds.length || osmRelationships.count !== osmIds.length) {
    throw new ConflictError("The suspended relationships changed during account recovery");
  }
  await transaction.userTakeoverLock.update({
    where: { id: lock.id },
    data: { providerState: UserTakeoverProviderState.RESOLVED, providerCheckedAt: now },
  });
  await recordAuditEvent({
    actorUserId: issuerUserId,
    action: "user.takeover_lock_resolved",
    resourceType: "User",
    resourceId: target.userId,
    metadata: { hospitalId: lock.hospitalId, membershipsRestored: memberships.count, osmRelationshipsRestored: osmRelationships.count },
  }, transaction);
}

async function switchCanonicalIdentity(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  replacement: { authSubject: string; providerLoginAlias: string },
  now: Date,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockFirstCredentialOperation(transaction, record.userId);
    const { target } = await authorizeIssuerAndTarget(transaction, record.issuerUserId, resetLocator(record), record.userId);
    if (!record.previousAuthSubject || target.authSubject !== record.previousAuthSubject) {
      throw new ConflictError("The target credential changed during reset");
    }
    const count = await updateReset(transaction, record, {
      operationState: WorkforceActivationOperationState.PROVIDER_CONFIRMED,
      replacementAuthSubject: replacement.authSubject,
    });
    if (count !== 1) throw new ConflictError("The reset operation changed");
    const updatedUser = await transaction.user.updateMany({
      where: { id: record.userId, authSubject: record.previousAuthSubject },
      data: { authSubject: replacement.authSubject, providerLoginAlias: replacement.providerLoginAlias, status: UserStatus.ACTIVE },
    });
    if (updatedUser.count !== 1) throw new ConflictError("The target credential changed during reset");
    await restoreTakeoverRelationships(transaction, target, record.issuerUserId, now);
  });
}

async function finalizeReset(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  now: Date,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockFirstCredentialOperation(transaction, record.userId);
    const { target } = await authorizeIssuerAndTarget(transaction, record.issuerUserId, resetLocator(record), record.userId);
    if (target.status !== UserStatus.ACTIVE || !target.authSubject) throw new ConflictError("The target account did not become active");
    const completed = await updateReset(transaction, record, {
      ...(record.storage === "WORKFORCE" ? { usedAt: now } : { completedAt: now }),
      operationState: WorkforceActivationOperationState.FINALIZED,
      reconciliationRequiredAt: null,
      previousAuthSubject: null,
      replacementAuthSubject: null,
    });
    if (completed !== 1) throw new ConflictError("The reset operation changed");
    await recordAuditEvent({
      actorUserId: record.issuerUserId,
      action: "account.password_reset.completed",
      resourceType: "User",
      resourceId: record.userId,
      metadata: {
        hospitalId: record.hospitalId,
        mode: record.mode,
        verificationMethod: record.verificationMethod,
        outcome: "COMPLETED",
      },
    }, transaction);
  });
}

async function notifyLineBinding(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  now: Date,
  dependencies: MediatedPasswordResetDependencies,
): Promise<void> {
  const bindings = await database.lineAccountBinding.findMany({
    where: { userId: record.userId, unlinkedAt: null, lineUserId: { not: null } },
    select: { id: true, lineUserId: true },
  });
  if (bindings.length === 0) return;
  const message = `รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now)} หากไม่ใช่คุณ ติดต่อโรงพยาบาล`;
  const send = dependencies.sendLineMessage ?? ((lineUserId: string, text: string, retryKey: string) => new LineMessagingClient().pushText(lineUserId, text, retryKey));
  for (const binding of bindings) {
    if (!binding.lineUserId) continue;
    const result = await send(binding.lineUserId, message, randomUUID()).catch(() => ({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" }));
    try {
      await recordAuditEvent({
        actorUserId: record.issuerUserId,
        action: "account.password_reset.line_notification",
        resourceType: "User",
        resourceId: record.userId,
        metadata: { outcome: result.kind },
      });
    } catch {
      console.error("Password reset succeeded but LINE notification audit could not be stored");
    }
  }
}

export async function completeMediatedPasswordReset(
  input: unknown,
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<void> {
  const parsed = mediatedPasswordResetCompletionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password reset completion data is invalid");
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  let claimed: { record: ResetRecord; previousAuthSubject: string };
  try {
    claimed = await verifyIdentityAndClaim(database, parsed.data.token, parsed.data.nationalId, now);
  } catch (error: unknown) {
    return asApplicationError(error);
  }

  let replacement: { authSubject: string; providerLoginAlias: string };
  try {
    await markProviderStarted(database, claimed.record);
    const replace = dependencies.createReplacementIdentity ?? replacePasswordAndRevokeRecoverySessions;
    replacement = await replace({
      userId: claimed.record.userId,
      resetId: claimed.record.id,
      authSubject: claimed.previousAuthSubject,
      newPassword: parsed.data.newPassword,
    });
    await database.$transaction(async (transaction) => {
      const count = await updateReset(transaction, claimed.record, {
        operationState: WorkforceActivationOperationState.PROVIDER_CONFIRMED,
        replacementAuthSubject: replacement.authSubject,
      });
      if (count !== 1) throw new ConflictError("The reset operation changed");
    });
    await switchCanonicalIdentity(database, claimed.record, replacement, currentTime(dependencies));
    const deleteOldIdentity = dependencies.deleteProviderIdentity ?? deleteReplacedProviderIdentity;
    await deleteOldIdentity(claimed.previousAuthSubject);
    await finalizeReset(database, claimed.record, currentTime(dependencies));
  } catch (error: unknown) {
    await markReconciliationRequired(database, claimed.record, currentTime(dependencies));
    return asApplicationError(error);
  }

  await notifyLineBinding(database, claimed.record, currentTime(dependencies), dependencies);
}

export type MediatedPasswordResetCandidate = {
  userId: string;
  displayName: string;
  targetKind: MediatedPasswordResetTargetKind;
  hospitalId: string;
  hospitalName: string;
  relationshipId: string | null;
  relationshipStatus: string;
};

export async function searchMediatedPasswordResetTargets(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: MediatedPasswordResetDatabase = getPrisma(),
): Promise<MediatedPasswordResetCandidate[]> {
  if (!actor?.userId) throw new ForbiddenError();
  const parsed = mediatedPasswordResetSearchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("National ID lookup data is invalid");
  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.nationalId });
  try {
    return await runSerializableTransaction(database, async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      const person = await transaction.person.findUnique({
        where: { identityKeyHash },
        select: {
          user: { select: {
            id: true,
            status: true,
            authSubject: true,
            roles: { select: { role: true } },
            person: { select: { givenName: true, familyName: true } },
            takeoverLock: { select: { providerState: true } },
          } },
          patientProfile: { select: { id: true } },
        },
      });
      const user = person?.user;
      const result: MediatedPasswordResetCandidate[] = [];
      const takeoverLocked = Boolean(user?.takeoverLock && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED);
      const resetEligibleStatus = user?.status === UserStatus.ACTIVE || (user?.status === UserStatus.SUSPENDED && takeoverLocked);
      if (user?.authSubject && user.id !== actor.userId && resetEligibleStatus) {
        const [memberships, osmRelationships, patientRelationships] = await Promise.all([
          transaction.hospitalMembership.findMany({ where: { userId: user.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, status: true, hospital: { select: { name: true } } } }),
          transaction.osmHospitalRelationship.findMany({ where: { userId: user.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, status: true, hospital: { select: { name: true } } } }),
          person?.patientProfile
            ? transaction.patientHospitalRelationship.findMany({ where: { patientProfileId: person.patientProfile.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, endedAt: true, hospital: { select: { name: true } } } })
            : Promise.resolve([]),
        ]);
        const displayName = `${user.person.givenName ?? ""} ${user.person.familyName ?? ""}`.trim() || "ไม่พบชื่อผู้ใช้";
        result.push(...memberships.map((row) => ({ userId: user.id, displayName, targetKind: "staff" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.status })));
        result.push(...osmRelationships.map((row) => ({ userId: user.id, displayName, targetKind: "osm" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.status })));
        result.push(...patientRelationships.map((row) => ({ userId: user.id, displayName, targetKind: "patient" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.endedAt ? "ENDED" : "ACTIVE" })));
        if (user.roles.some(({ role }) => role === Role.ADMIN)) {
          const activeHospitals = await transaction.hospital.findMany({ where: { status: HospitalStatus.ACTIVE }, select: { id: true, name: true } });
          result.push(...activeHospitals.map((hospital) => ({
            userId: user.id,
            displayName,
            targetKind: "platform_admin" as const,
            hospitalId: hospital.id,
            hospitalName: hospital.name,
            relationshipId: null,
            relationshipStatus: "PLATFORM_ADMIN",
          })));
        }
      }
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "account.password_reset.admin_search",
        resourceType: "IdentityLookup",
        metadata: { outcome: result.length > 0 ? "MATCH" : "NO_MATCH", candidateCount: result.length },
      }, transaction);
      return result;
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

export async function getMediatedPasswordResetEligibility(
  actor: ActorContext,
  input: Pick<MediatedPasswordResetIssueInput, "hospitalId" | "relationshipId" | "targetKind">,
  database: MediatedPasswordResetDatabase = getPrisma(),
): Promise<"OWNER_ELIGIBLE" | "ADMIN_ALLOWED" | "ADMIN_REQUIRED"> {
  try {
    return await database.$transaction(async (transaction) => {
      const authorization = await authorizeIssuerAndTarget(transaction, actor.userId, input);
      return authorization.mode === "ADMIN" ? "ADMIN_ALLOWED" : "OWNER_ELIGIBLE";
    });
  } catch {
    return "ADMIN_REQUIRED";
  }
}
