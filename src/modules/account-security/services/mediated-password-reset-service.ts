import "server-only";

import { z } from "zod";

import {
  AccountRecoveryDeliveryChannel,
  HospitalServiceAreaFacilityKind,
  HospitalStatus,
  IdentityAssurance,
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
import { assertWorkforceRelationshipsCompatible } from "@/modules/identity/services/workforce-relationship-compatibility";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE, thaiNationalIdSchema } from "@/modules/identity/schemas/identity-schemas";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { unlinkLineBindingForSuspectedTakeover } from "@/modules/line/services/line-account-service";
import { assertChildOwnerInvitationContext } from "@/modules/hospital-service-areas/services/child-owner-invitation-context";
import { assertParentOwnerInvitationContext } from "@/modules/hospital-onboarding/services/parent-owner-invitation-context";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  assertPasswordChangeRecoveryAvailable,
  unreconciledAccountRecoveryWhere,
  unreconciledLinePasswordRecoveryWhere,
  unreconciledWorkforceResetWhere,
} from "@/modules/auth/services/credential-recovery-state";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import { createAuthAttemptThrottle, type AuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import { passwordLoginIdentifierSchema } from "@/modules/auth/schemas/login-schema";
import { userOwnedPasswordSchema } from "@/modules/auth/schemas/password-schema";
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
  platformAdminMediatedPasswordResetSearchSchema,
  type StoredCredentialRecoveryVerificationMethod,
  type MediatedPasswordResetMode,
  type MediatedPasswordResetTargetContext,
  type MediatedPasswordResetTargetKind,
} from "../schemas/account-security-schemas";
import { createAccountRecoveryToken, hashAccountRecoveryToken } from "./account-recovery-token-service";
import { notifyPasswordChangeLineBindings } from "./password-change-notification";
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
export const LINE_PASSWORD_RECOVERY_TTL_MS = 15 * 60 * 1000;
export const LINE_PASSWORD_RECOVERY_MAX_ISSUANCES_PER_HOUR = 3;
const LINE_PASSWORD_RECOVERY_ISSUANCE_WINDOW_MS = 60 * 60 * 1000;

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
  attemptThrottle?: AuthAttemptThrottle;
  clientIpAddress?: string | null;
};

export type MediatedPasswordResetReconcileDependencies = Pick<MediatedPasswordResetDependencies, "database" | "now" | "deleteProviderIdentity"> & {
  sendLineMessage?: MediatedPasswordResetDependencies["sendLineMessage"];
  findProviderIdentityByLoginAlias?: (providerLoginAlias: string) => Promise<{ authSubject: string } | null>;
  providerIdentityExists?: (authSubject: string) => Promise<boolean>;
  operatorNote?: string;
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

export class PasswordResetReconciliationRequiredError extends InfrastructureError {
  constructor() {
    super("The password reset operation requires reconciliation");
    this.name = "PasswordResetReconciliationRequiredError";
  }
}

export class LinePasswordRecoveryIdentityMismatchError extends ForbiddenError {
  constructor() {
    super("The recovery link was opened from a different LINE account");
    this.name = "LinePasswordRecoveryIdentityMismatchError";
  }
}

type ResetStorage = "WORKFORCE" | "PATIENT" | "LINE_SELF_SERVICE";

type ResetRecord = {
  storage: ResetStorage;
  id: string;
  userId: string;
  hospitalId: string | null;
  relationshipId: string | null;
  targetKind: MediatedPasswordResetTargetKind | "line_self_service";
  issuerUserId: string;
  mode: MediatedPasswordResetMode;
  verificationMethod: StoredCredentialRecoveryVerificationMethod;
  expiresAt: Date;
  deliveredAt: Date | null;
  claimedAt: Date | null;
  usedAt: Date | null;
  completedAt: Date | null;
  revokedAt: Date | null;
  failedVerificationCount: number;
  operationState: WorkforceActivationOperationState;
  reconciliationRequiredAt: Date | null;
  previousAuthSubject: string | null;
  replacementAuthSubject: string | null;
  lineAccountBindingId: string | null;
  lineSubjectFingerprint: string | null;
};

type TargetSnapshot = {
  userId: string;
  personId: string;
  authSubject: string | null;
  status: UserStatus;
  identityAssurance: IdentityAssurance;
  roles: { role: Role }[];
  memberships: { id: string; hospitalId: string; membershipType: MembershipType; status: MembershipStatus; invitedViaServiceAreaId: string | null }[];
  osmHospitalRelationships: { hospitalId: string }[];
  patientProfileId: string | null;
  takeoverLock: {
    id: string;
    hospitalId: string;
    lockedAt: Date;
    providerState: UserTakeoverProviderState;
    suspendedMembershipIds: string[];
    suspendedOsmRelationshipIds: string[];
    heldOwnerMembershipIds: string[];
  } | null;
};

type LegacyHospitalScopedPlatformAdminResetContext = {
  targetKind: "platform_admin";
  targetUserId: string;
  hospitalId: string;
  relationshipId: null;
};

type MediatedPasswordResetAuthorizationContext =
  | MediatedPasswordResetTargetContext
  | LegacyHospitalScopedPlatformAdminResetContext;

const targetUserSelect = {
  id: true,
  personId: true,
  authSubject: true,
  status: true,
  identityAssurance: true,
  roles: { select: { role: true } },
  memberships: { select: { id: true, hospitalId: true, membershipType: true, status: true, invitedViaServiceAreaId: true } },
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
      heldOwnerMembershipIds: true,
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
    identityAssurance: user.identityAssurance,
    roles: user.roles,
    memberships: user.memberships,
    osmHospitalRelationships: user.osmHospitalRelationships,
    patientProfileId: user.person.patientProfile?.id ?? null,
    takeoverLock: user.takeoverLock,
  };
}

