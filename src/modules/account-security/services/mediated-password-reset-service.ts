import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  AccountRecoveryDeliveryChannel,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  ProviderIdentityCleanupReason,
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
import { unreconciledAccountRecoveryWhere, unreconciledWorkforceResetWhere } from "@/modules/auth/services/credential-recovery-state";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import {
  deleteReplacedProviderIdentity,
  findProviderIdentityByLoginAlias,
  ProviderIdentityRejectedError,
  providerIdentityExists,
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

export type MediatedPasswordResetReconcileDependencies = Pick<MediatedPasswordResetDependencies, "database" | "now" | "deleteProviderIdentity"> & {
  findProviderIdentityByLoginAlias?: (providerLoginAlias: string) => Promise<{ authSubject: string } | null>;
  providerIdentityExists?: (authSubject: string) => Promise<boolean>;
};

/** Pending provider cleanups retried per reset or ADMIN action; each attempt is one provider call. */
const PROVIDER_IDENTITY_CLEANUP_RETRY_LIMIT = 5;

/** The issuer or target lost eligibility after the claim, so the reset is revoked instead of quarantined. */
class ResetAuthorizationLostError extends Error {
  constructor() {
    super("Mediated password reset authorization was lost");
    this.name = "ResetAuthorizationLostError";
  }
}

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

/** Only acting as someone's caregiver needs ADMIN; a patient who has caregivers stays in OWNER scope. */
async function actsAsCaregiver(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
): Promise<boolean> {
  const [relationship, grant] = await Promise.all([
    transaction.caregiverRelationship.findFirst({ where: { caregiverUserId: target.userId }, select: { id: true } }),
    transaction.caregiverAppointmentGrant.findFirst({ where: { caregiverUserId: target.userId }, select: { id: true } }),
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
    await actsAsCaregiver(transaction, target)
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
  claimedAt?: Date | null;
  usedAt?: Date;
  completedAt?: Date;
  operationState?: WorkforceActivationOperationState;
  reconciliationRequiredAt?: Date | null;
  previousAuthSubject?: string | null;
  replacementAuthSubject?: string | null;
};

/** `whileClaimed` only matches a claimed, unfinished reset: exactly the access-quarantining state. */
async function updateReset(
  transaction: Prisma.TransactionClient,
  record: ResetRecord,
  data: ResetUpdate,
  whileClaimed = false,
): Promise<number> {
  const { completedAt, usedAt, ...common } = data;
  if (record.storage === "WORKFORCE") {
    const result = await transaction.workforceActivation.updateMany({
      where: { id: record.id, purpose: WorkforceActivationPurpose.RESET, ...(whileClaimed ? unreconciledWorkforceResetWhere : {}) },
      data: { ...common, usedAt },
    });
    return result.count;
  }
  const result = await transaction.accountRecovery.updateMany({
    where: { id: record.id, ...(whileClaimed ? unreconciledAccountRecoveryWhere : {}) },
    data: { ...common, completedAt: completedAt ?? usedAt },
  });
  return result.count;
}

function findResetByToken(transaction: Prisma.TransactionClient, tokenHash: string): Promise<ResetRecord | null> {
  return findReset(transaction, { tokenHash });
}

async function findReset(transaction: Prisma.TransactionClient, where: { tokenHash: string } | { id: string }): Promise<ResetRecord | null> {
  const [workforce, patient] = await Promise.all([
    transaction.workforceActivation.findFirst({
      where: { ...where, purpose: WorkforceActivationPurpose.RESET },
      select: {
        id: true, userId: true, hospitalId: true, relationshipId: true, relationshipKind: true,
        createdByUserId: true, mode: true, verificationMethod: true, expiresAt: true, claimedAt: true,
        usedAt: true, revokedAt: true, failedVerificationCount: true, operationState: true,
        reconciliationRequiredAt: true, previousAuthSubject: true, replacementAuthSubject: true,
      },
    }),
    transaction.accountRecovery.findFirst({
      where,
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
    await retryPendingProviderIdentityCleanups(database, dependencies, now);
    return { resetId: issued.resetId, token, mode: parsed.data.mode, expiresAt };
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

/**
 * Compensation for an in-person handoff whose issuer session could not be closed. Only the issuer can revoke, and only
 * a reset nobody has claimed yet.
 */
export async function revokeIssuedMediatedPasswordReset(
  actor: ActorContext | null | undefined,
  input: { resetId: string },
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<void> {
  if (!actor?.userId) throw new ForbiddenError();
  const resetId = z.uuid().safeParse(input.resetId);
  if (!resetId.success) throw new ValidationError("Password reset revocation data is invalid");
  const now = currentTime(dependencies);
  try {
    await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const record = await findReset(transaction, { id: resetId.data });
      if (!record || record.issuerUserId !== actor.userId) throw new ForbiddenError();
      if (record.usedAt || record.revokedAt) return;
      if (record.claimedAt) throw new ConflictError("The reset is already being used");
      await updateReset(transaction, record, { revokedAt: now });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "account.password_reset.revoked",
        resourceType: "User",
        resourceId: record.userId,
        metadata: { hospitalId: record.hospitalId, mode: record.mode, outcome: "HANDOFF_FAILED" },
      }, transaction);
    });
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
      }, true);
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
        actorUserId: null,
        action: "account.password_reset.identity_check",
        resourceType: "User",
        resourceId: refreshed.userId,
        metadata: {
          issuerUserId: refreshed.issuerUserId,
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
    actorUserId: null,
    issuerUserId,
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
    actorUserId: null,
    action: "user.takeover_lock_resolved",
    resourceType: "User",
    resourceId: target.userId,
    metadata: { issuerUserId, hospitalId: lock.hospitalId, membershipsRestored: memberships.count, osmRelationshipsRestored: osmRelationships.count },
  }, transaction);
}

function isAuthorizationLoss(error: unknown): boolean {
  return error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof ConflictError;
}

function completionUpdate(record: ResetRecord, now: Date): ResetUpdate {
  return {
    ...(record.storage === "WORKFORCE" ? { usedAt: now } : { completedAt: now }),
    operationState: WorkforceActivationOperationState.FINALIZED,
    reconciliationRequiredAt: null,
    previousAuthSubject: null,
    replacementAuthSubject: null,
  };
}

function rollbackUpdate(revokedAt?: Date): ResetUpdate {
  return {
    claimedAt: null,
    operationState: WorkforceActivationOperationState.NOT_STARTED,
    reconciliationRequiredAt: null,
    previousAuthSubject: null,
    replacementAuthSubject: null,
    ...(revokedAt ? { revokedAt } : {}),
  };
}

async function recordProviderIdentityCleanup(
  transaction: Prisma.TransactionClient,
  input: { authSubject: string; userId: string; reason: ProviderIdentityCleanupReason },
): Promise<string> {
  const cleanup = await transaction.providerIdentityCleanup.upsert({
    where: { authSubject: input.authSubject },
    create: input,
    update: {},
    select: { id: true },
  });
  return cleanup.id;
}

/** One idempotent delete attempt; a subject that a User still maps to is never deleted. */
async function attemptProviderIdentityCleanup(
  database: MediatedPasswordResetDatabase,
  cleanupId: string,
  dependencies: Pick<MediatedPasswordResetDependencies, "deleteProviderIdentity">,
  now: Date,
): Promise<boolean> {
  const cleanup = await database.providerIdentityCleanup.findUnique({ where: { id: cleanupId }, select: { authSubject: true, completedAt: true } });
  if (!cleanup) return false;
  if (cleanup.completedAt) return true;
  if (await database.user.findFirst({ where: { authSubject: cleanup.authSubject }, select: { id: true } })) return false;
  const deleteIdentity = dependencies.deleteProviderIdentity ?? deleteReplacedProviderIdentity;
  const deleted = await deleteIdentity(cleanup.authSubject).then(() => true, () => false);
  await database.providerIdentityCleanup.updateMany({
    where: { id: cleanupId, completedAt: null },
    data: { attemptCount: { increment: 1 }, lastAttemptAt: now, ...(deleted ? { completedAt: now } : {}) },
  });
  return deleted;
}

async function retryPendingProviderIdentityCleanups(
  database: MediatedPasswordResetDatabase,
  dependencies: Pick<MediatedPasswordResetDependencies, "deleteProviderIdentity">,
  now: Date,
): Promise<void> {
  try {
    const pending = await database.providerIdentityCleanup.findMany({
      where: { completedAt: null },
      orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: PROVIDER_IDENTITY_CLEANUP_RETRY_LIMIT,
      select: { id: true },
    });
    for (const { id } of pending) await attemptProviderIdentityCleanup(database, id, dependencies, now);
  } catch {
    console.error("Pending provider identity cleanup could not be retried");
  }
}

/**
 * Re-authorizes, switches the canonical identity and finalizes the reset in one transaction, then records the old
 * identity for deletion. Returns that cleanup marker; deleting it is no longer on the user's critical path.
 */
async function switchIdentityAndFinalize(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  replacement: { authSubject: string; providerLoginAlias: string },
  now: Date,
): Promise<string> {
  return runSerializableTransaction(database, async (transaction) => {
    await lockFirstCredentialOperation(transaction, record.userId);
    let target: TargetSnapshot;
    try {
      ({ target } = await authorizeIssuerAndTarget(transaction, record.issuerUserId, resetLocator(record), record.userId));
    } catch (error: unknown) {
      if (isAuthorizationLoss(error)) throw new ResetAuthorizationLostError();
      throw error;
    }
    if (!record.previousAuthSubject || target.authSubject !== record.previousAuthSubject) {
      throw new ConflictError("The target credential changed during reset");
    }
    const updatedUser = await transaction.user.updateMany({
      where: { id: record.userId, authSubject: record.previousAuthSubject },
      data: {
        authSubject: replacement.authSubject,
        providerLoginAlias: replacement.providerLoginAlias,
        status: UserStatus.ACTIVE,
        identityAssurance: "HOSPITAL_PROOFED",
      },
    });
    if (updatedUser.count !== 1) throw new ConflictError("The target credential changed during reset");
    await restoreTakeoverRelationships(transaction, target, record.issuerUserId, now);
    const completed = await updateReset(transaction, record, completionUpdate(record, now), true);
    if (completed !== 1) throw new ConflictError("The reset operation changed");
    const cleanupId = await recordProviderIdentityCleanup(transaction, {
      authSubject: record.previousAuthSubject,
      userId: record.userId,
      reason: ProviderIdentityCleanupReason.PREVIOUS_IDENTITY,
    });
    await recordAuditEvent({
      actorUserId: null,
      action: "account.password_reset.completed",
      resourceType: "User",
      resourceId: record.userId,
      metadata: {
        issuerUserId: record.issuerUserId,
        hospitalId: record.hospitalId,
        mode: record.mode,
        verificationMethod: record.verificationMethod,
        outcome: "COMPLETED",
      },
    }, transaction);
    return cleanupId;
  });
}

/** A definite provider rejection created no identity: release the claim so the same link can be retried. */
async function rollBackClaim(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  reason: ProviderIdentityRejectedError["reason"],
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await lockFirstCredentialOperation(transaction, record.userId);
    const count = await updateReset(transaction, record, rollbackUpdate(), true);
    if (count !== 1) throw new ConflictError("The reset operation changed");
    await recordAuditEvent({
      actorUserId: null,
      action: "account.password_reset.claim_rolled_back",
      resourceType: "User",
      resourceId: record.userId,
      metadata: { issuerUserId: record.issuerUserId, hospitalId: record.hospitalId, mode: record.mode, outcome: reason },
    }, transaction);
  });
}

/** Authorization was lost before the switch: the old identity is still canonical, so revoke and drop the replacement. */
async function revokeAfterAuthorizationLoss(
  database: MediatedPasswordResetDatabase,
  record: ResetRecord,
  replacementAuthSubject: string,
  now: Date,
): Promise<string> {
  return runSerializableTransaction(database, async (transaction) => {
    await lockFirstCredentialOperation(transaction, record.userId);
    const user = await transaction.user.findUnique({ where: { id: record.userId }, select: { authSubject: true } });
    if (!user || user.authSubject === replacementAuthSubject) throw new ConflictError("The target credential changed during reset");
    const count = await updateReset(transaction, record, rollbackUpdate(now), true);
    if (count !== 1) throw new ConflictError("The reset operation changed");
    const cleanupId = await recordProviderIdentityCleanup(transaction, {
      authSubject: replacementAuthSubject,
      userId: record.userId,
      reason: ProviderIdentityCleanupReason.ORPHAN_REPLACEMENT,
    });
    await recordAuditEvent({
      actorUserId: null,
      action: "account.password_reset.revoked",
      resourceType: "User",
      resourceId: record.userId,
      metadata: { issuerUserId: record.issuerUserId, hospitalId: record.hospitalId, mode: record.mode, outcome: "AUTHORIZATION_LOST" },
    }, transaction);
    return cleanupId;
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
        actorUserId: null,
        action: "account.password_reset.line_notification",
        resourceType: "User",
        resourceId: record.userId,
        metadata: { issuerUserId: record.issuerUserId, outcome: result.kind },
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

  let cleanupId: string;
  // A settled failure already left the reset in a definite, non-quarantining state.
  let settled = false;
  try {
    await markProviderStarted(database, claimed.record);
    const replace = dependencies.createReplacementIdentity ?? replacePasswordAndRevokeRecoverySessions;
    let confirmed: { authSubject: string; providerLoginAlias: string };
    try {
      confirmed = await replace({
        userId: claimed.record.userId,
        resetId: claimed.record.id,
        authSubject: claimed.previousAuthSubject,
        newPassword: parsed.data.newPassword,
      });
    } catch (error: unknown) {
      if (!(error instanceof ProviderIdentityRejectedError)) throw error;
      await rollBackClaim(database, claimed.record, error.reason);
      settled = true;
      throw error;
    }
    await database.$transaction(async (transaction) => {
      const count = await updateReset(transaction, claimed.record, {
        operationState: WorkforceActivationOperationState.PROVIDER_CONFIRMED,
        replacementAuthSubject: confirmed.authSubject,
      });
      if (count !== 1) throw new ConflictError("The reset operation changed");
    });
    try {
      cleanupId = await switchIdentityAndFinalize(database, claimed.record, confirmed, currentTime(dependencies));
    } catch (error: unknown) {
      if (!(error instanceof ResetAuthorizationLostError)) throw error;
      const orphanId = await revokeAfterAuthorizationLoss(database, claimed.record, confirmed.authSubject, currentTime(dependencies));
      settled = true;
      await attemptProviderIdentityCleanup(database, orphanId, dependencies, currentTime(dependencies)).catch(() => false);
      throw new ForbiddenError("The password reset is no longer authorized");
    }
  } catch (error: unknown) {
    if (!settled) {
      await markReconciliationRequired(database, claimed.record, currentTime(dependencies));
    }
    return asApplicationError(error);
  }

  const cleaned = await attemptProviderIdentityCleanup(database, cleanupId, dependencies, currentTime(dependencies)).catch(() => false);
  if (!cleaned) {
    try {
      await recordAuditEvent({
        actorUserId: null,
        action: "account.password_reset.previous_identity_cleanup_pending",
        resourceType: "User",
        resourceId: claimed.record.userId,
        metadata: { issuerUserId: claimed.record.issuerUserId, hospitalId: claimed.record.hospitalId, outcome: "CLEANUP_PENDING" },
      });
    } catch {
      console.error("Password reset succeeded but the pending identity cleanup audit could not be stored");
    }
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

export type QuarantinedMediatedPasswordReset = {
  resetId: string;
  userId: string;
  displayName: string;
  hospitalId: string;
  hospitalName: string;
  mode: MediatedPasswordResetMode;
  claimedAt: Date;
  operationState: WorkforceActivationOperationState;
};

function displayNameOf(person: { givenName: string | null; familyName: string | null }): string {
  return `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || "ไม่พบชื่อผู้ใช้";
}

/** Mediated resets that quarantine their target until an ADMIN reconciles the provider outcome. */
export async function listQuarantinedMediatedPasswordResets(
  actor: ActorContext | null | undefined,
  database: MediatedPasswordResetDatabase = getPrisma(),
): Promise<QuarantinedMediatedPasswordReset[]> {
  if (!actor?.userId) throw new ForbiddenError();
  try {
    return await runSerializableTransaction(database, async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      const person = { select: { givenName: true, familyName: true } } as const;
      const [workforce, patient] = await Promise.all([
        transaction.workforceActivation.findMany({
          where: { ...unreconciledWorkforceResetWhere, verificationMethod: { not: null }, hospitalId: { not: null } },
          orderBy: { claimedAt: "asc" },
          select: { id: true, userId: true, hospitalId: true, mode: true, claimedAt: true, operationState: true, user: { select: { person } }, hospital: { select: { name: true } } },
        }),
        transaction.accountRecovery.findMany({
          where: { ...unreconciledAccountRecoveryWhere, verificationMethod: { not: null }, hospitalId: { not: null } },
          orderBy: { claimedAt: "asc" },
          select: { id: true, targetUserId: true, hospitalId: true, deliveryChannel: true, claimedAt: true, operationState: true, targetUser: { select: { person } }, hospital: { select: { name: true } } },
        }),
      ]);
      const rows: QuarantinedMediatedPasswordReset[] = [];
      for (const row of workforce) {
        if (!row.hospitalId || !row.claimedAt || !row.hospital) continue;
        rows.push({
          resetId: row.id, userId: row.userId, displayName: displayNameOf(row.user.person), hospitalId: row.hospitalId,
          hospitalName: row.hospital.name, mode: modeForRecord({ storage: "WORKFORCE", mode: row.mode }),
          claimedAt: row.claimedAt, operationState: row.operationState,
        });
      }
      for (const row of patient) {
        if (!row.hospitalId || !row.claimedAt || !row.hospital) continue;
        rows.push({
          resetId: row.id, userId: row.targetUserId, displayName: displayNameOf(row.targetUser.person), hospitalId: row.hospitalId,
          hospitalName: row.hospital.name, mode: modeForRecord({ storage: "PATIENT", mode: row.deliveryChannel }),
          claimedAt: row.claimedAt, operationState: row.operationState,
        });
      }
      return rows.sort((left, right) => left.claimedAt.getTime() - right.claimedAt.getTime());
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

export type MediatedPasswordResetReconcileOutcome = "COMPLETED" | "ROLLED_BACK";

async function recordReconcileAudit(
  database: MediatedPasswordResetDatabase | Prisma.TransactionClient,
  actorUserId: string,
  record: ResetRecord,
  outcome: MediatedPasswordResetReconcileOutcome | "PROVIDER_UNCONFIRMED" | "UNRESOLVED",
): Promise<void> {
  await recordAuditEvent({
    actorUserId,
    action: "account.password_reset.reconciled",
    resourceType: "User",
    resourceId: record.userId,
    metadata: { issuerUserId: record.issuerUserId, hospitalId: record.hospitalId, mode: record.mode, outcome },
  }, database);
}

/**
 * ADMIN reconciliation of a quarantined reset. The provider is checked for the reset's deterministic replacement alias
 * and for the previous subject; the canonical User then decides the direction. A committed switch is finalized and the
 * previous identity deleted; otherwise, while the previous identity still exists, any orphan replacement is deleted and
 * the reset revoked so the old password works again. Anything unconfirmed stays quarantined: attestation never clears it.
 */
export async function reconcileMediatedPasswordReset(
  actor: ActorContext | null | undefined,
  input: { resetId: string },
  dependencies: MediatedPasswordResetReconcileDependencies = {},
): Promise<{ outcome: MediatedPasswordResetReconcileOutcome }> {
  if (!actor?.userId) throw new ForbiddenError();
  const resetId = z.uuid().safeParse(input.resetId);
  if (!resetId.success) throw new ValidationError("Password reset reconciliation data is invalid");
  const database = getDatabase(dependencies);

  try {
    const snapshot = await runSerializableTransaction(database, async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      const record = await findReset(transaction, { id: resetId.data });
      if (!record?.claimedAt || record.usedAt) throw new NotFoundError();
      const user = await transaction.user.findUnique({ where: { id: record.userId }, select: { authSubject: true } });
      return { record, canonicalSubject: user?.authSubject ?? null };
    });
    const { record, canonicalSubject } = snapshot;

    let replacement: { authSubject: string } | null;
    let previousExists: boolean;
    try {
      const findByAlias = dependencies.findProviderIdentityByLoginAlias ?? findProviderIdentityByLoginAlias;
      const exists = dependencies.providerIdentityExists ?? providerIdentityExists;
      replacement = await findByAlias(createProviderResetLoginAlias(record.userId, record.id));
      previousExists = record.previousAuthSubject ? await exists(record.previousAuthSubject) : false;
    } catch {
      await recordReconcileAudit(database, actor.userId, record, "PROVIDER_UNCONFIRMED");
      throw new InfrastructureError("The provider outcome could not be confirmed");
    }

    const replacementConsistent = !record.replacementAuthSubject || !replacement || replacement.authSubject === record.replacementAuthSubject;
    const outcome: MediatedPasswordResetReconcileOutcome | null = !replacementConsistent
      ? null
      : replacement && canonicalSubject === replacement.authSubject
        ? "COMPLETED"
        : record.previousAuthSubject && canonicalSubject === record.previousAuthSubject && previousExists
          ? "ROLLED_BACK"
          : null;
    if (!outcome) {
      await recordReconcileAudit(database, actor.userId, record, "UNRESOLVED");
      throw new ConflictError("The provider state does not match a recoverable reset outcome");
    }

    const now = currentTime(dependencies);
    const cleanupId = await runSerializableTransaction(database, async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      await lockFirstCredentialOperation(transaction, record.userId);
      const user = await transaction.user.findUnique({ where: { id: record.userId }, select: { authSubject: true } });
      if (user?.authSubject !== canonicalSubject) throw new ConflictError("The target credential changed during reconciliation");
      const count = await updateReset(transaction, record, outcome === "COMPLETED" ? completionUpdate(record, now) : rollbackUpdate(now), true);
      if (count !== 1) throw new ConflictError("The reset operation changed");
      const orphanSubject = outcome === "COMPLETED" ? (previousExists ? record.previousAuthSubject : null) : replacement?.authSubject ?? null;
      const id = orphanSubject
        ? await recordProviderIdentityCleanup(transaction, {
            authSubject: orphanSubject,
            userId: record.userId,
            reason: outcome === "COMPLETED" ? ProviderIdentityCleanupReason.PREVIOUS_IDENTITY : ProviderIdentityCleanupReason.ORPHAN_REPLACEMENT,
          })
        : null;
      await recordReconcileAudit(transaction, actor.userId, record, outcome);
      return id;
    });

    if (cleanupId) await attemptProviderIdentityCleanup(database, cleanupId, dependencies, now).catch(() => false);
    await retryPendingProviderIdentityCleanups(database, dependencies, now);
    return { outcome };
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}