async function locateTarget(
  transaction: Prisma.TransactionClient,
  input: MediatedPasswordResetAuthorizationContext,
): Promise<TargetSnapshot | null> {
  if (input.targetKind === "platform_admin") {
    const user = await transaction.user.findUnique({ where: { id: input.targetUserId }, select: targetUserSelect });
    return user ? toTargetSnapshot(user) : null;
  }
  if (input.targetKind === "caregiver") {
    const user = await transaction.user.findUnique({ where: { id: input.targetUserId }, select: targetUserSelect });
    return user ? toTargetSnapshot(user) : null;
  }
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

async function caregiverPatientProfiles(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
): Promise<string[]> {
  const [relationships, appointmentGrants, resourceGrants] = await Promise.all([
    transaction.caregiverRelationship.findMany({ where: { caregiverUserId: target.userId }, select: { patientProfileId: true } }),
    transaction.caregiverAppointmentGrant.findMany({ where: { caregiverUserId: target.userId }, select: { patientProfileId: true } }),
    transaction.caregiverResourceGrant.findMany({ where: { caregiverUserId: target.userId }, select: { patientProfileId: true } }),
  ]);
  return [...new Set([...relationships, ...appointmentGrants, ...resourceGrants].map(({ patientProfileId }) => patientProfileId))];
}

async function isReconcilingCredential(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  currentReset?: { storage: ResetStorage; id: string },
): Promise<boolean> {
  const [workforce, patient, line] = await Promise.all([
    transaction.workforceActivation.findFirst({
      where: { ...unreconciledWorkforceResetWhere, userId: target.userId, ...(currentReset?.storage === "WORKFORCE" ? { id: { not: currentReset.id } } : {}) },
      select: { id: true },
    }),
    transaction.accountRecovery.findFirst({
      where: { ...unreconciledAccountRecoveryWhere, targetUserId: target.userId, ...(currentReset?.storage === "PATIENT" ? { id: { not: currentReset.id } } : {}) },
      select: { id: true },
    }),
    transaction.linePasswordRecoveryCapability.findFirst({
      where: { ...unreconciledLinePasswordRecoveryWhere, targetUserId: target.userId, ...(currentReset?.storage === "LINE_SELF_SERVICE" ? { id: { not: currentReset.id } } : {}) },
      select: { id: true },
    }),
  ]);
  return Boolean(workforce || patient || line);
}

export type LinePasswordRecoveryTarget = {
  userId: string;
  authSubject: string;
  bindingId: string;
  lineUserId: string;
  lineSubjectFingerprint: string;
};

async function findEligibleLinePasswordRecoveryTarget(
  transaction: Prisma.TransactionClient,
  userId: string,
  expected?: { bindingId: string; lineSubjectFingerprint: string },
  currentReset?: { storage: ResetStorage; id: string },
): Promise<LinePasswordRecoveryTarget | null> {
  const user = await transaction.user.findUnique({ where: { id: userId }, select: targetUserSelect });
  if (
    !user || user.status !== UserStatus.ACTIVE || !user.authSubject ||
    user.roles.some(({ role }) => role === Role.ADMIN) ||
    (user.takeoverLock !== null && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED) ||
    await isReconcilingCredential(transaction, toTargetSnapshot(user), currentReset)
  ) return null;

  const bindings = await transaction.lineAccountBinding.findMany({
    where: { userId, unlinkedAt: null },
    select: { id: true, lineUserId: true, lineSubjectFingerprint: true },
  });
  if (bindings.length !== 1) return null;
  const binding = bindings[0];
  if (!binding?.lineUserId || !/^U[0-9a-f]{32}$/iu.test(binding.lineUserId)) return null;
  if (expected && (binding.id !== expected.bindingId || binding.lineSubjectFingerprint !== expected.lineSubjectFingerprint)) return null;
  return {
    userId,
    authSubject: user.authSubject,
    bindingId: binding.id,
    lineUserId: binding.lineUserId,
    lineSubjectFingerprint: binding.lineSubjectFingerprint,
  };
}

async function isCaregiverOnlyTarget(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  hospitalId: string,
  patientProfileIds: string[],
): Promise<boolean> {
  if (
    target.roles.length !== 1 || target.roles[0]?.role !== Role.CAREGIVER ||
    (target.takeoverLock !== null && target.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED) ||
    patientProfileIds.length === 0
  ) return false;

  const patientRows = await transaction.patientHospitalRelationship.findMany({
    where: { patientProfileId: { in: patientProfileIds } },
    select: { patientProfileId: true, hospitalId: true },
  });
  if (patientRows.length === 0) return false;
  const rowsByPatient = new Map<string, string[]>();
  for (const row of patientRows) rowsByPatient.set(row.patientProfileId, [...(rowsByPatient.get(row.patientProfileId) ?? []), row.hospitalId]);
  return patientProfileIds.every((patientProfileId) => {
    const hospitalIds = rowsByPatient.get(patientProfileId);
    return hospitalIds !== undefined && hospitalIds.length > 0 && hospitalIds.every((id) => id === hospitalId);
  });
}

async function allTargetRelationshipsInHospital(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  hospitalId: string,
): Promise<boolean> {
  const [patientRelationships, memberships, osmRelationships] = await Promise.all([
    target.patientProfileId
      ? transaction.patientHospitalRelationship.findMany({ where: { patientProfileId: target.patientProfileId }, select: { hospitalId: true } })
      : Promise.resolve([]),
    transaction.hospitalMembership.findMany({ where: { userId: target.userId }, select: { hospitalId: true } }),
    transaction.osmHospitalRelationship.findMany({ where: { userId: target.userId }, select: { hospitalId: true } }),
  ]);
  const allHospitals = [
    ...memberships.map(({ hospitalId: id }) => id),
    ...osmRelationships.map(({ hospitalId: id }) => id),
    ...patientRelationships.map(({ hospitalId: id }) => id),
  ];
  return allHospitals.length > 0 && allHospitals.every((id) => id === hospitalId);
}

async function isOwnerScopedTarget(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  input: MediatedPasswordResetAuthorizationContext,
  currentReset?: { storage: ResetStorage; id: string },
): Promise<boolean> {
  if (input.targetKind === "platform_admin") return false;
  if (target.roles.some(({ role }) => role === Role.ADMIN)) return false;
  if (await isReconcilingCredential(transaction, target, currentReset)) return false;

  const caregiverPatients = await caregiverPatientProfiles(transaction, target);
  if (input.targetKind === "caregiver") {
    return await isCaregiverOnlyTarget(transaction, target, input.hospitalId, caregiverPatients);
  }

  if (input.targetKind === "staff" && input.relationshipId) {
    const targetOwnerMembership = target.memberships.some(({ id, hospitalId, membershipType, status }) =>
      id === input.relationshipId && hospitalId === input.hospitalId && membershipType === MembershipType.OWNER && status === MembershipStatus.ACTIVE,
    );
    if (targetOwnerMembership) {
      if (target.takeoverLock !== null && target.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED) return false;
      return await allTargetRelationshipsInHospital(transaction, target, input.hospitalId);
    }
  }
  if (target.memberships.some(({ membershipType }) => membershipType === MembershipType.OWNER) || caregiverPatients.length > 0) return false;

  return await allTargetRelationshipsInHospital(transaction, target, input.hospitalId);
}

/** A held OWNER invitation still targets its own Hospital: a Child through its area, or an ADMIN-invited Parent. */
function isHeldOwnerInvitationHospital(
  membership: {
    hospitalId: string;
    invitedViaServiceAreaId: string | null;
    invitedViaServiceArea: { childHospitalId: string } | null;
    hospital: { status: HospitalStatus; serviceAreaEligibility: { kind: HospitalServiceAreaFacilityKind } | null; serviceAreaAssignments: { id: string }[] };
  },
  statuses: readonly HospitalStatus[],
): boolean {
  if (!statuses.includes(membership.hospital.status)) return false;
  if (membership.invitedViaServiceAreaId === null) {
    // ADR-0024: a Parent OWNER invitation issued by platform ADMIN; the Hospital was never the Child of any area.
    return membership.hospital.serviceAreaEligibility?.kind === HospitalServiceAreaFacilityKind.PARENT &&
      membership.hospital.serviceAreaAssignments.length === 0;
  }
  return membership.invitedViaServiceArea?.childHospitalId === membership.hospitalId &&
    membership.hospital.serviceAreaEligibility?.kind === HospitalServiceAreaFacilityKind.CHILD;
}

const heldOwnerInvitationSelect = {
  hospitalId: true,
  invitedViaServiceAreaId: true,
  invitedViaServiceArea: { select: { childHospitalId: true } },
  hospital: { select: { status: true, serviceAreaEligibility: { select: { kind: true } }, serviceAreaAssignments: { select: { id: true }, take: 1 } } },
} satisfies Prisma.HospitalMembershipSelect;

/**
 * The only REC-1 exception for a non-ACTIVE Hospital: an exact OWNER hold recorded by its unresolved takeover lock.
 * FIX-1c: a lock spans Hospitals, so the hold is validated against its own Hospital, not the Hospital that first locked.
 * ADR-0024: a held Parent OWNER invitation issued by platform ADMIN follows the same rule as a held Child invitation.
 */
async function isHeldOwnerInvitationResetTarget(
  transaction: Prisma.TransactionClient,
  target: TargetSnapshot,
  input: MediatedPasswordResetAuthorizationContext,
): Promise<boolean> {
  const lock = target.takeoverLock;
  if (
    input.targetKind !== "staff" || !input.relationshipId ||
    target.identityAssurance !== IdentityAssurance.CAREGIVER_INVITATION || target.status !== UserStatus.SUSPENDED ||
    !lock || lock.providerState === UserTakeoverProviderState.RESOLVED ||
    !lock.heldOwnerMembershipIds.includes(input.relationshipId)
  ) return false;

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: input.relationshipId,
      userId: target.userId,
      hospitalId: input.hospitalId,
      membershipType: MembershipType.OWNER,
      status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.ENDED] },
      invitedByUserId: { not: null },
    },
    select: heldOwnerInvitationSelect,
  });
  return membership !== null &&
    isHeldOwnerInvitationHospital(membership, [HospitalStatus.PENDING_VERIFICATION, HospitalStatus.ACTIVE]);
}

async function authorizeIssuerAndTarget(
  transaction: Prisma.TransactionClient,
  issuerUserId: string,
  input: MediatedPasswordResetAuthorizationContext,
  expectedTargetUserId?: string,
  currentReset?: { storage: ResetStorage; id: string },
): Promise<{ target: TargetSnapshot; mode: "OWNER" | "ADMIN" }> {
  const hospitalLookup = input.targetKind === "platform_admin" && input.hospitalId === null
    ? Promise.resolve(null)
    : transaction.hospital.findUnique({ where: { id: input.hospitalId }, select: { status: true } });
  const [issuer, hospital, target] = await Promise.all([
    transaction.user.findUnique({
      where: { id: issuerUserId },
      select: {
        status: true,
        roles: { select: { role: true } },
        memberships: { select: { hospitalId: true, membershipType: true, status: true, hospital: { select: { status: true } } } },
      },
    }),
    hospitalLookup,
    locateTarget(transaction, input),
  ]);
  if (!issuer || issuer.status !== UserStatus.ACTIVE) throw new ForbiddenError();
  if (!target) throw new NotFoundError();
  if (target.userId === issuerUserId || (expectedTargetUserId && target.userId !== expectedTargetUserId)) {
    throw new ForbiddenError();
  }
  if (!target.authSubject) throw new ConflictError("The target does not have a password identity to replace");
  const hasActiveTakeoverLock = target.takeoverLock !== null && target.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED;
  if (hasActiveTakeoverLock) await assertWorkforceRelationshipsCompatible(transaction, target.userId);
  if (target.status !== UserStatus.ACTIVE && !(target.status === UserStatus.SUSPENDED && hasActiveTakeoverLock)) {
    throw new ConflictError("The target account is not available for password reset");
  }

  const issuerRoles = issuer.roles.map(({ role }) => role);
  const targetIsPlatformAdmin = target.roles.some(({ role }) => role === Role.ADMIN);
  if (input.targetKind === "platform_admin") {
    if (!issuerRoles.includes(Role.ADMIN) || !targetIsPlatformAdmin) throw new ForbiddenError();
    if (input.hospitalId !== null && (!hospital || hospital.status !== HospitalStatus.ACTIVE)) throw new NotFoundError();
    return { target, mode: "ADMIN" };
  }
  if (targetIsPlatformAdmin) throw new ForbiddenError();
  if (await isHeldOwnerInvitationResetTarget(transaction, target, input)) {
    if (!issuerRoles.includes(Role.ADMIN)) throw new ForbiddenError("Only a platform ADMIN may reset this held OWNER account");
    return { target, mode: "ADMIN" };
  }
  if (!hospital || hospital.status !== HospitalStatus.ACTIVE) throw new NotFoundError();
  if (issuerRoles.includes(Role.ADMIN)) return { target, mode: "ADMIN" };

  const ownerMembership = issuer.memberships.some(
    (membership) =>
      membership.hospitalId === input.hospitalId &&
      membership.membershipType === MembershipType.OWNER &&
      membership.status === MembershipStatus.ACTIVE &&
      membership.hospital.status === HospitalStatus.ACTIVE,
  );
  if (!issuerRoles.includes(Role.HOSPITAL) || !ownerMembership) throw new ForbiddenError();

  const ownerScoped = await isOwnerScopedTarget(transaction, target, input, currentReset);
  if (!ownerScoped) throw new ForbiddenError("A platform ADMIN must reset this account");
  return { target, mode: "OWNER" };
}

function modeForRecord(record: { storage: ResetStorage; mode?: WorkforceActivationMode | AccountRecoveryDeliveryChannel }): MediatedPasswordResetMode {
  if (record.storage === "WORKFORCE") return record.mode === WorkforceActivationMode.ASSISTED ? "IN_PERSON" : "ONLINE";
  if (record.storage === "LINE_SELF_SERVICE") return "ONLINE";
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
  if (record.storage === "LINE_SELF_SERVICE") {
    const result = await transaction.linePasswordRecoveryCapability.updateMany({
      where: { id: record.id, ...(whileClaimed ? unreconciledLinePasswordRecoveryWhere : {}) },
      data: { ...common, completedAt: completedAt ?? usedAt },
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
  const [workforce, patient, line] = await Promise.all([
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
    transaction.linePasswordRecoveryCapability.findFirst({
      where,
      select: {
        id: true, targetUserId: true, lineAccountBindingId: true, lineSubjectFingerprint: true,
        expiresAt: true, deliveredAt: true, claimedAt: true, completedAt: true, revokedAt: true, operationState: true,
        reconciliationRequiredAt: true, previousAuthSubject: true, replacementAuthSubject: true,
      },
    }),
  ]);
  if ([workforce, patient, line].filter(Boolean).length > 1) throw new InfrastructureError("A recovery token is ambiguous");
  if (workforce?.relationshipKind && workforce.verificationMethod) {
    const targetKind = workforce.relationshipKind === "staff" || workforce.relationshipKind === "osm" || workforce.relationshipKind === "patient" || workforce.relationshipKind === "caregiver" || workforce.relationshipKind === "platform_admin" ? workforce.relationshipKind : null;
    if (!targetKind) throw new InfrastructureError("A workforce reset scope is invalid");
    const nullHospitalAdminReset = targetKind === "platform_admin" && workforce.hospitalId === null && workforce.relationshipId === null;
    if (!workforce.hospitalId && !nullHospitalAdminReset) throw new InfrastructureError("A workforce reset context is invalid");
    return {
      storage: "WORKFORCE", id: workforce.id, userId: workforce.userId, hospitalId: workforce.hospitalId,
      relationshipId: workforce.relationshipId, targetKind, issuerUserId: workforce.createdByUserId,
      mode: modeForRecord({ storage: "WORKFORCE", mode: workforce.mode }), verificationMethod: workforce.verificationMethod,
      expiresAt: workforce.expiresAt, deliveredAt: null, claimedAt: workforce.claimedAt, usedAt: workforce.usedAt,
      completedAt: null, revokedAt: workforce.revokedAt, failedVerificationCount: workforce.failedVerificationCount,
      operationState: workforce.operationState, reconciliationRequiredAt: workforce.reconciliationRequiredAt,
      previousAuthSubject: workforce.previousAuthSubject, replacementAuthSubject: workforce.replacementAuthSubject,
      lineAccountBindingId: null, lineSubjectFingerprint: null,
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
      expiresAt: patient.expiresAt, deliveredAt: null, claimedAt: patient.claimedAt, usedAt: patient.completedAt,
      completedAt: patient.completedAt, revokedAt: patient.revokedAt, failedVerificationCount: patient.failedVerificationCount,
      operationState: patient.operationState, reconciliationRequiredAt: patient.reconciliationRequiredAt,
      previousAuthSubject: patient.previousAuthSubject, replacementAuthSubject: patient.replacementAuthSubject,
      lineAccountBindingId: null, lineSubjectFingerprint: null,
    };
  }
  if (line) {
    return {
      storage: "LINE_SELF_SERVICE", id: line.id, userId: line.targetUserId, hospitalId: null,
      relationshipId: null, targetKind: "line_self_service", issuerUserId: line.targetUserId,
        mode: "ONLINE", verificationMethod: "LINE_ID_TOKEN", expiresAt: line.expiresAt, deliveredAt: line.deliveredAt,
      claimedAt: line.claimedAt, usedAt: line.completedAt, completedAt: line.completedAt,
      revokedAt: line.revokedAt, failedVerificationCount: 0, operationState: line.operationState,
      reconciliationRequiredAt: line.reconciliationRequiredAt, previousAuthSubject: line.previousAuthSubject,
      replacementAuthSubject: line.replacementAuthSubject, lineAccountBindingId: line.lineAccountBindingId,
      lineSubjectFingerprint: line.lineSubjectFingerprint,
    };
  }
  return null;
}

function resetLocator(record: ResetRecord): MediatedPasswordResetAuthorizationContext {
  if (record.targetKind === "platform_admin" && record.hospitalId === null && record.relationshipId === null) {
    return { targetKind: "platform_admin", targetUserId: record.userId, hospitalId: null, relationshipId: null };
  }
  if (!record.hospitalId || record.targetKind === "line_self_service") throw new InfrastructureError("The mediated reset context is missing");
  if (record.targetKind === "platform_admin") {
    return { targetKind: "platform_admin", targetUserId: record.userId, hospitalId: record.hospitalId, relationshipId: null };
  }
  if (record.targetKind === "caregiver") {
    return { targetKind: "caregiver", targetUserId: record.userId, hospitalId: record.hospitalId, relationshipId: null };
  }
  if (!record.relationshipId) throw new InfrastructureError("The mediated reset relationship is missing");
  return { hospitalId: record.hospitalId, relationshipId: record.relationshipId, targetKind: record.targetKind };
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
      await assertPasswordChangeRecoveryAvailable(transaction, target.userId);
      const [claimedWorkforce, claimedPatient, claimedLine] = await Promise.all([
        transaction.workforceActivation.findFirst({ where: { userId: target.userId, purpose: WorkforceActivationPurpose.RESET, claimedAt: { not: null }, usedAt: null, revokedAt: null }, select: { id: true } }),
        transaction.accountRecovery.findFirst({ where: { targetUserId: target.userId, claimedAt: { not: null }, completedAt: null, revokedAt: null }, select: { id: true } }),
        transaction.linePasswordRecoveryCapability.findFirst({ where: { targetUserId: target.userId, ...unreconciledLinePasswordRecoveryWhere }, select: { id: true } }),
      ]);
      if (claimedWorkforce || claimedPatient || claimedLine) throw new ConflictError("A password reset is already being reconciled");
      const previousResetWhere = { userId: target.userId, purpose: WorkforceActivationPurpose.RESET, claimedAt: null, usedAt: null, revokedAt: null };
      await transaction.workforceActivation.updateMany({ where: previousResetWhere, data: { revokedAt: now } });
      await transaction.accountRecovery.updateMany({
        where: { targetUserId: target.userId, claimedAt: null, completedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.linePasswordRecoveryCapability.updateMany({
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
): Promise<{ expiresAt: Date; mode: MediatedPasswordResetMode; confirmationKind: "THAI_NATIONAL_ID" | "PLATFORM_ADMIN_IDENTIFIER" }> {
  const parsed = accountRecoveryTokenSchema.safeParse(token);
  if (!parsed.success) throw new NotFoundError();
  const database = getDatabase(dependencies);
  const record = await database.$transaction(async (transaction) => {
    const reset = await findResetByToken(transaction, hashAccountRecoveryToken(parsed.data));
    if (reset) await assertPasswordChangeRecoveryAvailable(transaction, reset.userId);
    return reset;
  });
  if (!record || record.storage === "LINE_SELF_SERVICE" || record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= currentTime(dependencies)) {
    throw new NotFoundError();
  }
  return {
    expiresAt: record.expiresAt,
    mode: record.mode,
    confirmationKind: record.targetKind === "platform_admin" ? "PLATFORM_ADMIN_IDENTIFIER" : "THAI_NATIONAL_ID",
  };
}

export type LinePasswordRecoveryAvailability = "READY" | "EXPIRED" | "OTHER_LINE" | "INELIGIBLE";

export async function issueLinePasswordRecoveryCapability(
  input: { userId: string; identityKeyHash: string },
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<{ resetId: string; bindingId: string; lineUserId: string; expiresAt: Date } | null> {
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  const expiresAt = new Date(now.getTime() + LINE_PASSWORD_RECOVERY_TTL_MS);
  try {
    const issued = await runSerializableTransaction(database, async (transaction) => {
      await lockFirstCredentialOperation(transaction, input.userId);
      await assertPasswordChangeRecoveryAvailable(transaction, input.userId);
      const identity = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { person: { select: { identityKeyHash: true } } },
      });
      if (identity?.person.identityKeyHash !== input.identityKeyHash) return null;
      const target = await findEligibleLinePasswordRecoveryTarget(transaction, input.userId);
      if (!target) return null;
      const recentIssuanceCount = await transaction.linePasswordRecoveryCapability.count({
        where: { targetUserId: input.userId, createdAt: { gt: new Date(now.getTime() - LINE_PASSWORD_RECOVERY_ISSUANCE_WINDOW_MS) } },
      });
      if (recentIssuanceCount >= LINE_PASSWORD_RECOVERY_MAX_ISSUANCES_PER_HOUR) return null;

      await transaction.linePasswordRecoveryCapability.updateMany({
        where: { targetUserId: input.userId, claimedAt: null, completedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      const capability = await transaction.linePasswordRecoveryCapability.create({
        data: {
          targetUserId: input.userId,
          lineAccountBindingId: target.bindingId,
          lineSubjectFingerprint: target.lineSubjectFingerprint,
          expiresAt,
        },
        select: { id: true },
      });
      return { resetId: capability.id, bindingId: target.bindingId, lineUserId: target.lineUserId };
    });
    return issued ? { ...issued, expiresAt } : null;
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

/** A token becomes usable only after LINE confirms the push; an ambiguous send is revoked. */
export async function confirmLinePasswordRecoveryDelivery(
  resetId: string,
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<boolean> {
  const result = await getDatabase(dependencies).linePasswordRecoveryCapability.updateMany({
    where: {
      id: resetId,
      deliveredAt: null,
      claimedAt: null,
      completedAt: null,
      revokedAt: null,
      expiresAt: { gt: currentTime(dependencies) },
    },
    data: { deliveredAt: currentTime(dependencies) },
  });
  return result.count === 1;
}

export async function revokeLinePasswordRecoveryCapability(
  resetId: string,
  outcome: "PUSH_FAILED" | "DELIVERY_UNCONFIRMED",
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<void> {
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  await runSerializableTransaction(database, async (transaction) => {
    const capability = await transaction.linePasswordRecoveryCapability.findUnique({ where: { id: resetId }, select: { targetUserId: true } });
    if (!capability) return;
    await transaction.linePasswordRecoveryCapability.updateMany({
      where: { id: resetId, claimedAt: null, completedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordAuditEvent({
      actorUserId: null,
      action: "account.password_reset.self_service.delivery",
      resourceType: "User",
      resourceId: capability.targetUserId,
      metadata: { outcome },
    }, transaction);
  });
}

type LinePasswordRecoveryLocator = { tokenHash: string } | { id: string };

async function getLinePasswordRecoveryAvailabilityForLocator(
  locator: LinePasswordRecoveryLocator,
  lineSubjectFingerprint: string,
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now">,
): Promise<LinePasswordRecoveryAvailability> {
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  try {
    return await runSerializableTransaction(database, async (transaction) => {
      const record = await findReset(transaction, locator);
      if (
        !record || record.storage !== "LINE_SELF_SERVICE" || !record.deliveredAt ||
        record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= now
      ) return "EXPIRED";
      if (record.lineSubjectFingerprint !== lineSubjectFingerprint) return "OTHER_LINE";

      await lockFirstCredentialOperation(transaction, record.userId);
      try {
        await assertPasswordChangeRecoveryAvailable(transaction, record.userId);
      } catch {
        return "EXPIRED";
      }
      const refreshed = await findReset(transaction, locator);
      if (
        !refreshed || refreshed.storage !== "LINE_SELF_SERVICE" || !refreshed.deliveredAt ||
        refreshed.claimedAt || refreshed.usedAt || refreshed.revokedAt || refreshed.expiresAt <= now
      ) return "EXPIRED";
      if (refreshed.lineSubjectFingerprint !== lineSubjectFingerprint) return "OTHER_LINE";
      const target = await findEligibleLinePasswordRecoveryTarget(
        transaction,
        refreshed.userId,
        { bindingId: refreshed.lineAccountBindingId ?? "", lineSubjectFingerprint },
        { storage: refreshed.storage, id: refreshed.id },
      );
      if (!target) {
        await updateReset(transaction, refreshed, { revokedAt: now });
        return "INELIGIBLE";
      }
      return "READY";
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

export async function getLinePasswordRecoveryAvailability(
  token: unknown,
  lineSubjectFingerprint: string,
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<LinePasswordRecoveryAvailability> {
  const parsedToken = accountRecoveryTokenSchema.safeParse(token);
  if (!parsedToken.success || !/^[a-f0-9]{64}$/u.test(lineSubjectFingerprint)) return "EXPIRED";
  return getLinePasswordRecoveryAvailabilityForLocator(
    { tokenHash: hashAccountRecoveryToken(parsedToken.data) },
    lineSubjectFingerprint,
    dependencies,
  );
}

export async function getLinePasswordRecoveryAvailabilityByCapabilityId(
  capabilityId: unknown,
  lineSubjectFingerprint: string,
  dependencies: Pick<MediatedPasswordResetDependencies, "database" | "now"> = {},
): Promise<LinePasswordRecoveryAvailability> {
  const parsedId = z.uuid().safeParse(capabilityId);
  if (!parsedId.success || !/^[a-f0-9]{64}$/u.test(lineSubjectFingerprint)) return "EXPIRED";
  return getLinePasswordRecoveryAvailabilityForLocator(
    { id: parsedId.data },
    lineSubjectFingerprint,
    dependencies,
  );
}

const linePasswordRecoveryCompletionSchema = z.object({
  token: accountRecoveryTokenSchema.optional(),
  capabilityId: z.uuid().optional(),
  newPassword: userOwnedPasswordSchema,
  passwordConfirmation: userOwnedPasswordSchema,
}).strict().superRefine((input, context) => {
  if (Boolean(input.token) === Boolean(input.capabilityId)) {
    context.addIssue({ code: "custom", path: ["capabilityId"], message: "Exactly one recovery link identifier is required" });
  }
  if (input.newPassword !== input.passwordConfirmation) {
    context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Password confirmation does not match" });
  }
});

export async function completeLinePasswordRecovery(
  input: unknown,
  lineSubjectFingerprint: string,
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<void> {
  const parsed = linePasswordRecoveryCompletionSchema.safeParse(input);
  if (!parsed.success || !/^[a-f0-9]{64}$/u.test(lineSubjectFingerprint)) {
    throw new ValidationError("LINE password recovery data is invalid");
  }
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  let locator: LinePasswordRecoveryLocator;
  if (parsed.data.token) {
    locator = { tokenHash: hashAccountRecoveryToken(parsed.data.token) };
  } else if (parsed.data.capabilityId) {
    locator = { id: parsed.data.capabilityId };
  } else {
    throw new ValidationError("LINE password recovery data is invalid");
  }
  let claimed: { record: ResetRecord; previousAuthSubject: string } | null;
  try {
    claimed = await runSerializableTransaction(database, async (transaction) => {
      const record = await findReset(transaction, locator);
      if (
        !record || record.storage !== "LINE_SELF_SERVICE" || !record.deliveredAt ||
        record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= now
      ) throw new NotFoundError();
      if (record.lineSubjectFingerprint !== lineSubjectFingerprint) throw new LinePasswordRecoveryIdentityMismatchError();
      await lockFirstCredentialOperation(transaction, record.userId);
      await assertPasswordChangeRecoveryAvailable(transaction, record.userId);
      const refreshed = await findReset(transaction, locator);
      if (
        !refreshed || refreshed.storage !== "LINE_SELF_SERVICE" || !refreshed.deliveredAt ||
        refreshed.claimedAt || refreshed.usedAt || refreshed.revokedAt || refreshed.expiresAt <= now
      ) throw new ConflictError("This reset link is no longer available");
      if (refreshed.lineSubjectFingerprint !== lineSubjectFingerprint) throw new LinePasswordRecoveryIdentityMismatchError();

      const target = await findEligibleLinePasswordRecoveryTarget(
        transaction,
        refreshed.userId,
        { bindingId: refreshed.lineAccountBindingId ?? "", lineSubjectFingerprint },
        { storage: refreshed.storage, id: refreshed.id },
      );
      if (!target) {
        await updateReset(transaction, refreshed, { revokedAt: now });
        return null;
      }
      const claimedAt = now;
      const updated = await updateReset(transaction, refreshed, {
        claimedAt,
        operationState: WorkforceActivationOperationState.CLAIMED,
        previousAuthSubject: target.authSubject,
      });
      if (updated !== 1) throw new ConflictError("This reset link was already used");
      return {
        record: { ...refreshed, claimedAt, operationState: WorkforceActivationOperationState.CLAIMED, previousAuthSubject: target.authSubject },
        previousAuthSubject: target.authSubject,
      };
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
  if (!claimed) throw new ForbiddenError("The LINE password reset is no longer eligible");
  await replaceClaimedPasswordAndFinalize(database, claimed, parsed.data.newPassword, dependencies);
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
  identityConfirmation: { value: string; kind: "THAI_NATIONAL_ID" | "PLATFORM_ADMIN_IDENTIFIER" },
  now: Date,
  attemptThrottle: AuthAttemptThrottle,
  throttleInput: { scope: "RECOVERY_IDENTITY"; identityHash: string; clientIp: string | null; now: Date },
): Promise<{ record: ResetRecord; previousAuthSubject: string }> {
  if (await attemptThrottle.isBlocked(throttleInput)) throw new ForbiddenError("The identity could not be confirmed");
  const tokenHash = hashAccountRecoveryToken(token);
  const outcome = await runSerializableTransaction(database, async (transaction) => {
    const record = await findResetByToken(transaction, tokenHash);
    if (!record || record.storage === "LINE_SELF_SERVICE" || record.claimedAt || record.usedAt || record.revokedAt || record.expiresAt <= now) throw new NotFoundError();
    await lockFirstCredentialOperation(transaction, record.userId);
    const refreshed = await findResetByToken(transaction, tokenHash);
    if (!refreshed || refreshed.storage === "LINE_SELF_SERVICE" || refreshed.claimedAt || refreshed.usedAt || refreshed.revokedAt || refreshed.expiresAt <= now) {
      throw new ConflictError("This reset link is no longer available");
    }
    await assertPasswordChangeRecoveryAvailable(transaction, refreshed.userId);
    const user = await transaction.user.findUnique({ where: { id: refreshed.userId }, select: { personId: true, authSubject: true } });
    if (!user?.authSubject) throw new ConflictError("The target credential changed");
    const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: identityConfirmation.value });
    const person = await transaction.person.findUnique({ where: { identityKeyHash }, select: { id: true } });
    const confirmationFormatIsAllowed = refreshed.targetKind === "platform_admin"
      ? passwordLoginIdentifierSchema.safeParse(identityConfirmation.value).success
      : identityConfirmation.kind === "THAI_NATIONAL_ID" && thaiNationalIdSchema.safeParse(identityConfirmation.value).success;
    if (!confirmationFormatIsAllowed || !person || person.id !== user.personId) {
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
  if (outcome.kind === "WRONG_ID") {
    await attemptThrottle.recordFailure(throttleInput);
    throw new ForbiddenError("The identity could not be confirmed");
  }
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
  await assertWorkforceRelationshipsCompatible(transaction, target.userId);

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
  const heldOwnerMembershipIds = lock.heldOwnerMembershipIds;
  if (membershipIds.length === 0 && osmIds.length === 0 && heldOwnerMembershipIds.length === 0) {
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

  // FIX-1c: recorded ids may belong to any Hospital that provisioned this identity while it was locked.
  const [memberships, osmRelationships] = await Promise.all([
    transaction.hospitalMembership.updateMany({ where: { id: { in: membershipIds }, userId: target.userId, status: MembershipStatus.SUSPENDED }, data: { status: MembershipStatus.ACTIVE } }),
    transaction.osmHospitalRelationship.updateMany({ where: { id: { in: osmIds }, userId: target.userId, status: MembershipStatus.SUSPENDED }, data: { status: MembershipStatus.ACTIVE } }),
  ]);
  if (memberships.count !== membershipIds.length || osmRelationships.count !== osmIds.length) {
    throw new ConflictError("The suspended relationships changed during account recovery");
  }
  await transaction.userTakeoverLock.update({
    where: { id: lock.id },
    data: { providerState: UserTakeoverProviderState.RESOLVED, providerCheckedAt: now },
  });

  const heldOwnerMembershipsRestored: string[] = [];
  const heldOwnerMembershipsNotRestored: { membershipId: string; reason: string }[] = [];
  for (const membershipId of heldOwnerMembershipIds) {
    const held = await transaction.hospitalMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, hospitalId: true, status: true, membershipType: true, userId: true, invitedViaServiceAreaId: true },
    });
    if (!held || held.userId !== target.userId || held.membershipType !== MembershipType.OWNER) {
      heldOwnerMembershipsNotRestored.push({ membershipId, reason: "HELD_MEMBERSHIP_NOT_FOUND" });
      continue;
    }
    if (held.status !== MembershipStatus.PROVISIONED) {
      heldOwnerMembershipsNotRestored.push({ membershipId, reason: `STATUS_${held.status}` });
      continue;
    }

    const competingOpen = await transaction.hospitalMembership.findFirst({
      where: {
        hospitalId: held.hospitalId,
        membershipType: MembershipType.OWNER,
        status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.INVITED] },
        id: { not: held.id },
      },
      select: { id: true },
    });
    if (competingOpen) {
      heldOwnerMembershipsNotRestored.push({ membershipId, reason: "ANOTHER_OWNER_INVITATION_IS_OPEN" });
      continue;
    }

    try {
      if (held.invitedViaServiceAreaId === null) {
        await assertParentOwnerInvitationContext(transaction, {
          membershipId,
          hospitalId: held.hospitalId,
          userId: target.userId,
          expectedStatus: MembershipStatus.PROVISIONED,
        });
      } else {
        await assertChildOwnerInvitationContext(transaction, {
          membershipId,
          childHospitalId: held.hospitalId,
          userId: target.userId,
          expectedStatus: MembershipStatus.PROVISIONED,
        });
      }
    } catch (error: unknown) {
      if (!(error instanceof ConflictError)) throw error;
      heldOwnerMembershipsNotRestored.push({ membershipId, reason: "INVITATION_CONTEXT_NO_LONGER_VALID" });
      continue;
    }

    const restored = await transaction.hospitalMembership.updateMany({
      where: { id: membershipId, userId: target.userId, hospitalId: held.hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.PROVISIONED },
      data: { status: MembershipStatus.INVITED },
    });
    if (restored.count === 1) heldOwnerMembershipsRestored.push(membershipId);
    else heldOwnerMembershipsNotRestored.push({ membershipId, reason: "STATUS_CHANGED_DURING_RESET" });
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "user.takeover_lock_resolved",
    resourceType: "User",
    resourceId: target.userId,
    metadata: {
      issuerUserId,
      hospitalId: lock.hospitalId,
      membershipsRestored: memberships.count,
      osmRelationshipsRestored: osmRelationships.count,
      heldOwnerMembershipsRestored: heldOwnerMembershipsRestored.join(","),
      heldOwnerMembershipsNotRestored: heldOwnerMembershipsNotRestored.map(({ membershipId, reason }) => `${membershipId}:${reason}`).join(","),
    },
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

async function authorizeBreakGlassTarget(
  transaction: Prisma.TransactionClient,
  record: ResetRecord,
): Promise<TargetSnapshot> {
  if (
    record.storage !== "WORKFORCE" || record.hospitalId !== null || record.relationshipId !== null ||
    record.targetKind !== "platform_admin" || record.issuerUserId !== record.userId ||
    record.verificationMethod !== "BREAK_GLASS_CLI"
  ) throw new ForbiddenError();
  const user = await transaction.user.findUnique({ where: { id: record.userId }, select: targetUserSelect });
  if (
    !user || user.status !== UserStatus.ACTIVE || !user.authSubject ||
    !user.roles.some(({ role }) => role === Role.ADMIN) ||
    (user.takeoverLock !== null && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED)
  ) throw new ForbiddenError();
  const authorizationEvent = await transaction.auditEvent.findFirst({
    where: {
      action: "account.password_reset.break_glass",
      resourceType: "User",
      resourceId: record.userId,
      metadata: { path: ["resetId"], equals: record.id },
    },
    select: { metadata: true },
  });
  const metadata = authorizationEvent?.metadata && typeof authorizationEvent.metadata === "object" && !Array.isArray(authorizationEvent.metadata)
    ? authorizationEvent.metadata as Prisma.JsonObject
    : null;
  if (!authorizationEvent || !metadata || typeof metadata.activePeerOverride !== "boolean") throw new ForbiddenError();
  const activePeerCount = await transaction.user.count({
    where: { id: { not: record.userId }, status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
  });
  if (activePeerCount > 0 && !metadata.activePeerOverride) throw new ForbiddenError();
  return toTargetSnapshot(user);
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
    await assertPasswordChangeRecoveryAvailable(transaction, record.userId);
    let target: TargetSnapshot;
    try {
      if (record.storage === "LINE_SELF_SERVICE") {
        const eligible = await findEligibleLinePasswordRecoveryTarget(
          transaction,
          record.userId,
          { bindingId: record.lineAccountBindingId ?? "", lineSubjectFingerprint: record.lineSubjectFingerprint ?? "" },
          { storage: record.storage, id: record.id },
        );
        if (!eligible) throw new ForbiddenError();
        const user = await transaction.user.findUnique({ where: { id: record.userId }, select: targetUserSelect });
        if (!user) throw new ForbiddenError();
        target = toTargetSnapshot(user);
      } else if (record.verificationMethod === "BREAK_GLASS_CLI") {
        target = await authorizeBreakGlassTarget(transaction, record);
      } else {
        ({ target } = await authorizeIssuerAndTarget(transaction, record.issuerUserId, resetLocator(record), record.userId, { storage: record.storage, id: record.id }));
      }
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
        ...(record.storage === "LINE_SELF_SERVICE"
          ? { passwordResetNoticePendingAt: now }
          : { identityAssurance: "HOSPITAL_PROOFED" }),
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
    if (record.storage === "LINE_SELF_SERVICE" && record.lineAccountBindingId) {
      await recordAuditEvent({
        actorUserId: record.userId,
        action: "account.password_reset.self_service",
        resourceType: "User",
        resourceId: record.userId,
        metadata: { bindingId: record.lineAccountBindingId, method: "LINE_ID_TOKEN", path: "LINE", outcome: "COMPLETED" },
      }, transaction);
    }
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
  sendLineMessage?: MediatedPasswordResetDependencies["sendLineMessage"],
): Promise<void> {
  await notifyPasswordChangeLineBindings(database, record.userId, now, sendLineMessage, {
    action: "account.password_reset.line_notification",
    metadata: { issuerUserId: record.issuerUserId },
  });
}

async function replaceClaimedPasswordAndFinalize(
  database: MediatedPasswordResetDatabase,
  claimed: { record: ResetRecord; previousAuthSubject: string },
  newPassword: string,
  dependencies: MediatedPasswordResetDependencies,
): Promise<void> {
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
        newPassword,
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
      throw new PasswordResetReconciliationRequiredError();
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
  await notifyLineBinding(database, claimed.record, currentTime(dependencies), dependencies.sendLineMessage);
}

export async function completeMediatedPasswordReset(
  input: unknown,
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<void> {
  const parsed = mediatedPasswordResetCompletionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Password reset completion data is invalid");
  const identityConfirmation = parsed.data.platformAdminIdentifier !== undefined
    ? { value: parsed.data.platformAdminIdentifier, kind: "PLATFORM_ADMIN_IDENTIFIER" as const }
    : parsed.data.nationalId !== undefined
      ? { value: parsed.data.nationalId, kind: "THAI_NATIONAL_ID" as const }
      : null;
  if (!identityConfirmation) throw new ValidationError("Password reset identity confirmation is required");
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  const attemptThrottle = dependencies.attemptThrottle ?? createAuthAttemptThrottle({ database });
  const throttleInput = {
    scope: "RECOVERY_IDENTITY" as const,
    identityHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: identityConfirmation.value }),
    clientIp: dependencies.clientIpAddress ?? null,
    now,
  };
  let claimed: { record: ResetRecord; previousAuthSubject: string };
  try {
    claimed = await verifyIdentityAndClaim(database, parsed.data.token, identityConfirmation, now, attemptThrottle, throttleInput);
  } catch (error: unknown) {
    return asApplicationError(error);
  }
  await replaceClaimedPasswordAndFinalize(database, claimed, parsed.data.newPassword, dependencies);
}

const breakGlassOperatorNoteSchema = z.string().trim().min(5).max(500);

const breakGlassPasswordResetSchema = z.object({
  loginIdentifier: passwordLoginIdentifierSchema,
  newPassword: userOwnedPasswordSchema,
  passwordConfirmation: userOwnedPasswordSchema,
  operatorNote: breakGlassOperatorNoteSchema,
  allowActivePeer: z.boolean(),
}).strict().superRefine((input, context) => {
  if (input.newPassword !== input.passwordConfirmation) {
    context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "Password confirmation does not match" });
  }
  if (input.operatorNote.includes(input.newPassword)) {
    context.addIssue({ code: "custom", path: ["operatorNote"], message: "The operator note must not contain a password" });
  }
  if (input.operatorNote.includes(input.loginIdentifier)) {
    context.addIssue({ code: "custom", path: ["operatorNote"], message: "The operator note must not contain a login identifier" });
  }
});

/** Server-only last-resort CLI reset; creates an already-claimed REC-1 record and runs the shared replacement path. */
export async function recoverPlatformAdminPassword(
  input: unknown,
  dependencies: MediatedPasswordResetDependencies = {},
): Promise<void> {
  const parsed = breakGlassPasswordResetSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Break-glass password reset data is invalid");
  const database = getDatabase(dependencies);
  const now = currentTime(dependencies);
  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.loginIdentifier });
  let claimed: { record: ResetRecord; previousAuthSubject: string };
  try {
    claimed = await runSerializableTransaction(database, async (transaction) => {
      const person = await transaction.person.findUnique({ where: { identityKeyHash }, select: { user: { select: targetUserSelect } } });
      const user = person?.user;
      if (!user || user.status !== UserStatus.ACTIVE || !user.authSubject || !user.roles.some(({ role }) => role === Role.ADMIN)) {
        throw new NotFoundError("No active platform ADMIN matches the login identifier");
      }
      await lockFirstCredentialOperation(transaction, user.id);
      await assertPasswordChangeRecoveryAvailable(transaction, user.id);
      const activePeerCount = await transaction.user.count({
        where: { id: { not: user.id }, status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
      });
      if (activePeerCount > 0 && !parsed.data.allowActivePeer) {
        throw new ConflictError("Another active platform ADMIN exists; explicit override and operator reason are required");
      }
      const [claimedWorkforce, claimedPatient, claimedLine] = await Promise.all([
        transaction.workforceActivation.findFirst({ where: { ...unreconciledWorkforceResetWhere, userId: user.id }, select: { id: true } }),
        transaction.accountRecovery.findFirst({ where: { ...unreconciledAccountRecoveryWhere, targetUserId: user.id }, select: { id: true } }),
        transaction.linePasswordRecoveryCapability.findFirst({ where: { ...unreconciledLinePasswordRecoveryWhere, targetUserId: user.id }, select: { id: true } }),
      ]);
      if (claimedWorkforce || claimedPatient || claimedLine) throw new ConflictError("The ADMIN account already has a reset requiring reconciliation");
      await transaction.workforceActivation.updateMany({ where: { userId: user.id, purpose: WorkforceActivationPurpose.RESET, claimedAt: null, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await transaction.accountRecovery.updateMany({ where: { targetUserId: user.id, claimedAt: null, completedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await transaction.linePasswordRecoveryCapability.updateMany({ where: { targetUserId: user.id, claimedAt: null, completedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const reset = await transaction.workforceActivation.create({
        data: {
          userId: user.id,
          hospitalId: null,
          relationshipId: null,
          relationshipKind: "platform_admin",
          createdByUserId: user.id,
          tokenHash: hashAccountRecoveryToken(createAccountRecoveryToken()),
          mode: WorkforceActivationMode.ASSISTED,
          purpose: WorkforceActivationPurpose.RESET,
          verificationMethod: "BREAK_GLASS_CLI",
          claimedAt: now,
          operationState: WorkforceActivationOperationState.CLAIMED,
          previousAuthSubject: user.authSubject,
          expiresAt: new Date(now.getTime() + MEDIATED_RESET_IN_PERSON_TTL_MS),
        },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserId: null,
        action: "account.password_reset.break_glass",
        resourceType: "User",
        resourceId: user.id,
        metadata: {
          resetId: reset.id,
          verificationMethod: "BREAK_GLASS_CLI",
          operatorNote: parsed.data.operatorNote,
          activePeerOverride: activePeerCount > 0 && parsed.data.allowActivePeer,
          outcome: "STARTED",
        },
      }, transaction);
      const record: ResetRecord = {
        storage: "WORKFORCE",
        id: reset.id,
        userId: user.id,
        hospitalId: null,
        relationshipId: null,
        targetKind: "platform_admin",
        issuerUserId: user.id,
        mode: "IN_PERSON",
        verificationMethod: "BREAK_GLASS_CLI",
        expiresAt: new Date(now.getTime() + MEDIATED_RESET_IN_PERSON_TTL_MS),
        deliveredAt: null,
        claimedAt: now,
        usedAt: null,
        completedAt: null,
        revokedAt: null,
        failedVerificationCount: 0,
        operationState: WorkforceActivationOperationState.CLAIMED,
        reconciliationRequiredAt: null,
        previousAuthSubject: user.authSubject,
        replacementAuthSubject: null,
        lineAccountBindingId: null,
        lineSubjectFingerprint: null,
      };
      return { record, previousAuthSubject: user.authSubject };
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
  await replaceClaimedPasswordAndFinalize(database, claimed, parsed.data.newPassword, dependencies);
}

const breakGlassReconciliationInputSchema = z.object({
  loginIdentifier: passwordLoginIdentifierSchema,
  operatorNote: breakGlassOperatorNoteSchema,
}).strict();

/** Reconcile a last-ADMIN break-glass reset through REC-1's provider probes and state transitions. */
export async function reconcilePlatformAdminBreakGlassPassword(
  input: unknown,
  dependencies: MediatedPasswordResetReconcileDependencies = {},
): Promise<{ outcome: MediatedPasswordResetReconcileOutcome }> {
  const parsed = breakGlassReconciliationInputSchema.safeParse(input);
  if (!parsed.success || parsed.data.operatorNote.includes(parsed.data.loginIdentifier)) {
    throw new ValidationError("Break-glass reconciliation data is invalid");
  }
  const database = dependencies.database ?? getPrisma();
  try {
    const person = await database.person.findUnique({
      where: { identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.loginIdentifier }) },
      select: { user: { select: { id: true, personId: true, status: true, roles: { select: { role: true } } } } },
    });
    const user = person?.user;
    if (!user || user.status !== UserStatus.ACTIVE || !user.roles.some(({ role }) => role === Role.ADMIN)) {
      throw new NotFoundError("No active platform ADMIN matches the login identifier");
    }
    const actor: ActorContext = {
      userId: user.id,
      personId: user.personId,
      roles: user.roles.map(({ role }) => role),
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const quarantined = await listQuarantinedMediatedPasswordResets(actor, database);
    const matches = quarantined.filter(({ userId, verificationMethod }) => userId === user.id && verificationMethod === "BREAK_GLASS_CLI");
    const [match] = matches;
    if (!match || matches.length !== 1) throw new NotFoundError("No unique quarantined break-glass reset exists for this ADMIN");
    return await reconcileMediatedPasswordReset(actor, { resetId: match.resetId }, {
      ...dependencies,
      database,
      operatorNote: parsed.data.operatorNote,
    });
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

type HospitalRelationshipPasswordResetCandidate = {
  userId: string;
  displayName: string;
  targetKind: "staff" | "osm" | "patient";
  hospitalId: string;
  hospitalName: string;
  relationshipId: string;
  relationshipStatus: string;
};

type HospitalCaregiverPasswordResetCandidate = {
  userId: string;
  displayName: string;
  targetKind: "caregiver";
  hospitalId: string;
  hospitalName: string;
  relationshipId: null;
  relationshipStatus: string;
};

type PlatformAdminPasswordResetCandidate = {
  userId: string;
  displayName: string;
  targetKind: "platform_admin";
  hospitalId: null;
  hospitalName: null;
  relationshipId: null;
  relationshipStatus: "PLATFORM_ADMIN";
};

export type MediatedPasswordResetCandidate =
  | HospitalRelationshipPasswordResetCandidate
  | HospitalCaregiverPasswordResetCandidate
  | PlatformAdminPasswordResetCandidate;

export type MediatedPasswordResetSearchOptions = {
  hospitalId?: string;
  clientIpAddress?: string | null;
  attemptThrottle?: AuthAttemptThrottle;
};

export async function searchMediatedPasswordResetTargets(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: MediatedPasswordResetDatabase = getPrisma(),
  options: MediatedPasswordResetSearchOptions = {},
): Promise<MediatedPasswordResetCandidate[]> {
  if (!actor?.userId) throw new ForbiddenError();
  const parsed = (options.hospitalId ? mediatedPasswordResetSearchSchema : platformAdminMediatedPasswordResetSearchSchema).safeParse(input);
  if (!parsed.success) throw new ValidationError("Recovery identifier is invalid");
  if (options.hospitalId && !z.uuid().safeParse(options.hospitalId).success) throw new ValidationError("Hospital selection is invalid");
  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: parsed.data.nationalId });
  const attemptThrottle = options.attemptThrottle ?? createAuthAttemptThrottle({ database });
  const throttleInput = {
    scope: "RECOVERY_IDENTITY" as const,
    identityHash: identityKeyHash,
    clientIp: options.clientIpAddress ?? null,
    now: new Date(),
  };
  try {
    if (await attemptThrottle.isBlocked(throttleInput)) return [];
    const candidates = await runSerializableTransaction(database, async (transaction) => {
      if (options.hospitalId) {
        const ownerHospital = await transaction.hospital.findFirst({
          where: {
            id: options.hospitalId,
            status: HospitalStatus.ACTIVE,
            memberships: { some: { userId: actor.userId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE, user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } } },
          },
          select: { id: true, name: true },
        });
        if (!ownerHospital) throw new ForbiddenError();
      } else {
        await assertPlatformAdminInDatabase(transaction, actor.userId);
      }
      const person = await transaction.person.findUnique({
        where: { identityKeyHash },
        select: {
          user: { select: {
            id: true,
            status: true,
            authSubject: true,
            identityAssurance: true,
            roles: { select: { role: true } },
            person: { select: { givenName: true, familyName: true } },
            takeoverLock: { select: { hospitalId: true, providerState: true, heldOwnerMembershipIds: true } },
          } },
          patientProfile: { select: { id: true } },
        },
      });
      const user = person?.user;
      const result: MediatedPasswordResetCandidate[] = [];
      const ordinaryNationalIdIsValid = thaiNationalIdSchema.safeParse(parsed.data.nationalId).success;
      const takeoverLocked = Boolean(user?.takeoverLock && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED);
      const resetEligibleStatus = user?.status === UserStatus.ACTIVE || (user?.status === UserStatus.SUSPENDED && takeoverLocked);
      if (options.hospitalId && user?.authSubject && user.id !== actor.userId && resetEligibleStatus) {
        try {
          const authorization = await authorizeIssuerAndTarget(transaction, actor.userId, {
            hospitalId: options.hospitalId,
            relationshipId: null,
            targetUserId: user.id,
            targetKind: "caregiver",
          });
          if (authorization.mode === "OWNER") {
            const hospital = await transaction.hospital.findUnique({ where: { id: options.hospitalId }, select: { name: true } });
            if (hospital) result.push({ userId: user.id, displayName: `${user.person.givenName ?? ""} ${user.person.familyName ?? ""}`.trim() || "ไม่พบชื่อผู้ใช้", targetKind: "caregiver", hospitalId: options.hospitalId, hospitalName: hospital.name, relationshipId: null, relationshipStatus: "CAREGIVER_ONLY" });
          }
        } catch (error: unknown) {
          if (!(error instanceof ForbiddenError || error instanceof ConflictError || error instanceof NotFoundError)) throw error;
        }
      } else if (!options.hospitalId && user?.authSubject && user.id !== actor.userId && resetEligibleStatus) {
        const displayName = `${user.person.givenName ?? ""} ${user.person.familyName ?? ""}`.trim() || "ไม่พบชื่อผู้ใช้";
        if (user.roles.some(({ role }) => role === Role.ADMIN)) {
          result.push({
            userId: user.id,
            displayName,
            targetKind: "platform_admin",
            hospitalId: null,
            hospitalName: null,
            relationshipId: null,
            relationshipStatus: "PLATFORM_ADMIN",
          });
        } else {
          const [memberships, osmRelationships, patientRelationships, heldOwnerMemberships] = await Promise.all([
            transaction.hospitalMembership.findMany({ where: { userId: user.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, status: true, hospital: { select: { name: true } } } }),
            transaction.osmHospitalRelationship.findMany({ where: { userId: user.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, status: true, hospital: { select: { name: true } } } }),
            person?.patientProfile
              ? transaction.patientHospitalRelationship.findMany({ where: { patientProfileId: person.patientProfile.id, hospital: { is: { status: HospitalStatus.ACTIVE } } }, select: { id: true, hospitalId: true, endedAt: true, hospital: { select: { name: true } } } })
              : Promise.resolve([]),
            user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION && takeoverLocked && user.takeoverLock
              ? transaction.hospitalMembership.findMany({
                  where: {
                    id: { in: user.takeoverLock.heldOwnerMembershipIds },
                    userId: user.id,
                    membershipType: MembershipType.OWNER,
                    status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.ENDED] },
                  },
                  select: {
                    ...heldOwnerInvitationSelect,
                    id: true,
                    status: true,
                    hospital: { select: { ...heldOwnerInvitationSelect.hospital.select, name: true } },
                  },
                })
              : Promise.resolve([]),
          ]);
          result.push(...memberships.map((row) => ({ userId: user.id, displayName, targetKind: "staff" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.status })));
          result.push(...osmRelationships.map((row) => ({ userId: user.id, displayName, targetKind: "osm" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.status })));
          result.push(...patientRelationships.map((row) => ({ userId: user.id, displayName, targetKind: "patient" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.endedAt ? "ENDED" : "ACTIVE" })));
          result.push(...heldOwnerMemberships.flatMap((row) =>
            isHeldOwnerInvitationHospital(row, [HospitalStatus.PENDING_VERIFICATION])
              ? [{ userId: user.id, displayName, targetKind: "staff" as const, hospitalId: row.hospitalId, hospitalName: row.hospital.name, relationshipId: row.id, relationshipStatus: row.status }]
              : []
          ));
          if (user.roles.some(({ role }) => role === Role.CAREGIVER)) {
            const activeHospitals = await transaction.hospital.findMany({ where: { status: HospitalStatus.ACTIVE }, select: { id: true, name: true } });
            result.push(...activeHospitals.map((hospital) => ({ userId: user.id, displayName, targetKind: "caregiver" as const, hospitalId: hospital.id, hospitalName: hospital.name, relationshipId: null, relationshipStatus: "CAREGIVER" })));
          }
        }
        if (!user.roles.some(({ role }) => role === Role.ADMIN) && !ordinaryNationalIdIsValid) result.length = 0;
      }
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: options.hospitalId ? "account.password_reset.owner_caregiver_search" : "account.password_reset.admin_search",
        resourceType: "IdentityLookup",
        metadata: { outcome: result.length > 0 ? "MATCH" : "NO_MATCH", candidateCount: result.length },
      }, transaction);
      return result;
    });
    if (candidates.length === 0) await attemptThrottle.recordFailure(throttleInput);
    return candidates;
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}

export async function getMediatedPasswordResetEligibility(
  actor: ActorContext,
  input: MediatedPasswordResetTargetContext,
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
  hospitalId: string | null;
  hospitalName: string | null;
  mode: MediatedPasswordResetMode;
  verificationMethod: StoredCredentialRecoveryVerificationMethod;
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
      const [workforce, patient, line] = await Promise.all([
        transaction.workforceActivation.findMany({
          where: { ...unreconciledWorkforceResetWhere, verificationMethod: { not: null }, OR: [{ hospitalId: { not: null } }, { hospitalId: null, relationshipKind: "platform_admin", relationshipId: null }] },
          orderBy: { claimedAt: "asc" },
          select: { id: true, userId: true, hospitalId: true, relationshipId: true, relationshipKind: true, mode: true, verificationMethod: true, claimedAt: true, operationState: true, user: { select: { person } }, hospital: { select: { name: true } } },
        }),
        transaction.accountRecovery.findMany({
          where: { ...unreconciledAccountRecoveryWhere, verificationMethod: { not: null }, hospitalId: { not: null } },
          orderBy: { claimedAt: "asc" },
          select: { id: true, targetUserId: true, hospitalId: true, deliveryChannel: true, verificationMethod: true, claimedAt: true, operationState: true, targetUser: { select: { person } }, hospital: { select: { name: true } } },
        }),
        transaction.linePasswordRecoveryCapability.findMany({
          where: unreconciledLinePasswordRecoveryWhere,
          orderBy: { claimedAt: "asc" },
          select: { id: true, targetUserId: true, lineAccountBindingId: true, claimedAt: true, operationState: true, targetUser: { select: { person } } },
        }),
      ]);
      const rows: QuarantinedMediatedPasswordReset[] = [];
      for (const row of workforce) {
        if (!row.claimedAt || !row.verificationMethod || (row.hospitalId && !row.hospital)) continue;
        if (!row.hospitalId && (row.relationshipKind !== "platform_admin" || row.relationshipId !== null)) continue;
        rows.push({
          resetId: row.id, userId: row.userId, displayName: displayNameOf(row.user.person), hospitalId: row.hospitalId,
          hospitalName: row.hospital?.name ?? null, mode: modeForRecord({ storage: "WORKFORCE", mode: row.mode }), verificationMethod: row.verificationMethod,
          claimedAt: row.claimedAt, operationState: row.operationState,
        });
      }
      for (const row of patient) {
        if (!row.hospitalId || !row.claimedAt || !row.hospital || !row.verificationMethod) continue;
        rows.push({
          resetId: row.id, userId: row.targetUserId, displayName: displayNameOf(row.targetUser.person), hospitalId: row.hospitalId,
          hospitalName: row.hospital.name, mode: modeForRecord({ storage: "PATIENT", mode: row.deliveryChannel }), verificationMethod: row.verificationMethod,
          claimedAt: row.claimedAt, operationState: row.operationState,
        });
      }
      for (const row of line) {
        if (!row.claimedAt) continue;
        rows.push({
          resetId: row.id, userId: row.targetUserId, displayName: displayNameOf(row.targetUser.person), hospitalId: null,
          hospitalName: "กู้คืนผ่าน LINE", mode: "ONLINE", verificationMethod: "LINE_ID_TOKEN",
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
  actorUserId: string | null,
  record: ResetRecord,
  outcome: MediatedPasswordResetReconcileOutcome | "PROVIDER_UNCONFIRMED" | "UNRESOLVED",
  operatorNote?: string,
): Promise<void> {
  await recordAuditEvent({
    actorUserId,
    action: "account.password_reset.reconciled",
    resourceType: "User",
    resourceId: record.userId,
    metadata: {
      issuerUserId: record.issuerUserId,
      hospitalId: record.hospitalId,
      mode: record.mode,
      outcome,
      ...(operatorNote ? { operatorNote } : {}),
    },
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
  const operatorNote = dependencies.operatorNote === undefined
    ? undefined
    : breakGlassOperatorNoteSchema.safeParse(dependencies.operatorNote);
  if (operatorNote && !operatorNote.success) throw new ValidationError("Break-glass reconciliation data is invalid");
  const operatorNoteText = operatorNote?.success ? operatorNote.data : undefined;
  const reconcileAuditActorUserId = operatorNoteText ? null : actor.userId;
  const database = getDatabase(dependencies);

  try {
    const snapshot = await runSerializableTransaction(database, async (transaction) => {
      await assertPlatformAdminInDatabase(transaction, actor.userId);
      const record = await findReset(transaction, { id: resetId.data });
      if (!record?.claimedAt || record.usedAt) throw new NotFoundError();
      if (operatorNoteText && (record.verificationMethod !== "BREAK_GLASS_CLI" || record.targetKind !== "platform_admin" || record.hospitalId !== null)) {
        throw new ForbiddenError();
      }
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
      await recordReconcileAudit(database, reconcileAuditActorUserId, record, "PROVIDER_UNCONFIRMED", operatorNoteText);
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
      await recordReconcileAudit(database, reconcileAuditActorUserId, record, "UNRESOLVED", operatorNoteText);
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
      if (outcome === "COMPLETED" && record.storage === "LINE_SELF_SERVICE" && record.lineAccountBindingId) {
        await transaction.user.updateMany({
          where: { id: record.userId },
          data: { passwordResetNoticePendingAt: now },
        });
        await recordAuditEvent({
          actorUserId: record.userId,
          action: "account.password_reset.self_service",
          resourceType: "User",
          resourceId: record.userId,
          metadata: { bindingId: record.lineAccountBindingId, method: "LINE_ID_TOKEN", path: "LINE", outcome: "COMPLETED" },
        }, transaction);
      }
      const orphanSubject = outcome === "COMPLETED" ? (previousExists ? record.previousAuthSubject : null) : replacement?.authSubject ?? null;
      const id = orphanSubject
        ? await recordProviderIdentityCleanup(transaction, {
            authSubject: orphanSubject,
            userId: record.userId,
            reason: outcome === "COMPLETED" ? ProviderIdentityCleanupReason.PREVIOUS_IDENTITY : ProviderIdentityCleanupReason.ORPHAN_REPLACEMENT,
          })
        : null;
      await recordReconcileAudit(transaction, reconcileAuditActorUserId, record, outcome, operatorNoteText);
      return id;
    });

    if (cleanupId) await attemptProviderIdentityCleanup(database, cleanupId, dependencies, now).catch(() => false);
    await retryPendingProviderIdentityCleanups(database, dependencies, now);
    if (outcome === "COMPLETED" && record.storage === "LINE_SELF_SERVICE") {
      await notifyLineBinding(database, record, now, dependencies.sendLineMessage);
    }
    return { outcome };
  } catch (error: unknown) {
    return asApplicationError(error);
  }
}
