import "server-only";

import {
  IdentityAssurance,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  WorkforceActivationMode,
  WorkforceActivationPurpose,
  WorkforceActivationOperationState,
  type PrismaClient,
} from "@prisma/client";
import { z } from "zod";

import { readWorkforceCursor, writeWorkforceCursor } from "./workforce-directory-cursor";
import { fingerprintWorkforceBulkSubmission, workforceBulkReceiptSchema, workforceBulkSubmissionExpiry, WORKFORCE_BULK_MAX_ATTEMPTS } from "./workforce-bulk-submission";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import type { ProviderSessionRevocationOutcome } from "@/modules/account-security/adapters/supabase-account-security-provider";
import {
  lockCaregiverInvitationIdentityInTransaction,
  revokeCaregiverInvitationTakeoverSessionsAfterCommit,
  type CaregiverInvitationTakeoverTask,
} from "@/modules/account-security/services/caregiver-invitation-takeover-lock";
import {
  PasswordAuthProvisioningReconciliationError,
  PasswordAuthProvisioningProviderRejectedError,
  provisionPasswordAuthIdentity,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { unreconciledWorkforceResetWhere } from "@/modules/auth/services/credential-recovery-state";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { countCurrentAssignmentsForOsmInHospital } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import {
  activatePendingChildOwner,
  assertChildOwnerInvitationContext,
  CHILD_OWNER_RELATIONSHIP_KIND,
  parentOwnerMembershipWhere,
  type ChildOwnerInvitationContext,
} from "@/modules/hospital-service-areas/services/child-owner-invitation-context";
import {
  createIdentityStore,
  resolvePerson,
} from "@/modules/identity/services/identity-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  assertWorkforceCredentialReplacementSupported,
  type WorkforceResetTargetKind,
} from "../policies/workforce-password-reset-policy";
import {
  assertWorkforcePolicy,
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "../policies/workforce-policy";
import {
  assertHospitalOwnerPolicy,
  HOSPITAL_OWNER_CAPABILITIES,
} from "../policies/hospital-owner-policy";
import {
  workforceReleaseSchema,
  hospitalMemberProvisionSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
  workforceActivationRequestSchema,
  workforceActivationSlipRequestSchema,
  workforceActivationTokenSchema,
  workforceBulkProvisionSchema,
  workforceTargetHospitalIdSchema,
  workforcePasswordResetRequestSchema,
  workforceDetailRequestSchema,
  hospitalMembershipProfessionUpdateSchema,
  hospitalMembershipReportExportGrantSchema,
  hospitalMembershipTransitionSchema,
  hospitalOwnerGovernanceMutationSchema,
  osmRelationshipTransitionSchema,
  workforceListSchema,
  type HospitalMemberProvisionInput,
  type HospitalMembershipProfessionUpdateInput,
  type HospitalMembershipReportExportGrantInput,
  type HospitalMembershipTransitionInput,
  type HospitalOwnerGovernanceMutationInput,
  type OsmRelationshipTransitionInput,
  type OsmProvisionInput,
  type WorkforceActivationCompletionInput,
  type WorkforceActivationRequestInput,
  type WorkforceActivationSlipRequestInput,
  type WorkforceActivationMode as WorkforceActivationModeValue,
  type WorkforceDetailKind,
  type WorkforceKind,
  type WorkforceListInput,
} from "../schemas/workforce-schemas";
import {
  generateWorkforceActivationCredential,
  getWorkforceActivationExpiry,
  hashWorkforceActivationToken,
  toPrismaActivationMode,
  type ActivationCredentialGenerator,
} from "./activation-token-service";
import {
  matchesPersonNationalId,
  maskPersonName,
  WORKFORCE_MAX_FAILED_VERIFICATIONS,
} from "./activation-identity";
import { assertCurrentSelfRegistrationEligibility } from "@/modules/self-registration/services/self-registration-eligibility";
import {
  SELF_REGISTRATION_ELIGIBILITY_WINDOW_MS,
  selfRegistrationRelationshipsSchema,
  type SelfRegistrationRelationship,
} from "@/modules/self-registration/domain/self-registration-schemas";

export type WorkforceDatabase = PrismaClient;

export type WorkforceServiceDependencies = {
  database?: WorkforceDatabase;
  now?: () => Date;
  generateCredential?: ActivationCredentialGenerator;
  provisionIdentity?: (input: {
    userId: string;
    password: string;
  }) => Promise<ProvisionPasswordAuthIdentityResult>;
  replacePassword?: (input: {
    userId: string;
    authSubject: string;
    newPassword: string;
  }) => Promise<void>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  detachAuthSubject?: (input: { userId: string; authSubject: string }) => Promise<boolean>;
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
  transactionRetries?: number;
};

export type WorkforceProvisionOptions = {
  issueInitialActivation?: boolean;
};

export type WorkforceProvisioningResult = {
  kind: WorkforceKind;
  userId: string;
  personId: string;
  hospitalId: string;
  relationshipId: string;
  accountStatus: UserStatus;
  relationshipStatus: MembershipStatus;
  activationRequired: boolean;
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  reusedExistingUser: boolean;
  idempotent: boolean;
};

export type WorkforceViewerScope = "OWNER" | "MEMBER";

export type WorkforceHospital = {
  id: string;
  hospitalCode: string;
  name: string;
  scope: WorkforceViewerScope;
};

export type WorkforceActivationStatus = "PENDING" | "EXPIRED" | "IN_PROGRESS";

export type WorkforceListRow = {
  id: string;
  userId: string;
  displayName: string;
  kind: WorkforceKind;
  membershipType: MembershipType | null;
  profession: HospitalMemberProvisionInput["profession"] | null;
  relationshipStatus: MembershipStatus;
  accountStatus: UserStatus;
  activationRequired: boolean;
  activationStatus: WorkforceActivationStatus | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  selfRegisteredAt: Date | null;
};

export type WorkforceListResult = {
  hospital: Omit<WorkforceHospital, "scope">;
  viewerScope: WorkforceViewerScope;
  rows: WorkforceListRow[];
  pendingCount: number;
  pageInfo: {
    pageSize: number;
    serverTime: number;
    search: string;
    status: MembershipStatus | null;
    selfRegistration: "ALL" | "SELF_REGISTERED";
    staffCursor: string | null;
    osmCursor: string | null;
    staffNextCursor: string | null;
    osmNextCursor: string | null;
  };
};

export type WorkforceDetail = {
  relationshipId: string;
  userId: string;
  kind: WorkforceDetailKind;
  hospital: {
    id: string;
    hospitalCode: string;
    name: string;
    status: HospitalStatus;
  };
  displayName: string;
  membershipType: MembershipType | null;
  profession: HospitalMemberProvisionInput["profession"] | null;
  relationshipStatus: MembershipStatus;
  accountStatus: UserStatus;
  activationRequired: boolean;
  activationInProgress: boolean;
  activationLinkUsable: boolean;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  currentAssignmentCount: number | null;
  lifecycleBlockReason:
    | "CURRENT_ASSIGNMENTS"
    | "INACTIVE_ACCOUNT"
    | "MISSING_OSM_ROLE"
    | "INACTIVE_HOSPITAL"
    | "INVALID_RELATIONSHIP_STATE"
    | null;
  relationshipUpdatedAt: Date;
  ownerGovernance: {
    canPromote: boolean;
    canDemote: boolean;
  };
  /** E1: staff MEMBER only; null for OWNER and OSM relationships. */
  reportExportGrant: { granted: boolean; canGrant: boolean; canRevoke: boolean } | null;
  /** ADR-0016: staff MEMBER of a network PARENT only; null otherwise. */
  networkPatientReadGrant: { granted: boolean; canGrant: boolean; canRevoke: boolean } | null;
  viewerScope: WorkforceViewerScope;
  actions: {
    updateProfession: boolean;
    suspend: boolean;
    restore: boolean;
    resetPassword: boolean;
  };
};

export type WorkforceMembershipMutationResult = {
  relationshipId: string;
  hospitalId: string;
  membershipStatus: MembershipStatus;
  profession: HospitalMemberProvisionInput["profession"] | null;
  updatedAt: Date;
};

export type WorkforceOsmRelationshipMutationResult = {
  relationshipId: string;
  hospitalId: string;
  relationshipStatus: MembershipStatus;
  updatedAt: Date;
};

export type WorkforceReportExportGrantMutationResult = {
  relationshipId: string;
  hospitalId: string;
  granted: boolean;
  updatedAt: Date;
};

export type WorkforceOwnerGovernanceMutationResult = {
  relationshipId: string;
  hospitalId: string;
  membershipType: MembershipType;
  updatedAt: Date;
};

type WorkforceIdentity = {
  personId: string;
  userId: string;
  userStatus: UserStatus;
  authSubject: string | null;
  relationshipId: string;
  relationshipStatus: MembershipStatus;
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
  relationshipCreated: boolean;
  relationshipChanged: boolean;
  reusedExistingUser: boolean;
  takeoverTask: CaregiverInvitationTakeoverTask | null;
};

export type WorkforceActivationIssueResult = {
  activationId: string;
  userId: string;
  hospitalId: string;
  kind: WorkforceKind;
  activationToken: string;
  activationExpiresAt: Date;
  activationMode: WorkforceActivationModeValue;
};

type ActivationClaim = {
  activationId: string;
  userId: string;
  claimedAt: Date;
  authSubject: string | null;
};

const DEFAULT_TRANSACTION_RETRIES = 2;
/** First-credential purposes: both set the User's first password and complete exactly one Hospital scope. */
const INITIAL_ACTIVATION_PURPOSES: readonly WorkforceActivationPurpose[] = [
  WorkforceActivationPurpose.ACTIVATION,
  WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING,
];
const FIRST_CREDENTIAL_PURPOSES: readonly WorkforceActivationPurpose[] = [
  ...INITIAL_ACTIVATION_PURPOSES,
  WorkforceActivationPurpose.SELF_REGISTRATION,
];
const workforceActivationSelect = {
  id: true,
  userId: true,
  mode: true,
  purpose: true,
  expiresAt: true,
  claimedAt: true,
  usedAt: true,
  revokedAt: true,
} satisfies Prisma.WorkforceActivationSelect;

const workforceDetailActivationSelect = {
  mode: true,
  expiresAt: true,
  claimedAt: true,
} satisfies Prisma.WorkforceActivationSelect;

const workforceMembershipDetailSelect = {
  id: true,
  userId: true,
  membershipType: true,
  profession: true,
  status: true,
  reportExportGrantedAt: true,
  networkPatientReadGrantedAt: true,
  updatedAt: true,
  hospital: {
    select: {
      id: true,
      hospitalCode: true,
      name: true,
      status: true,
      serviceAreaEligibility: { select: { kind: true } },
    },
  },
  user: {
    select: {
      status: true,
      authSubject: true,
      roles: { select: { role: true } },
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.HospitalMembershipSelect;

const workforceOsmDetailSelect = {
  id: true,
  userId: true,
  status: true,
  updatedAt: true,
  hospital: {
    select: {
      id: true,
      hospitalCode: true,
      name: true,
      status: true,
    },
  },
  user: {
    select: {
      status: true,
      authSubject: true,
      roles: { select: { role: true } },
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.OsmHospitalRelationshipSelect;

export class WorkforceActivationReconciliationError extends InfrastructureError {
  readonly requiresReconciliation = true;

  constructor() {
    super("Workforce activation requires provider reconciliation");
    this.name = "WorkforceActivationReconciliationError";
  }
}

function getDatabase(dependencies: WorkforceServiceDependencies): WorkforceDatabase {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: WorkforceServiceDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  return isKnownRequestError(error, "P2034") || isKnownRequestError(error, "P2002");
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002")) {
    return new ConflictError("The requested workforce state conflicts with existing data");
  }

  if (isKnownRequestError(error, "P2034")) {
    return new ConflictError("The workforce operation conflicted with another request");
  }

  return new InfrastructureError(fallbackMessage);
}

async function runSerializable<T>(
  database: WorkforceDatabase,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  retryLimit: number,
): Promise<T> {
  let retryCount = 0;

  while (true) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!isRetryableTransactionError(error) || retryCount >= retryLimit) {
        throw error;
      }

      retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, 10 * 2 ** retryCount) + Math.floor(Math.random() * 20)));
    }
  }
}

async function assertHospitalActorInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
  allowedMembershipTypes: readonly MembershipType[],
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    actor?.status !== UserStatus.ACTIVE ||
    !actor.roles.some(({ role }) => role === Role.HOSPITAL)
  ) {
    throw new ForbiddenError();
  }

  const actorMembership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId: targetHospitalId,
      membershipType: { in: [...allowedMembershipTypes] },
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!actorMembership) {
    throw new ForbiddenError();
  }
}

export async function assertOwnerInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
): Promise<void> {
  await assertHospitalActorInDatabase(transaction, actorUserId, targetHospitalId, [
    MembershipType.OWNER,
  ]);
}

// Owner-only Hospital administration supersedes ADR-0008 D1.
async function assertWorkforceProvisionerInDatabase(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  targetHospitalId: string,
  _kind: WorkforceKind,
): Promise<void> {
  void _kind;
  await assertHospitalActorInDatabase(
    transaction,
    actorUserId,
    targetHospitalId,
    [MembershipType.OWNER],
  );
}

function assertActorPolicy(
  actor: ActorContext | null | undefined,
  capability: (typeof WORKFORCE_CAPABILITIES)[keyof typeof WORKFORCE_CAPABILITIES],
  targetHospitalId: string,
): void {
  assertWorkforcePolicy({ actor, capability, targetHospitalId });
}

function assertUserAccountCanReceiveWorkforce(user: {
  status: UserStatus;
  authSubject: string | null;
}): void {
  if (user.status === UserStatus.ACTIVE) {
    if (!user.authSubject || !zUuid(user.authSubject)) {
      throw new ConflictError("The existing account has an invalid authentication mapping");
    }

    return;
  }

  if (user.status === UserStatus.PROVISIONED && !user.authSubject) {
    return;
  }

  throw new ConflictError("The existing account requires reconciliation before workforce use");
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function toWorkforceActivationMode(mode: WorkforceActivationMode): WorkforceActivationModeValue {
  return mode === WorkforceActivationMode.ASSISTED ? "ASSISTED" : "REMOTE";
}

async function findCurrentActivation(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<Prisma.WorkforceActivationGetPayload<{ select: typeof workforceActivationSelect }> | null> {
  return transaction.workforceActivation.findFirst({
    where: {
      userId,
      purpose: { in: [...INITIAL_ACTIVATION_PURPOSES] },
      usedAt: null,
      revokedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: workforceActivationSelect,
  });
}

async function assertInitialCredentialStateInDatabase(
  transaction: Prisma.TransactionClient,
  userId: string,
  permittedClaimId?: string,
): Promise<void> {
  const unsafe = await transaction.workforceActivation.findFirst({ where: {
    userId, purpose: { in: [...FIRST_CREDENTIAL_PURPOSES] },
    ...(permittedClaimId ? { id: { not: permittedClaimId } } : {}),
    OR: [{ claimedAt: { not: null }, usedAt: null }, { usedAt: { not: null } }],
  }, select: { id: true, claimedAt: true, usedAt: true } });
  if (unsafe?.claimedAt && !unsafe.usedAt) throw new ConflictError(IN_USE_ACTIVATION_MESSAGE);
  if (unsafe) throw new ConflictError("Initial credential state requires reconciliation before reuse");
}

async function issueInitialActivation(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    createdByUserId: string;
    hospitalId: string;
    relationshipId: string;
    kind: WorkforceKind;
    now: Date;
    dependencies: WorkforceServiceDependencies;
  },
): Promise<{
  activationToken: string | null;
  activationExpiresAt: Date | null;
  activationMode: WorkforceActivationModeValue | null;
}> {
  await assertInitialCredentialStateInDatabase(transaction, input.userId);
  const existing = await findCurrentActivation(transaction, input.userId);

  if (existing) {
    return {
      activationToken: null,
      activationExpiresAt: existing.expiresAt,
      activationMode: toWorkforceActivationMode(existing.mode),
    };
  }

  const credential = (input.dependencies.generateCredential ??
    generateWorkforceActivationCredential)();
  const mode = WorkforceActivationMode.REMOTE;
  const expiresAt = getWorkforceActivationExpiry(input.now, "REMOTE");
  const activation = await transaction.workforceActivation.create({
    data: {
      userId: input.userId,
      tokenHash: credential.tokenHash,
      mode,
      expiresAt,
      createdByUserId: input.createdByUserId,
      hospitalId: input.hospitalId, relationshipId: input.relationshipId, relationshipKind: input.kind,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.createdByUserId,
      action: "workforce_activation.issued",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: {
        mode,
        status: UserStatus.PROVISIONED,
        source: "workforce_provisioning",
      },
    },
    transaction,
  );

  return {
    activationToken: credential.plaintextToken,
    activationExpiresAt: expiresAt,
    activationMode: "REMOTE",
  };
}

export type ChildOwnerActivationIssue = {
  activationId: string;
  activationToken: string;
  activationExpiresAt: Date;
  activationMode: WorkforceActivationModeValue;
};

/**
 * ADR-0018 (O-D6): the workforce activation credential for a pending (PROVISIONED) Child OWNER membership. Same
 * hash-only token, national-ID check, failure limit and single-use claim as staff activation; only the purpose,
 * context kind and REMOTE TTL differ. An unclaimed credential already issued for this membership is revoked first.
 */
export async function issueChildOwnerActivation(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    createdByUserId: string;
    childHospitalId: string;
    membershipId: string;
    mode: WorkforceActivationModeValue;
    now: Date;
    source: "child_owner_invitation" | "explicit_regeneration";
    generateCredential?: ActivationCredentialGenerator;
  },
): Promise<ChildOwnerActivationIssue> {
  await assertInitialCredentialStateInDatabase(transaction, input.userId);
  const current = await transaction.workforceActivation.findFirst({
    where: { userId: input.userId, usedAt: null, revokedAt: null },
    select: { id: true, purpose: true, relationshipId: true, claimedAt: true },
  });

  if (current) {
    if (current.purpose !== WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING || current.relationshipId !== input.membershipId) {
      throw new ConflictError(CROSS_HOSPITAL_PENDING_MESSAGE);
    }

    await revokeUnclaimedActivation(transaction, current, { actorUserId: input.createdByUserId, now: input.now, source: input.source });
  }

  const credential = (input.generateCredential ?? generateWorkforceActivationCredential)();
  const mode = toPrismaActivationMode(input.mode);
  const expiresAt = getWorkforceActivationExpiry(input.now, input.mode, WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING);
  const activation = await transaction.workforceActivation.create({
    data: {
      userId: input.userId,
      tokenHash: credential.tokenHash,
      mode,
      purpose: WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING,
      expiresAt,
      createdByUserId: input.createdByUserId,
      hospitalId: input.childHospitalId,
      relationshipId: input.membershipId,
      relationshipKind: CHILD_OWNER_RELATIONSHIP_KIND,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.createdByUserId,
      action: "workforce_activation.issued",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: { mode, status: UserStatus.PROVISIONED, source: input.source },
    },
    transaction,
  );

  return { activationId: activation.id, activationToken: credential.plaintextToken, activationExpiresAt: expiresAt, activationMode: input.mode };
}

async function revokeUnclaimedActivation(
  transaction: Prisma.TransactionClient,
  activation: { id: string; claimedAt: Date | null },
  input: { actorUserId: string; now: Date; source: string },
): Promise<void> {
  if (activation.claimedAt) {
    throw new ConflictError(IN_USE_ACTIVATION_MESSAGE);
  }

  const revoked = await transaction.workforceActivation.updateMany({
    where: { id: activation.id, claimedAt: null, usedAt: null, revokedAt: null },
    data: { revokedAt: input.now },
  });

  if (revoked.count !== 1) {
    throw new ConflictError("The activation credential changed during revocation");
  }

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: "workforce_activation.revoked",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: { source: input.source },
    },
    transaction,
  );
}

/** Revokes the unclaimed Child OWNER credential of this membership, if any. A claimed credential is a conflict. */
export async function revokeChildOwnerActivation(
  transaction: Prisma.TransactionClient,
  input: { membershipId: string; actorUserId: string; now: Date; source: string },
): Promise<boolean> {
  const current = await transaction.workforceActivation.findFirst({
    where: {
      relationshipId: input.membershipId,
      purpose: WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING,
      usedAt: null,
      revokedAt: null,
    },
    select: { id: true, claimedAt: true },
  });

  if (!current) {
    return false;
  }

  await revokeUnclaimedActivation(transaction, current, input);
  return true;
}

async function ensureHospitalMembership(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    hospitalId: string;
    profession: HospitalMemberProvisionInput["profession"];
    userStatus: UserStatus;
  },
): Promise<{
  id: string;
  status: MembershipStatus;
  created: boolean;
  changed: boolean;
}> {
  const existing = await transaction.hospitalMembership.findFirst({ where: { userId: input.userId,
        hospitalId: input.hospitalId, status: { not: "ENDED" } },
    select: {
      id: true,
      membershipType: true,
      profession: true,
      status: true,
    },
  });

  const expectedStatus =
    input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PROVISIONED;

  if (!existing) {
    const created = await transaction.hospitalMembership.create({
      data: {
        userId: input.userId,
        hospitalId: input.hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: input.profession,
        status: expectedStatus,
      },
      select: { id: true, status: true },
    });

    return { ...created, created: true, changed: true };
  }

  if (existing.membershipType === MembershipType.OWNER) {
    throw new ConflictError("An existing Hospital Owner membership cannot be downgraded");
  }

  if (existing.profession && existing.profession !== input.profession) {
    throw new ConflictError("The existing Hospital membership has a different profession");
  }

  if (
    existing.status === MembershipStatus.INVITED ||
    existing.status === MembershipStatus.SUSPENDED
  ) {
    throw new ConflictError("The existing Hospital membership is not available for reuse");
  }

  if (existing.status === MembershipStatus.ACTIVE && input.userStatus !== UserStatus.ACTIVE) {
    throw new ConflictError("The existing Hospital membership is active before the account");
  }

  const nextStatus =
    existing.status === MembershipStatus.PROVISIONED && input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : existing.status;
  const nextProfession = existing.profession ?? input.profession;
  const changed = nextStatus !== existing.status || nextProfession !== existing.profession;

  if (!changed) {
    return {
      id: existing.id,
      status: existing.status,
      created: false,
      changed: false,
    };
  }

  const updated = await transaction.hospitalMembership.update({
    where: { id: existing.id },
    data: {
      profession: nextProfession,
      status: nextStatus,
    },
    select: { id: true, status: true },
  });

  return { ...updated, created: false, changed: true };
}

async function ensureOsmRelationship(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    hospitalId: string;
    userStatus: UserStatus;
  },
): Promise<{
  id: string;
  status: MembershipStatus;
  created: boolean;
  changed: boolean;
}> {
  const existing = await transaction.osmHospitalRelationship.findFirst({ where: { userId: input.userId,
        hospitalId: input.hospitalId, status: { not: "ENDED" } },
    select: { id: true, status: true },
  });

  const expectedStatus =
    input.userStatus === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PROVISIONED;

  if (!existing) {
    const created = await transaction.osmHospitalRelationship.create({
      data: {
        userId: input.userId,
        hospitalId: input.hospitalId,
        status: expectedStatus,
      },
      select: { id: true, status: true },
    });

    return { ...created, created: true, changed: true };
  }

  if (
    existing.status === MembershipStatus.INVITED ||
    existing.status === MembershipStatus.SUSPENDED
  ) {
    throw new ConflictError("The existing OSM relationship is not available for reuse");
  }

  if (existing.status === MembershipStatus.ACTIVE && input.userStatus !== UserStatus.ACTIVE) {
    throw new ConflictError("The existing OSM relationship is active before the account");
  }

  if (existing.status === MembershipStatus.PROVISIONED && input.userStatus === UserStatus.ACTIVE) {
    const updated = await transaction.osmHospitalRelationship.update({
      where: { id: existing.id },
      data: { status: MembershipStatus.ACTIVE },
      select: { id: true, status: true },
    });

    return { ...updated, created: false, changed: true };
  }

  return { ...existing, created: false, changed: false };
}

async function assertActivationTargetRelationship(
  transaction: Prisma.TransactionClient,
  request: WorkforceActivationRequestInput,
): Promise<void> {
  if (request.kind === "OSM") {
    const relationship = await transaction.osmHospitalRelationship.findFirst({ where: { userId: request.userId,
          hospitalId: request.targetHospitalId, status: { not: "ENDED" } },
      select: { status: true },
    });

    if (!relationship || relationship.status !== MembershipStatus.PROVISIONED) {
      throw new ConflictError("The OSM relationship is not awaiting activation");
    }

    return;
  }

  const membership = await transaction.hospitalMembership.findFirst({ where: { userId: request.userId,
        hospitalId: request.targetHospitalId, status: { not: "ENDED" } },
    select: { membershipType: true, status: true },
  });

  if (
    !membership ||
    membership.membershipType !== MembershipType.MEMBER ||
    membership.status !== MembershipStatus.PROVISIONED
  ) {
    throw new ConflictError("The Hospital membership is not awaiting activation");
  }
}

async function assertTargetUserCanReceiveWorkforce(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const adminRole = await transaction.userRole.findUnique({
    where: {
      userId_role: {
        userId,
        role: Role.ADMIN,
      },
    },
    select: { userId: true },
  });

  if (adminRole) {
    throw new ConflictError("The existing account requires explicit reconciliation");
  }
}

const PATIENT_IDENTITY_CREDENTIAL_MESSAGE =
  "บัญชีนี้เป็นบัญชีผู้ป่วยที่ยังไม่ได้เปิดใช้งาน จึงไม่สามารถเพิ่มสิทธิ์บุคลากรหรือออกลิงก์เปิดใช้งานบุคลากรได้ ผู้ป่วยต้องเปิดใช้งานบัญชีของตนเองก่อน";
const CROSS_HOSPITAL_PENDING_MESSAGE =
  "บัญชีนี้มีสิทธิ์บุคลากรที่รอเปิดใช้งานในโรงพยาบาลอื่นอยู่แล้ว จึงยังเพิ่มสิทธิ์ในโรงพยาบาลนี้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบก่อน";

/**
 * The first password is global to the User, not scoped to one role. A workforce issuer knows the national ID and
 * holds the activation token, so an unactivated PATIENT identity must never receive its first credential here.
 */
async function assertNoUnactivatedPatientIdentity(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const patientIdentity = await transaction.user.findFirst({
    where: {
      id: userId,
      OR: [{ roles: { some: { role: Role.PATIENT } } }, { person: { patientProfile: { isNot: null } } }],
    },
    select: { id: true },
  });

  if (patientIdentity) throw new ConflictError(PATIENT_IDENTITY_CREDENTIAL_MESSAGE);
}

/**
 * Initial activation completes one Hospital scope only. A PROVISIONED User with pending workforce state in another
 * Hospital (relationship or unresolved activation) must not gain more, or the activation path becomes unusable.
 */
async function assertSingleHospitalPendingScope(
  transaction: Prisma.TransactionClient,
  userId: string,
  hospitalId: string,
): Promise<void> {
  const [membership, osm, activation] = await Promise.all([
    transaction.hospitalMembership.findFirst({
      where: { userId, status: MembershipStatus.PROVISIONED, hospitalId: { not: hospitalId } }, select: { id: true },
    }),
    transaction.osmHospitalRelationship.findFirst({
      where: { userId, status: MembershipStatus.PROVISIONED, hospitalId: { not: hospitalId } }, select: { id: true },
    }),
    transaction.workforceActivation.findFirst({
      where: {
        userId, purpose: { in: [...INITIAL_ACTIVATION_PURPOSES] }, usedAt: null, revokedAt: null,
        OR: [{ hospitalId: null }, { hospitalId: { not: hospitalId } }],
      },
      select: { id: true },
    }),
  ]);

  if (membership || osm || activation) throw new ConflictError(CROSS_HOSPITAL_PENDING_MESSAGE);
}

export type WorkforceGrantee = {
  personId: string;
  user: { id: string; personId: string; status: UserStatus; authSubject: string | null; identityAssurance: IdentityAssurance };
  reusedExistingUser: boolean;
};

/**
 * Resolves the canonical Person and User behind a national ID for a workforce grant in one Hospital, creating a
 * PROVISIONED User when none exists, and fails closed on every account state workforce provisioning refuses.
 * The caller has already authorised the grant; nothing is granted here.
 */
export async function resolveWorkforceGrantee(
  transaction: Prisma.TransactionClient,
  input: { hospitalId: string; nationalId: string; givenName: string; familyName: string },
): Promise<WorkforceGrantee> {
  const person = await resolvePerson(
    {
      identity: {
        namespace: "thai-national-id",
        value: input.nationalId,
      },
      givenName: input.givenName,
      familyName: input.familyName,
    },
    createIdentityStore(transaction),
  );

  let user = await transaction.user.findUnique({
    where: { personId: person.id },
    select: {
      id: true,
      personId: true,
      status: true,
      authSubject: true,
      identityAssurance: true,
    },
  });
  const reusedExistingUser = user !== null;

  if (!user) {
    user = await transaction.user.create({
      data: {
        personId: person.id,
        status: UserStatus.PROVISIONED,
      },
      select: {
        id: true,
        personId: true,
        status: true,
        authSubject: true,
        identityAssurance: true,
      },
    });
  }

  await assertTargetUserCanReceiveWorkforce(transaction, user.id);
  assertUserAccountCanReceiveWorkforce(user);

  if (user.status === UserStatus.PROVISIONED) {
    // Resolved from the canonical Person, so a newly created User for a Person that already owns a PatientProfile is refused too.
    await assertNoUnactivatedPatientIdentity(transaction, user.id);
    await assertSingleHospitalPendingScope(transaction, user.id, input.hospitalId);
  }

  // Do not grant workforce authority while an existing Patient recovery may be changing this global credential.
  const inFlightRecovery = await transaction.accountRecovery.findFirst({
    where: { targetUserId: user.id, claimedAt: { not: null }, completedAt: null },
    select: { id: true },
  });
  if (inFlightRecovery) throw new ConflictError("Account recovery must be reconciled before workforce provisioning");
  const ambiguousReset = await transaction.workforceActivation.findFirst({
    where: { userId: user.id, ...unreconciledWorkforceResetWhere }, select: { id: true },
  });
  if (ambiguousReset) throw new ConflictError("Global credential recovery must be reconciled before workforce provisioning");

  return { personId: person.id, user, reusedExistingUser };
}

async function createOrReuseWorkforceIdentity(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    kind: WorkforceKind;
    hospitalId: string;
    nationalId: string;
    givenName: string;
    familyName: string;
    profession: HospitalMemberProvisionInput["profession"] | null;
    now: Date;
    dependencies: WorkforceServiceDependencies;
    issueInitialActivation: boolean;
  },
): Promise<WorkforceIdentity> {
  await assertWorkforceProvisionerInDatabase(
    transaction,
    input.actorUserId,
    input.hospitalId,
    input.kind,
  );

  const { personId, user, reusedExistingUser } = await resolveWorkforceGrantee(transaction, input);

  await transaction.userRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
      },
    },
    update: {},
    create: {
      userId: user.id,
      role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
    },
  });

  const relationship =
    input.kind === "OSM"
      ? await ensureOsmRelationship(transaction, {
          userId: user.id,
          hospitalId: input.hospitalId,
          userStatus: user.status,
        })
      : await ensureHospitalMembership(transaction, {
          userId: user.id,
          hospitalId: input.hospitalId,
          profession: input.profession!,
          userStatus: user.status,
        });

  if (relationship.created || relationship.changed) {
    await recordAuditEvent(
      {
        actorUserId: input.actorUserId,
        action:
          input.kind === "OSM"
            ? "osm_relationship.provisioned"
            : "hospital_membership.provisioned",
        resourceType: input.kind === "OSM" ? "OsmHospitalRelationship" : "HospitalMembership",
        resourceId: relationship.id,
        metadata: {
          role: input.kind === "OSM" ? Role.OSM : Role.HOSPITAL,
          profession: input.profession,
          status: relationship.status,
        },
      },
      transaction,
    );
  }

  const activation =
    input.issueInitialActivation && user.status === UserStatus.PROVISIONED
      ? await issueInitialActivation(transaction, {
          userId: user.id,
          createdByUserId: input.actorUserId,
          hospitalId: input.hospitalId, relationshipId: relationship.id, kind: input.kind,
          now: input.now,
          dependencies: input.dependencies,
        })
      : {
          activationToken: null,
          activationExpiresAt: null,
          activationMode: null,
        };

  const takeoverTask = await lockCaregiverInvitationIdentityInTransaction(transaction, {
    userId: user.id,
    actorUserId: input.actorUserId,
    hospitalId: input.hospitalId,
    now: input.now,
  });

  return {
    personId,
    userId: user.id,
    userStatus: takeoverTask ? UserStatus.SUSPENDED : user.status,
    authSubject: user.authSubject,
    relationshipId: relationship.id,
    relationshipStatus: takeoverTask ? MembershipStatus.SUSPENDED : relationship.status,
    activationToken: activation.activationToken,
    activationExpiresAt: activation.activationExpiresAt,
    activationMode: activation.activationMode,
    relationshipCreated: relationship.created,
    relationshipChanged: relationship.changed,
    reusedExistingUser,
    takeoverTask,
  };
}

function toProvisioningResult(
  kind: WorkforceKind,
  identity: WorkforceIdentity,
): WorkforceProvisioningResult {
  return {
    kind,
    userId: identity.userId,
    personId: identity.personId,
    hospitalId: "",
    relationshipId: identity.relationshipId,
    accountStatus: identity.userStatus,
    relationshipStatus: identity.relationshipStatus,
    activationRequired: identity.userStatus === UserStatus.PROVISIONED,
    activationToken: identity.activationToken,
    activationExpiresAt: identity.activationExpiresAt,
    activationMode: identity.activationMode,
    reusedExistingUser: identity.reusedExistingUser,
    idempotent: !identity.relationshipCreated && !identity.relationshipChanged,
  };
}

async function provisionWorkforce(
  actor: ActorContext | null | undefined,
  kind: WorkforceKind,
  input: HospitalMemberProvisionInput | OsmProvisionInput,
  dependencies: WorkforceServiceDependencies,
  options: WorkforceProvisionOptions = {},
): Promise<WorkforceProvisioningResult> {
  const database = getDatabase(dependencies);
  const targetHospitalId = input.targetHospitalId;
  const capability =
    kind === "OSM" ? WORKFORCE_CAPABILITIES.osmProvision : WORKFORCE_CAPABILITIES.create;

  assertActorPolicy(actor, capability, targetHospitalId);

  try {
    const identity = await runSerializable(
      database,
      (transaction) =>
        createOrReuseWorkforceIdentity(transaction, {
          actorUserId: actor!.userId,
          kind,
          hospitalId: targetHospitalId,
          nationalId: input.nationalId,
          givenName: input.givenName,
          familyName: input.familyName,
          profession:
            kind === "OSM" || !("profession" in input) ? null : input.profession,
          now: getNow(dependencies),
          dependencies,
          issueInitialActivation: options.issueInitialActivation !== false,
        }),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    if (identity.takeoverTask) {
      await revokeCaregiverInvitationTakeoverSessionsAfterCommit(database, identity.takeoverTask, {
        revokeProviderSessions: dependencies.revokeProviderSessions,
      });
    }

    return {
      ...toProvisioningResult(kind, identity),
      hospitalId: targetHospitalId,
    };
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Workforce provisioning could not be completed");
  }
}

export async function provisionHospitalMember(
  actor: ActorContext | null | undefined,
  input: HospitalMemberProvisionInput,
  dependencies: WorkforceServiceDependencies = {},
  options: WorkforceProvisionOptions = {},
): Promise<WorkforceProvisioningResult> {
  const parsed = hospitalMemberProvisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital member data is invalid");
  }

  return provisionWorkforce(actor, "HOSPITAL_MEMBER", parsed.data, dependencies, options);
}

export async function provisionOsm(
  actor: ActorContext | null | undefined,
  input: OsmProvisionInput,
  dependencies: WorkforceServiceDependencies = {},
  options: WorkforceProvisionOptions = {},
): Promise<WorkforceProvisioningResult> {
  const parsed = osmProvisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("OSM data is invalid");
  }

  return provisionWorkforce(actor, "OSM", parsed.data, dependencies, options);
}

export async function listWorkforceHospitals(
  actor: ActorContext | null | undefined,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceHospital[]> {
  if (!actor?.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }

  try {
    const currentActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: { status: true, roles: { select: { role: true } } },
    });

    if (
      currentActor?.status !== UserStatus.ACTIVE ||
      !currentActor.roles.some(({ role }) => role === Role.HOSPITAL)
    ) {
      throw new ForbiddenError();
    }

    // Only direct OWNER Hospitals are workforce management contexts.
    const hospitals = await database.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor.userId,
            membershipType: MembershipType.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }],
      select: {
        id: true,
        hospitalCode: true,
        name: true,
        memberships: {
          where: { userId: actor.userId, status: MembershipStatus.ACTIVE },
          select: { membershipType: true },
        },
      },
    });

    return hospitals.map(({ memberships, ...hospital }) => ({
      ...hospital,
      scope: memberships.some(({ membershipType }) => membershipType === MembershipType.OWNER)
        ? ("OWNER" as const)
        : ("MEMBER" as const),
    }));
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Workforce Hospital scope could not be loaded");
  }
}

function toDisplayName(givenName: string | null, familyName: string | null): string {
  return [givenName, familyName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ";
}

type WorkforceMembershipDetailRecord = Prisma.HospitalMembershipGetPayload<{
  select: typeof workforceMembershipDetailSelect;
}>;

type WorkforceOsmDetailRecord = Prisma.OsmHospitalRelationshipGetPayload<{
  select: typeof workforceOsmDetailSelect;
}>;

function activeHospitalActorWhere(
  actorUserId: string,
  membershipTypes: readonly MembershipType[],
): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actorUserId,
        membershipType: { in: [...membershipTypes] },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

async function countEligibleOwners(
  database: WorkforceDatabase,
  hospitalId: string,
): Promise<number> {
  return database.hospitalMembership.count({
    where: {
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      user: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.HOSPITAL } },
      },
    },
  });
}

async function findDetailActivation(
  database: WorkforceDatabase,
  userId: string,
): Promise<Prisma.WorkforceActivationGetPayload<{
  select: typeof workforceDetailActivationSelect;
}> | null> {
  return database.workforceActivation.findFirst({
    where: {
      userId,
      purpose: WorkforceActivationPurpose.ACTIVATION,
      usedAt: null,
      revokedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: workforceDetailActivationSelect,
  });
}

function toWorkforceDetailActions(input: {
  kind: WorkforceDetailKind;
  viewerScope: WorkforceViewerScope;
  isSelf: boolean;
  hasAuthSubject: boolean;
  membershipType: MembershipType | null;
  accountStatus: UserStatus;
  relationshipStatus: MembershipStatus;
  hospitalStatus: HospitalStatus;
  hasOsmRole: boolean;
  currentAssignmentCount: number | null;
}): WorkforceDetail["actions"] {
  // MEMBER is read-only for OSM: no lifecycle or reset controls (ADR-0008 amendment, D1).
  if (input.viewerScope !== "OWNER") {
    return { updateProfession: false, suspend: false, restore: false, resetPassword: false };
  }

  const canManageStaff =
    input.kind === "staff" &&
    input.membershipType === MembershipType.MEMBER &&
    input.accountStatus === UserStatus.ACTIVE &&
    input.hospitalStatus === HospitalStatus.ACTIVE;
  const canManageOsm =
    input.kind === "osm" &&
    input.hasOsmRole &&
    input.accountStatus === UserStatus.ACTIVE &&
    input.hospitalStatus === HospitalStatus.ACTIVE &&
    input.currentAssignmentCount === 0;

  return {
    updateProfession: canManageStaff && input.relationshipStatus === MembershipStatus.ACTIVE,
    suspend:
      (canManageStaff || canManageOsm) && input.relationshipStatus === MembershipStatus.ACTIVE,
    restore:
      (canManageStaff || canManageOsm) && input.relationshipStatus === MembershipStatus.SUSPENDED,
    // Hospital authority is not independent proof of global credential ownership.
    resetPassword: false,
  };
}

function toWorkforceLifecycleBlockReason(input: {
  kind: WorkforceDetailKind;
  accountStatus: UserStatus;
  relationshipStatus: MembershipStatus;
  hospitalStatus: HospitalStatus;
  hasOsmRole: boolean;
  currentAssignmentCount: number | null;
}): WorkforceDetail["lifecycleBlockReason"] {
  if (input.kind !== "osm") {
    return null;
  }

  if (input.accountStatus !== UserStatus.ACTIVE) {
    return "INACTIVE_ACCOUNT";
  }

  if (input.hospitalStatus !== HospitalStatus.ACTIVE) {
    return "INACTIVE_HOSPITAL";
  }

  if (!input.hasOsmRole) {
    return "MISSING_OSM_ROLE";
  }

  if (input.currentAssignmentCount !== null && input.currentAssignmentCount > 0) {
    return "CURRENT_ASSIGNMENTS";
  }

  if (
    input.relationshipStatus !== MembershipStatus.ACTIVE &&
    input.relationshipStatus !== MembershipStatus.SUSPENDED
  ) {
    return "INVALID_RELATIONSHIP_STATE";
  }

  return null;
}

function toReportExportGrantDetail(
  kind: WorkforceDetailKind,
  record: WorkforceMembershipDetailRecord | WorkforceOsmDetailRecord,
  viewerScope: WorkforceViewerScope,
  grant: MembershipGrantKind = "REPORT_EXPORT",
): WorkforceDetail["reportExportGrant"] {
  if (kind !== "staff" || grant === "REPORT_EXPORT") return null;
  const membership = record as WorkforceMembershipDetailRecord;
  if (membership.membershipType !== MembershipType.MEMBER) return null;
  if (grant === "NETWORK_PATIENT_READ" && membership.hospital.serviceAreaEligibility?.kind !== "PARENT") return null;

  const granted = membershipGrantedAt(grant, membership) !== null;
  const isOwnerViewer = viewerScope === "OWNER" && membership.hospital.status === HospitalStatus.ACTIVE;
  return {
    granted,
    canGrant:
      isOwnerViewer && !granted &&
      membership.status === MembershipStatus.ACTIVE && membership.user.status === UserStatus.ACTIVE,
    canRevoke: isOwnerViewer && granted,
  };
}

function toWorkforceDetail(
  kind: WorkforceDetailKind,
  record: WorkforceMembershipDetailRecord | WorkforceOsmDetailRecord,
  activation: Awaited<ReturnType<typeof findDetailActivation>>,
  currentAssignmentCount: number | null,
  eligibleOwnerCount: number | null,
  viewer: { scope: WorkforceViewerScope; userId: string },
): WorkforceDetail {
  const membershipType = kind === "staff" ? (record as WorkforceMembershipDetailRecord).membershipType : null;
  const profession = kind === "staff" ? (record as WorkforceMembershipDetailRecord).profession : null;
  const relationshipStatus = record.status;
  const accountStatus = record.user.status;
  const hasOsmRole =
    kind === "osm"
      ? (record as WorkforceOsmDetailRecord).user.roles.some(({ role }) => role === Role.OSM)
      : true;
  const hasHospitalRole = record.user.roles.some(({ role }) => role === Role.HOSPITAL);
  const targetIsEligibleOwnerGovernanceState =
    kind === "staff" &&
    record.status === MembershipStatus.ACTIVE &&
    accountStatus === UserStatus.ACTIVE &&
    record.hospital.status === HospitalStatus.ACTIVE &&
    hasHospitalRole;

  return {
    relationshipId: record.id,
    userId: record.userId,
    kind,
    hospital: record.hospital,
    displayName: toDisplayName(record.user.person.givenName, record.user.person.familyName),
    membershipType,
    profession,
    relationshipStatus,
    accountStatus,
    activationRequired: relationshipStatus !== MembershipStatus.ENDED && accountStatus === UserStatus.PROVISIONED,
    activationInProgress: Boolean(
      relationshipStatus !== MembershipStatus.ENDED &&
      accountStatus === UserStatus.PROVISIONED &&
      activation?.claimedAt,
    ),
    activationLinkUsable: Boolean(
      relationshipStatus !== MembershipStatus.ENDED &&
      accountStatus === UserStatus.PROVISIONED &&
      activation &&
      !activation.claimedAt &&
      activation.expiresAt > new Date(),
    ),
    activationExpiresAt: activation?.expiresAt ?? null,
    activationMode: activation ? toWorkforceActivationMode(activation.mode) : null,
    currentAssignmentCount: kind === "osm" ? currentAssignmentCount : null,
    lifecycleBlockReason: toWorkforceLifecycleBlockReason({
      kind,
      accountStatus,
      relationshipStatus,
      hospitalStatus: record.hospital.status,
      hasOsmRole,
      currentAssignmentCount,
    }),
    relationshipUpdatedAt: record.updatedAt,
    reportExportGrant: toReportExportGrantDetail(kind, record, viewer.scope),
    networkPatientReadGrant: toReportExportGrantDetail(kind, record, viewer.scope, "NETWORK_PATIENT_READ"),
    viewerScope: viewer.scope,
    ownerGovernance: {
      canPromote:
        targetIsEligibleOwnerGovernanceState && membershipType === MembershipType.MEMBER,
      canDemote:
        targetIsEligibleOwnerGovernanceState &&
        membershipType === MembershipType.OWNER &&
        (eligibleOwnerCount ?? 0) > 1,
    },
    actions: toWorkforceDetailActions({
      kind,
      viewerScope: viewer.scope,
      isSelf: record.userId === viewer.userId,
      hasAuthSubject: record.user.authSubject !== null,
      membershipType,
      accountStatus,
      relationshipStatus,
      hospitalStatus: record.hospital.status,
      hasOsmRole,
      currentAssignmentCount,
    }),
  };
}

export async function getWorkforceDetail(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceDetail> {
  const parsed = workforceDetailRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Workforce relationship selection is invalid");
  }

  if (!actor?.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }

  try {
    // Workforce management projections require persisted direct OWNER authority.
    const scopedHospital = activeHospitalActorWhere(
      actor.userId,
      [MembershipType.OWNER],
    );
    const record =
      parsed.data.kind === "staff"
        ? await database.hospitalMembership.findFirst({
            where: {
              id: parsed.data.relationshipId,
              hospital: scopedHospital,
            },
            select: workforceMembershipDetailSelect,
          })
        : await database.osmHospitalRelationship.findFirst({
            where: {
              id: parsed.data.relationshipId,
              hospital: scopedHospital,
            },
            select: workforceOsmDetailSelect,
          });

    if (!record) {
      throw new NotFoundError("The workforce relationship was not found");
    }

    const readDecision = decideWorkforcePolicy({
      actor,
      capability:
        parsed.data.kind === "osm" ? WORKFORCE_CAPABILITIES.osmRead : WORKFORCE_CAPABILITIES.read,
      targetHospitalId: record.hospital.id,
    });

    if (!readDecision.allowed) {
      throw new ForbiddenError();
    }

    const viewerScope: WorkforceViewerScope =
      readDecision.reason === "active_hospital_owner" ? "OWNER" : "MEMBER";

    if (parsed.data.kind === "staff") {
      assertHospitalOwnerPolicy({
        actor,
        capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance,
        targetHospitalId: record.hospital.id,
      });
    }

    const [activation, currentAssignmentCount, eligibleOwnerCount] = await Promise.all([
      findDetailActivation(database, record.userId),
      parsed.data.kind === "osm"
        ? countCurrentAssignmentsForOsmInHospital(database, {
            osmUserId: record.userId,
            hospitalId: record.hospital.id,
        })
        : Promise.resolve(null),
      parsed.data.kind === "staff"
        ? countEligibleOwners(database, record.hospital.id)
        : Promise.resolve(null),
    ]);
    return toWorkforceDetail(
      parsed.data.kind,
      record,
      activation,
      currentAssignmentCount,
      eligibleOwnerCount,
      { scope: viewerScope, userId: actor.userId },
    );
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Workforce relationship detail could not be loaded");
  }
}

export async function listWorkforce(
  actor: ActorContext | null | undefined,
  input: WorkforceListInput,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceListResult> {
  const parsed = workforceListSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Workforce Hospital selection is invalid");
  }

  const pageSize = parsed.data.pageSize ?? 25;
  const staffCursor = readWorkforceCursor(parsed.data.staffCursor, "HOSPITAL_MEMBER", parsed.data);
  const osmCursor = readWorkforceCursor(parsed.data.osmCursor, "OSM", parsed.data);
  const nameFilter: Prisma.PersonWhereInput = {
    AND: (parsed.data.search ?? "").split(/\s+/u).filter(Boolean).map((word) => ({ OR: [
      { givenName: { contains: word, mode: "insensitive" } },
      { familyName: { contains: word, mode: "insensitive" } },
    ] })),
  };
  const pageWhere = (cursor: { createdAt: Date; id: string } | null) => ({
    status: parsed.data.status,
    ...(parsed.data.selfRegistration === "SELF_REGISTERED" ? { selfRegisteredAt: { not: null } } : {}),
    user: { person: nameFilter },
    ...(cursor ? { OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ] } : {}),
  });

  const readDecision = decideWorkforcePolicy({
    actor,
    capability: WORKFORCE_CAPABILITIES.osmRead,
    targetHospitalId: parsed.data.targetHospitalId,
  });

  if (!readDecision.allowed) {
    throw new ForbiddenError();
  }

  const viewerScope: WorkforceViewerScope =
    readDecision.reason === "active_hospital_owner" ? "OWNER" : "MEMBER";

  try {
    const hospital = await database.hospital.findFirst({
      where: {
        id: parsed.data.targetHospitalId,
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor!.userId,
            membershipType:
              viewerScope === "OWNER" ? MembershipType.OWNER : MembershipType.MEMBER,
            status: MembershipStatus.ACTIVE,
            user: {
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.HOSPITAL } },
            },
          },
        },
      },
      select: { id: true, hospitalCode: true, name: true },
    });

    if (!hospital) {
      throw new NotFoundError("The selected Hospital was not found");
    }

    const [staffPage, osmPage, pendingStaffCount, pendingOsmCount] = await Promise.all([
      // A MEMBER never receives the staff roster.
      viewerScope === "MEMBER"
        ? Promise.resolve([])
        : database.hospitalMembership.findMany({
            where: { hospitalId: hospital.id, ...pageWhere(staffCursor) },
            take: pageSize + 1,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              createdAt: true,
              userId: true,
              membershipType: true,
              profession: true,
              status: true,
              selfRegisteredAt: true,
              user: {
                select: {
                  status: true,
                  person: { select: { givenName: true, familyName: true } },
                },
              },
            },
          }),
      database.osmHospitalRelationship.findMany({
        where: { hospitalId: hospital.id, ...pageWhere(osmCursor) },
        take: pageSize + 1,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          createdAt: true,
          userId: true,
          status: true,
          selfRegisteredAt: true,
          user: {
            select: {
              status: true,
              person: { select: { givenName: true, familyName: true } },
            },
          },
        },
      }),
      viewerScope === "MEMBER" || parsed.data.status === MembershipStatus.ENDED
        ? Promise.resolve(0)
        : database.hospitalMembership.count({
            where: {
              hospitalId: hospital.id,
              status: parsed.data.status ?? { not: MembershipStatus.ENDED },
              user: { status: UserStatus.PROVISIONED, person: nameFilter },
            },
          }),
      parsed.data.status === MembershipStatus.ENDED
        ? Promise.resolve(0)
        : database.osmHospitalRelationship.count({
            where: {
              hospitalId: hospital.id,
              status: parsed.data.status ?? { not: MembershipStatus.ENDED },
              user: { status: UserStatus.PROVISIONED, person: nameFilter },
            },
          }),
    ]);

    const memberships = staffPage.slice(0, pageSize);
    const osmRelationships = osmPage.slice(0, pageSize);
    const userIds = [...new Set([
      ...memberships.map(({ userId }) => userId),
      ...osmRelationships.map(({ userId }) => userId),
    ])];
    const [activations, claimedActivations] = userIds.length
      ? await Promise.all([database.workforceActivation.findMany({
          where: {
            userId: { in: userIds },
            purpose: WorkforceActivationPurpose.ACTIVATION,
            usedAt: null,
            revokedAt: null,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            userId: true,
            mode: true,
            expiresAt: true,
            claimedAt: true,
          },
        }), database.workforceActivation.groupBy({
          by: ["userId"], where: { userId: { in: userIds }, purpose: WorkforceActivationPurpose.ACTIVATION,
            claimedAt: { not: null }, usedAt: null },
        })])
      : [[], []];
    const claimedUserIds = new Set(claimedActivations.map(({ userId }) => userId));
    // Rows are ordered newest first, so keep the first (latest) activation per user.
    const activationByUserId = new Map<string, (typeof activations)[number]>();

    for (const activation of activations) {
      if (!activationByUserId.has(activation.userId)) {
        activationByUserId.set(activation.userId, activation);
      }
    }

    const now = new Date();
    const toActivationStatus = (
      accountStatus: UserStatus,
      userId: string,
      activation: (typeof activations)[number] | undefined,
    ): WorkforceActivationStatus | null => {
      if (accountStatus !== UserStatus.PROVISIONED) {
        return null;
      }

      if (claimedUserIds.has(userId)) return "IN_PROGRESS";
      return activation && activation.expiresAt > now ? "PENDING" : "EXPIRED";
    };

    const rows: WorkforceListRow[] = [
      ...memberships.map((membership) => {
        const activation = activationByUserId.get(membership.userId);
        return {
          id: membership.id,
          userId: membership.userId,
          displayName: toDisplayName(
            membership.user.person.givenName,
            membership.user.person.familyName,
          ),
          kind: "HOSPITAL_MEMBER" as const,
          membershipType: membership.membershipType,
          profession: membership.profession,
          relationshipStatus: membership.status,
          accountStatus: membership.user.status,
          activationRequired: membership.status !== MembershipStatus.ENDED && membership.user.status === UserStatus.PROVISIONED,
          activationStatus: toActivationStatus(membership.user.status, membership.userId, activation),
          activationExpiresAt: activation?.expiresAt ?? null,
          activationMode: activation ? toWorkforceActivationMode(activation.mode) : null,
          selfRegisteredAt: membership.selfRegisteredAt,
        };
      }),
      ...osmRelationships.map((relationship) => {
        const activation = activationByUserId.get(relationship.userId);
        return {
          id: relationship.id,
          userId: relationship.userId,
          displayName: toDisplayName(
            relationship.user.person.givenName,
            relationship.user.person.familyName,
          ),
          kind: "OSM" as const,
          membershipType: null,
          profession: null,
          relationshipStatus: relationship.status,
          accountStatus: relationship.user.status,
          activationRequired: relationship.status !== MembershipStatus.ENDED && relationship.user.status === UserStatus.PROVISIONED,
          activationStatus: toActivationStatus(relationship.user.status, relationship.userId, activation),
          activationExpiresAt: activation?.expiresAt ?? null,
          activationMode: activation ? toWorkforceActivationMode(activation.mode) : null,
          selfRegisteredAt: relationship.selfRegisteredAt,
        };
      }),
    ];

    return { hospital, viewerScope, rows, pendingCount: pendingStaffCount + pendingOsmCount, pageInfo: {
      pageSize, serverTime: Date.now(), search: parsed.data.search ?? "", status: parsed.data.status ?? null,
      selfRegistration: parsed.data.selfRegistration ?? "ALL",
      staffCursor: viewerScope === "OWNER" ? parsed.data.staffCursor ?? null : null,
      osmCursor: parsed.data.osmCursor ?? null,
      staffNextCursor: staffPage.length > pageSize ? writeWorkforceCursor(memberships.at(-1), "HOSPITAL_MEMBER", parsed.data) : null,
      osmNextCursor: osmPage.length > pageSize ? writeWorkforceCursor(osmRelationships.at(-1), "OSM", parsed.data) : null,
    } };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Workforce data could not be loaded");
  }
}

type HospitalOwnerGovernanceTarget = {
  id: string;
  userId: string;
  hospitalId: string;
  membershipType: MembershipType;
  status: MembershipStatus;
  updatedAt: Date;
  hospital: { status: HospitalStatus };
  user: {
    status: UserStatus;
    roles: { role: Role }[];
  };
};

const hospitalOwnerGovernanceTargetSelect = {
  id: true,
  userId: true,
  hospitalId: true,
  membershipType: true,
  status: true,
  updatedAt: true,
  hospital: { select: { status: true } },
  user: {
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  },
} satisfies Prisma.HospitalMembershipSelect;

function parseExpectedOwnerGovernanceUpdatedAt(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Hospital Owner membership version is invalid");
  }

  return parsed;
}

async function assertHospitalOwnerGovernanceTarget(
  transaction: Prisma.TransactionClient,
  input: HospitalOwnerGovernanceMutationInput,
  expectedMembershipType: MembershipType,
): Promise<HospitalOwnerGovernanceTarget> {
  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: input.relationshipId,
      hospitalId: input.targetHospitalId,
    },
    select: hospitalOwnerGovernanceTargetSelect,
  });

  if (!membership) {
    throw new NotFoundError("The Hospital membership was not found");
  }

  if (membership.hospital.status !== HospitalStatus.ACTIVE) {
    throw new ConflictError("Owner governance requires an active Hospital");
  }

  if (membership.membershipType !== expectedMembershipType) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  if (membership.status !== MembershipStatus.ACTIVE) {
    throw new ConflictError("The target Hospital membership is not active");
  }

  if (membership.user.status !== UserStatus.ACTIVE) {
    throw new ConflictError("The target account is not active for Owner governance");
  }

  if (!membership.user.roles.some(({ role }) => role === Role.HOSPITAL)) {
    throw new ConflictError("The target account is missing the Hospital role");
  }

  const expectedUpdatedAt = parseExpectedOwnerGovernanceUpdatedAt(input.expectedUpdatedAt);

  if (membership.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  return membership;
}

function toOwnerGovernanceMutationResult(
  membership: Pick<HospitalOwnerGovernanceTarget, "id" | "hospitalId" | "membershipType" | "updatedAt">,
): WorkforceOwnerGovernanceMutationResult {
  return {
    relationshipId: membership.id,
    hospitalId: membership.hospitalId,
    membershipType: membership.membershipType,
    updatedAt: membership.updatedAt,
  };
}

async function promoteHospitalOwnerInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalOwnerGovernanceMutationInput,
  actorUserId: string,
): Promise<WorkforceOwnerGovernanceMutationResult> {
  const current = await assertHospitalOwnerGovernanceTarget(
    transaction,
    input,
    MembershipType.MEMBER,
  );

  const updated = await transaction.hospitalMembership.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      membershipType: MembershipType.MEMBER,
      status: MembershipStatus.ACTIVE,
      updatedAt: current.updatedAt,
    },
    // An OWNER exports and reads the network by role; SQL CHECKs keep both grants MEMBER-only.
    data: {
      membershipType: MembershipType.OWNER,
      reportExportGrantedAt: null,
      reportExportGrantedByUserId: null,
      networkPatientReadGrantedAt: null,
      networkPatientReadGrantedByUserId: null,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const result = await transaction.hospitalMembership.findUnique({
    where: { id: current.id },
    select: { id: true, hospitalId: true, membershipType: true, updatedAt: true },
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital membership could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "hospital_owner.promoted",
      resourceType: "HospitalMembership",
      resourceId: result.id,
      metadata: {
        hospitalId: result.hospitalId,
        targetMembershipId: result.id,
        targetUserId: current.userId,
        fromMembershipType: MembershipType.MEMBER,
        toMembershipType: MembershipType.OWNER,
      },
    },
    transaction,
  );

  return toOwnerGovernanceMutationResult(result);
}

async function demoteHospitalOwnerInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalOwnerGovernanceMutationInput,
  actorUserId: string,
): Promise<WorkforceOwnerGovernanceMutationResult> {
  const current = await assertHospitalOwnerGovernanceTarget(
    transaction,
    input,
    MembershipType.OWNER,
  );

  await assertEligibleOwnerRemains(transaction, current.hospitalId);

  const updated = await transaction.hospitalMembership.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      updatedAt: current.updatedAt,
    },
    data: { membershipType: MembershipType.MEMBER },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const result = await transaction.hospitalMembership.findUnique({
    where: { id: current.id },
    select: { id: true, hospitalId: true, membershipType: true, updatedAt: true },
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital membership could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "hospital_owner.demoted",
      resourceType: "HospitalMembership",
      resourceId: result.id,
      metadata: {
        hospitalId: result.hospitalId,
        targetMembershipId: result.id,
        targetUserId: current.userId,
        fromMembershipType: MembershipType.OWNER,
        toMembershipType: MembershipType.MEMBER,
      },
    },
    transaction,
  );

  return toOwnerGovernanceMutationResult(result);
}

async function executeHospitalOwnerMutation(
  actor: ActorContext | null | undefined,
  input: unknown,
  capability:
    | (typeof HOSPITAL_OWNER_CAPABILITIES.promote)
    | (typeof HOSPITAL_OWNER_CAPABILITIES.demote),
  operation: (
    transaction: Prisma.TransactionClient,
    input: HospitalOwnerGovernanceMutationInput,
    actorUserId: string,
  ) => Promise<WorkforceOwnerGovernanceMutationResult>,
  dependencies: WorkforceServiceDependencies,
): Promise<WorkforceOwnerGovernanceMutationResult> {
  const parsed = hospitalOwnerGovernanceMutationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital Owner governance data is invalid");
  }

  assertHospitalOwnerPolicy({
    actor,
    capability,
    targetHospitalId: parsed.data.targetHospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(transaction, actor.userId, parsed.data.targetHospitalId);
        return operation(transaction, parsed.data, actor.userId);
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital Owner governance operation could not be completed");
  }
}

export async function promoteHospitalOwner(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceOwnerGovernanceMutationResult> {
  return executeHospitalOwnerMutation(
    actor,
    input,
    HOSPITAL_OWNER_CAPABILITIES.promote,
    promoteHospitalOwnerInTransaction,
    dependencies,
  );
}

export async function demoteHospitalOwner(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceOwnerGovernanceMutationResult> {
  return executeHospitalOwnerMutation(
    actor,
    input,
    HOSPITAL_OWNER_CAPABILITIES.demote,
    demoteHospitalOwnerInTransaction,
    dependencies,
  );
}

/** E1 report export (ก-15) and ADR-0016 network Patient read: OWNER-issued, MEMBER-only grants (SQL CHECKs). */
type MembershipGrantKind = "REPORT_EXPORT" | "NETWORK_PATIENT_READ";

const membershipGrantLabels = {
  REPORT_EXPORT: { name: "report export", action: "report_export" },
  NETWORK_PATIENT_READ: { name: "network Patient read", action: "network_patient_read" },
} as const satisfies Record<MembershipGrantKind, { name: string; action: string }>;

function membershipGrantedAt(
  kind: MembershipGrantKind,
  membership: { reportExportGrantedAt: Date | null; networkPatientReadGrantedAt: Date | null },
): Date | null {
  return kind === "REPORT_EXPORT" ? membership.reportExportGrantedAt : membership.networkPatientReadGrantedAt;
}

function membershipGrantWhere(kind: MembershipGrantKind, granted: boolean): Prisma.HospitalMembershipWhereInput {
  const current = granted ? null : { not: null };
  return kind === "REPORT_EXPORT" ? { reportExportGrantedAt: current } : { networkPatientReadGrantedAt: current };
}

function membershipGrantData(
  kind: MembershipGrantKind,
  granted: boolean,
  actorUserId: string,
): Prisma.HospitalMembershipUncheckedUpdateManyInput {
  const at = granted ? new Date() : null;
  const by = granted ? actorUserId : null;
  return kind === "REPORT_EXPORT"
    ? { reportExportGrantedAt: at, reportExportGrantedByUserId: by }
    : { networkPatientReadGrantedAt: at, networkPatientReadGrantedByUserId: by };
}

async function setMembershipGrantInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalMembershipReportExportGrantInput,
  actorUserId: string,
  kind: MembershipGrantKind,
): Promise<WorkforceReportExportGrantMutationResult> {
  const label = membershipGrantLabels[kind];
  const membership = await transaction.hospitalMembership.findFirst({
    where: { id: input.relationshipId, hospitalId: input.targetHospitalId },
    select: {
      id: true,
      userId: true,
      hospitalId: true,
      membershipType: true,
      status: true,
      reportExportGrantedAt: true,
      networkPatientReadGrantedAt: true,
      updatedAt: true,
      user: { select: { status: true } },
    },
  });

  if (!membership) {
    throw new NotFoundError("The Hospital membership was not found");
  }

  if (membership.membershipType !== MembershipType.MEMBER) {
    throw new ConflictError(`Only a MEMBER can hold a ${label.name} grant`);
  }

  if (membership.updatedAt.getTime() !== parseExpectedMembershipUpdatedAt(input.expectedUpdatedAt).getTime()) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  if ((membershipGrantedAt(kind, membership) !== null) === input.granted) {
    throw new ConflictError(`The ${label.name} grant is already in the requested state`);
  }

  if (
    input.granted &&
    (membership.status !== MembershipStatus.ACTIVE || membership.user.status !== UserStatus.ACTIVE)
  ) {
    throw new ConflictError(`A ${label.name} grant requires an active membership and account`);
  }

  const updated = await transaction.hospitalMembership.updateMany({
    where: {
      id: membership.id,
      hospitalId: membership.hospitalId,
      membershipType: MembershipType.MEMBER,
      updatedAt: membership.updatedAt,
      ...membershipGrantWhere(kind, input.granted),
      ...(input.granted ? { status: MembershipStatus.ACTIVE } : {}),
    },
    data: membershipGrantData(kind, input.granted, actorUserId),
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const result = await transaction.hospitalMembership.findUnique({
    where: { id: membership.id },
    select: { id: true, hospitalId: true, reportExportGrantedAt: true, networkPatientReadGrantedAt: true, updatedAt: true },
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital membership could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: `hospital_membership.${label.action}_${input.granted ? "granted" : "revoked"}`,
      resourceType: "HospitalMembership",
      resourceId: result.id,
      metadata: {
        hospitalId: result.hospitalId,
        targetUserId: membership.userId,
        membershipStatus: membership.status,
      },
    },
    transaction,
  );

  return {
    relationshipId: result.id,
    hospitalId: result.hospitalId,
    granted: membershipGrantedAt(kind, result) !== null,
    updatedAt: result.updatedAt,
  };
}

/** Customer decision E1 (ก-15): the Hospital OWNER grants or revokes report export for a MEMBER. */
export async function setHospitalMembershipReportExportGrant(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceReportExportGrantMutationResult> {
  void actor;
  void input;
  void dependencies;
  throw new ForbiddenError("Member report export delegation is no longer supported");
}

/** ADR-0016: the Parent OWNER grants or revokes read-only network Patient access for a Parent MEMBER. */
export async function setHospitalMembershipNetworkPatientReadGrant(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceReportExportGrantMutationResult> {
  const parsed = hospitalMembershipReportExportGrantSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Network Patient read grant data is invalid");
  }

  assertHospitalOwnerPolicy({
    actor,
    capability: HOSPITAL_OWNER_CAPABILITIES.networkPatientReadGrant,
    targetHospitalId: parsed.data.targetHospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(transaction, actor.userId, parsed.data.targetHospitalId);
        return setMembershipGrantInTransaction(transaction, parsed.data, actor.userId, "NETWORK_PATIENT_READ");
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Network Patient read grant could not be changed");
  }
}

type StaffMembershipMutationTarget = {
  id: string;
  userId: string;
  hospitalId: string;
  membershipType: MembershipType;
  profession: HospitalMemberProvisionInput["profession"] | null;
  status: MembershipStatus;
  updatedAt: Date;
  user: { status: UserStatus };
};

const staffMembershipMutationTargetSelect = {
  id: true,
  userId: true,
  hospitalId: true,
  membershipType: true,
  profession: true,
  status: true,
  updatedAt: true,
  user: { select: { status: true } },
} satisfies Prisma.HospitalMembershipSelect;

function parseExpectedMembershipUpdatedAt(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Hospital membership version is invalid");
  }

  return parsed;
}

async function assertStaffMembershipMutationTarget(
  transaction: Prisma.TransactionClient,
  input: HospitalMembershipProfessionUpdateInput | HospitalMembershipTransitionInput,
  expectedStatus: MembershipStatus,
): Promise<StaffMembershipMutationTarget> {
  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: input.relationshipId,
      hospitalId: input.targetHospitalId,
    },
    select: staffMembershipMutationTargetSelect,
  });

  if (!membership) {
    throw new NotFoundError("The Hospital membership was not found");
  }

  if (membership.membershipType !== MembershipType.MEMBER) {
    throw new ConflictError("Hospital Owner memberships cannot be changed by this operation");
  }

  if (membership.user.status !== UserStatus.ACTIVE) {
    throw new ConflictError("The target account is not active for Hospital membership lifecycle");
  }

  if (membership.status !== expectedStatus) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const expectedUpdatedAt = parseExpectedMembershipUpdatedAt(input.expectedUpdatedAt);

  if (membership.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  return membership;
}

function toMembershipMutationResult(
  membership: Pick<StaffMembershipMutationTarget, "id" | "hospitalId" | "profession" | "status" | "updatedAt">,
): WorkforceMembershipMutationResult {
  return {
    relationshipId: membership.id,
    hospitalId: membership.hospitalId,
    membershipStatus: membership.status,
    profession: membership.profession,
    updatedAt: membership.updatedAt,
  };
}

async function updateHospitalMembershipProfessionInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalMembershipProfessionUpdateInput,
  actorUserId: string,
): Promise<WorkforceMembershipMutationResult> {
  const current = await assertStaffMembershipMutationTarget(
    transaction,
    input,
    MembershipStatus.ACTIVE,
  );

  if (current.profession === input.profession) {
    throw new ConflictError("The Hospital membership already has this profession");
  }

  const updated = await transaction.hospitalMembership.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      membershipType: MembershipType.MEMBER,
      status: MembershipStatus.ACTIVE,
      updatedAt: current.updatedAt,
    },
    data: { profession: input.profession },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const result = await transaction.hospitalMembership.findUnique({
    where: { id: current.id },
    select: {
      id: true,
      hospitalId: true,
      profession: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital membership could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "hospital_membership.profession_changed",
      resourceType: "HospitalMembership",
      resourceId: result.id,
      metadata: {
        fromProfession: current.profession,
        toProfession: result.profession,
      },
    },
    transaction,
  );

  return toMembershipMutationResult(result);
}

type HospitalMembershipStatusTransition = {
  capability: (typeof WORKFORCE_CAPABILITIES)["suspend"] | (typeof WORKFORCE_CAPABILITIES)["restore"];
  expectedStatus: MembershipStatus;
  nextStatus: MembershipStatus;
  action: "hospital_membership.suspended" | "hospital_membership.restored";
};

async function transitionHospitalMembershipInTransaction(
  transaction: Prisma.TransactionClient,
  input: HospitalMembershipTransitionInput,
  actorUserId: string,
  transition: HospitalMembershipStatusTransition,
): Promise<WorkforceMembershipMutationResult> {
  const current = await assertStaffMembershipMutationTarget(
    transaction,
    input,
    transition.expectedStatus,
  );

  const updated = await transaction.hospitalMembership.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      membershipType: MembershipType.MEMBER,
      status: transition.expectedStatus,
      updatedAt: current.updatedAt,
    },
    data: { status: transition.nextStatus },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The Hospital membership changed before this operation");
  }

  const result = await transaction.hospitalMembership.findUnique({
    where: { id: current.id },
    select: {
      id: true,
      hospitalId: true,
      profession: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!result) {
    throw new InfrastructureError("The updated Hospital membership could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: transition.action,
      resourceType: "HospitalMembership",
      resourceId: result.id,
      metadata: {
        fromStatus: transition.expectedStatus,
        toStatus: transition.nextStatus,
      },
    },
    transaction,
  );

  return toMembershipMutationResult(result);
}

export async function updateHospitalMembershipProfession(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceMembershipMutationResult> {
  const parsed = hospitalMembershipProfessionUpdateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital membership profession data is invalid");
  }

  assertActorPolicy(actor, WORKFORCE_CAPABILITIES.update, parsed.data.targetHospitalId);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(transaction, actor!.userId, parsed.data.targetHospitalId);
        return updateHospitalMembershipProfessionInTransaction(
          transaction,
          parsed.data,
          actor!.userId,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital membership profession could not be updated");
  }
}

async function transitionHospitalMembership(
  actor: ActorContext | null | undefined,
  input: unknown,
  transition: HospitalMembershipStatusTransition,
  dependencies: WorkforceServiceDependencies,
): Promise<WorkforceMembershipMutationResult> {
  const parsed = hospitalMembershipTransitionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital membership transition data is invalid");
  }

  assertActorPolicy(actor, transition.capability, parsed.data.targetHospitalId);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(transaction, actor!.userId, parsed.data.targetHospitalId);
        return transitionHospitalMembershipInTransaction(
          transaction,
          parsed.data,
          actor!.userId,
          transition,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital membership lifecycle operation could not be completed");
  }
}

export async function suspendHospitalMembership(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceMembershipMutationResult> {
  return transitionHospitalMembership(
    actor,
    input,
    {
      capability: WORKFORCE_CAPABILITIES.suspend,
      expectedStatus: MembershipStatus.ACTIVE,
      nextStatus: MembershipStatus.SUSPENDED,
      action: "hospital_membership.suspended",
    },
    dependencies,
  );
}

export async function restoreHospitalMembership(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceMembershipMutationResult> {
  return transitionHospitalMembership(
    actor,
    input,
    {
      capability: WORKFORCE_CAPABILITIES.restore,
      expectedStatus: MembershipStatus.SUSPENDED,
      nextStatus: MembershipStatus.ACTIVE,
      action: "hospital_membership.restored",
    },
    dependencies,
  );
}

type OsmRelationshipMutationTarget = {
  id: string;
  userId: string;
  hospitalId: string;
  status: MembershipStatus;
  updatedAt: Date;
  hospital: { status: HospitalStatus };
  user: {
    status: UserStatus;
    roles: { role: Role }[];
  };
};

const osmRelationshipMutationTargetSelect = {
  id: true,
  userId: true,
  hospitalId: true,
  status: true,
  updatedAt: true,
  hospital: { select: { status: true } },
  user: {
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  },
} satisfies Prisma.OsmHospitalRelationshipSelect;

type OsmRelationshipStatusTransition = {
  capability:
    | (typeof WORKFORCE_CAPABILITIES)["osmSuspend"]
    | (typeof WORKFORCE_CAPABILITIES)["osmRestore"];
  expectedStatus: MembershipStatus;
  nextStatus: MembershipStatus;
  action: "osm_relationship.suspended" | "osm_relationship.restored";
};

function parseExpectedOsmRelationshipUpdatedAt(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("OSM relationship version is invalid");
  }

  return parsed;
}

async function assertOsmRelationshipMutationTarget(
  transaction: Prisma.TransactionClient,
  input: OsmRelationshipTransitionInput,
  expectedStatus: MembershipStatus,
): Promise<OsmRelationshipMutationTarget> {
  const relationship = await transaction.osmHospitalRelationship.findFirst({
    where: {
      id: input.relationshipId,
      hospitalId: input.targetHospitalId,
    },
    select: osmRelationshipMutationTargetSelect,
  });

  if (!relationship) {
    throw new NotFoundError("The OSM relationship was not found");
  }

  if (relationship.hospital.status !== HospitalStatus.ACTIVE) {
    throw new ForbiddenError();
  }

  if (relationship.user.status !== UserStatus.ACTIVE) {
    throw new ConflictError("The target OSM account is not active");
  }

  if (!relationship.user.roles.some(({ role }) => role === Role.OSM)) {
    throw new ConflictError("The target account does not have the OSM role");
  }

  if (relationship.status !== expectedStatus) {
    throw new ConflictError("The OSM relationship changed before this operation");
  }

  const expectedUpdatedAt = parseExpectedOsmRelationshipUpdatedAt(input.expectedUpdatedAt);

  if (relationship.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new ConflictError("The OSM relationship changed before this operation");
  }

  return relationship;
}

async function transitionOsmRelationshipInTransaction(
  transaction: Prisma.TransactionClient,
  input: OsmRelationshipTransitionInput,
  actorUserId: string,
  transition: OsmRelationshipStatusTransition,
): Promise<WorkforceOsmRelationshipMutationResult> {
  const current = await assertOsmRelationshipMutationTarget(
    transaction,
    input,
    transition.expectedStatus,
  );
  const currentAssignmentCount = await countCurrentAssignmentsForOsmInHospital(transaction, {
    osmUserId: current.userId,
    hospitalId: current.hospitalId,
  });

  if (currentAssignmentCount > 0) {
    throw new ConflictError(
      "The OSM relationship cannot change while current Patient assignments exist",
    );
  }

  const updated = await transaction.osmHospitalRelationship.updateMany({
    where: {
      id: current.id,
      hospitalId: current.hospitalId,
      status: transition.expectedStatus,
      updatedAt: current.updatedAt,
    },
    data: { status: transition.nextStatus },
  });

  if (updated.count !== 1) {
    throw new ConflictError("The OSM relationship changed before this operation");
  }

  const result = await transaction.osmHospitalRelationship.findUnique({
    where: { id: current.id },
    select: {
      id: true,
      hospitalId: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!result) {
    throw new InfrastructureError("The updated OSM relationship could not be read");
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: transition.action,
      resourceType: "OsmHospitalRelationship",
      resourceId: result.id,
      metadata: {
        fromStatus: transition.expectedStatus,
        toStatus: transition.nextStatus,
      },
    },
    transaction,
  );

  return {
    relationshipId: result.id,
    hospitalId: result.hospitalId,
    relationshipStatus: result.status,
    updatedAt: result.updatedAt,
  };
}

async function transitionOsmRelationship(
  actor: ActorContext | null | undefined,
  input: unknown,
  transition: OsmRelationshipStatusTransition,
  dependencies: WorkforceServiceDependencies,
): Promise<WorkforceOsmRelationshipMutationResult> {
  const parsed = osmRelationshipTransitionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("OSM relationship transition data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  assertActorPolicy(actor, transition.capability, parsed.data.targetHospitalId);

  try {
    return await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(transaction, actor.userId, parsed.data.targetHospitalId);
        return transitionOsmRelationshipInTransaction(
          transaction,
          parsed.data,
          actor.userId,
          transition,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "OSM relationship lifecycle operation could not be completed");
  }
}

export async function suspendOsmRelationship(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceOsmRelationshipMutationResult> {
  return transitionOsmRelationship(
    actor,
    input,
    {
      capability: WORKFORCE_CAPABILITIES.osmSuspend,
      expectedStatus: MembershipStatus.ACTIVE,
      nextStatus: MembershipStatus.SUSPENDED,
      action: "osm_relationship.suspended",
    },
    dependencies,
  );
}

export async function restoreOsmRelationship(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceOsmRelationshipMutationResult> {
  return transitionOsmRelationship(
    actor,
    input,
    {
      capability: WORKFORCE_CAPABILITIES.osmRestore,
      expectedStatus: MembershipStatus.SUSPENDED,
      nextStatus: MembershipStatus.ACTIVE,
      action: "osm_relationship.restored",
    },
    dependencies,
  );
}

async function regenerateActivationInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    request: WorkforceActivationRequestInput;
    now: Date;
    dependencies: WorkforceServiceDependencies;
    source?: "explicit_regeneration" | "activation_slip";
  },
): Promise<WorkforceActivationIssueResult> {
  const source = input.source ?? "explicit_regeneration";

  await assertWorkforceProvisionerInDatabase(
    transaction,
    input.actorUserId,
    input.request.targetHospitalId,
    input.request.kind,
  );

  const user = await transaction.user.findUnique({
    where: { id: input.request.userId },
    select: workforceActivationClaimTargetSelect.user.select,
  });

  if (!user) {
    throw new NotFoundError("The workforce account was not found");
  }

  if (user.status !== UserStatus.PROVISIONED || user.authSubject) {
    throw new ConflictError("Only a non-active workforce account can be regenerated");
  }

  await assertInitialCredentialStateInDatabase(transaction, input.request.userId);
  await assertNoUnactivatedPatientIdentity(transaction, user.id);
  await assertSingleHospitalPendingScope(transaction, user.id, input.request.targetHospitalId);
  await assertActivationTargetRelationship(transaction, input.request);

  const relationship = input.request.kind === "OSM"
    ? await transaction.osmHospitalRelationship.findFirst({ where: { userId: user.id, hospitalId: input.request.targetHospitalId, status: { not: "ENDED" } }, select: { id: true } })
    : await transaction.hospitalMembership.findFirst({ where: { userId: user.id, hospitalId: input.request.targetHospitalId, status: { not: "ENDED" } }, select: { id: true } });
  if (!relationship) throw new ConflictError("Activation relationship is unavailable");
  if (!isInitialWorkforceScopeEligible(user, { hospitalId: input.request.targetHospitalId, relationshipId: relationship.id, kind: input.request.kind })) {
    throw new ConflictError("Initial activation scope requires an approved trust decision");
  }
  await assertActivationContextAuthority(transaction, { user, hospitalId: input.request.targetHospitalId,
    relationshipKind: input.request.kind, createdByUserId: input.actorUserId });
  const current = await findCurrentActivation(transaction, user.id);

  if (current?.claimedAt) {
    throw new ConflictError("The activation credential is currently being used");
  }

  if (current) {
    const revoked = await transaction.workforceActivation.updateMany({
      where: {
        id: current.id,
        userId: user.id,
        claimedAt: null,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: input.now,
      },
    });

    if (revoked.count !== 1) {
      throw new ConflictError("The activation credential changed during regeneration");
    }

    await recordAuditEvent(
      {
        actorUserId: input.actorUserId,
        action: "workforce_activation.revoked",
        resourceType: "WorkforceActivation",
        resourceId: current.id,
        metadata: { source },
      },
      transaction,
    );
  }

  const credential = (input.dependencies.generateCredential ??
    generateWorkforceActivationCredential)();
  const prismaMode = toPrismaActivationMode(input.request.mode);
  const expiresAt = getWorkforceActivationExpiry(input.now, input.request.mode);
  const activation = await transaction.workforceActivation.create({
    data: {
      userId: user.id,
      tokenHash: credential.tokenHash,
      mode: prismaMode,
      expiresAt,
      createdByUserId: input.actorUserId,
      hospitalId: input.request.targetHospitalId, relationshipId: relationship.id, relationshipKind: input.request.kind,
    },
    select: { id: true },
  });

  await recordAuditEvent(
    {
      actorUserId: input.actorUserId,
      action: "workforce_activation.issued",
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: {
        mode: prismaMode,
        status: UserStatus.PROVISIONED,
        source,
      },
    },
    transaction,
  );

  return {
    activationId: activation.id,
    userId: user.id,
    hospitalId: input.request.targetHospitalId,
    kind: input.request.kind,
    activationToken: credential.plaintextToken,
    activationExpiresAt: expiresAt,
    activationMode: input.request.mode,
  };
}

export async function regenerateWorkforceActivation(
  actor: ActorContext | null | undefined,
  input: WorkforceActivationRequestInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceActivationIssueResult> {
  const parsed = workforceActivationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Activation regeneration data is invalid");
  }

  assertActorPolicy(
    actor,
    parsed.data.kind === "OSM"
      ? WORKFORCE_CAPABILITIES.osmProvision
      : WORKFORCE_CAPABILITIES.create,
    parsed.data.targetHospitalId,
  );

  try {
    return await runSerializable(
      getDatabase(dependencies),
      (transaction) =>
        regenerateActivationInTransaction(transaction, {
          actorUserId: actor!.userId,
          request: parsed.data,
          now: getNow(dependencies),
          dependencies,
        }),
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Activation regeneration could not be completed");
  }
}

export async function revokeWorkforceActivation(
  actor: ActorContext | null | undefined,
  input: Omit<WorkforceActivationRequestInput, "mode">,
  dependencies: WorkforceServiceDependencies = {},
): Promise<void> {
  const parsed = workforceActivationRequestSchema.safeParse({ ...input, mode: "REMOTE" });

  if (!parsed.success) {
    throw new ValidationError("Activation revocation data is invalid");
  }

  assertActorPolicy(actor, WORKFORCE_CAPABILITIES.activationRevoke, parsed.data.targetHospitalId);

  try {
    await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        await assertOwnerInDatabase(
          transaction,
          actor!.userId,
          parsed.data.targetHospitalId,
        );

        const user = await transaction.user.findUnique({
          where: { id: parsed.data.userId },
          select: { id: true, status: true, authSubject: true },
        });

        if (!user || user.status !== UserStatus.PROVISIONED || user.authSubject) {
          throw new ConflictError("Only a non-active workforce account can be revoked");
        }

        await assertActivationTargetRelationship(transaction, parsed.data);

        const current = await findCurrentActivation(transaction, user.id);

        if (!current) {
          return;
        }

        if (current.claimedAt) {
          throw new ConflictError("The activation credential is currently being used");
        }

        const revoked = await transaction.workforceActivation.updateMany({
          where: {
            id: current.id,
            userId: user.id,
            claimedAt: null,
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: getNow(dependencies) },
        });

        if (revoked.count !== 1) {
          throw new ConflictError("The activation credential changed during revocation");
        }

        await recordAuditEvent(
          {
            actorUserId: actor!.userId,
            action: "workforce_activation.revoked",
            resourceType: "WorkforceActivation",
            resourceId: current.id,
            metadata: { source: "assisted_handoff_failure" },
          },
          transaction,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Activation revocation could not be completed");
  }
}

const ACTIVATION_UNAVAILABLE_MESSAGE =
  "ไม่สามารถยืนยันได้ ลิงก์อาจไม่ถูกต้อง หมดอายุ ถูกใช้แล้ว หรือเลขบัตรประชาชนไม่ตรงกัน";

function auditActionFor(
  purpose: WorkforceActivationPurpose,
  event: "verification_failed" | "revoked" | "completed" | "issued",
): string {
  return purpose === WorkforceActivationPurpose.RESET
    ? `workforce_password_reset.${event}`
    : `workforce_activation.${event}`;
}

async function recordFailedVerification(
  transaction: Prisma.TransactionClient,
  activation: { id: string; userId: string; purpose: WorkforceActivationPurpose },
  now: Date,
): Promise<void> {
  const updated = await transaction.workforceActivation.update({
    where: { id: activation.id },
    data: { failedVerificationCount: { increment: 1 } },
    select: { failedVerificationCount: true },
  });

  await recordAuditEvent(
    {
      actorUserId: null,
      action: auditActionFor(activation.purpose, "verification_failed"),
      resourceType: "WorkforceActivation",
      resourceId: activation.id,
      metadata: {
        targetUserId: activation.userId,
        attempt: updated.failedVerificationCount,
      },
    },
    transaction,
  );

  if (updated.failedVerificationCount < WORKFORCE_MAX_FAILED_VERIFICATIONS) {
    return;
  }

  const revoked = await transaction.workforceActivation.updateMany({
    where: { id: activation.id, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });

  if (revoked.count === 1) {
    await recordAuditEvent(
      {
        actorUserId: null,
        action: auditActionFor(activation.purpose, "revoked"),
        resourceType: "WorkforceActivation",
        resourceId: activation.id,
        metadata: { targetUserId: activation.userId, source: "verification_failures" },
      },
      transaction,
    );
  }
}

const workforceActivationClaimTargetSelect = {
  id: true,
  userId: true,
  purpose: true,
  operationState: true,
  hospitalId: true, relationshipId: true, relationshipKind: true, createdByUserId: true, reconciliationRequiredAt: true,
  selfRegistrationRelationships: true,
  expiresAt: true,
  claimedAt: true,
  usedAt: true,
  revokedAt: true,
  user: {
    select: {
      id: true,
      status: true,
      authSubject: true,
      roles: { select: { role: true } },
      person: { select: { identityKeyHash: true, givenName: true, familyName: true, patientProfile: { select: { id: true } } } },
      memberships: {
        select: { id: true, hospitalId: true, updatedAt: true, membershipType: true, status: true, hospital: { select: { status: true } } },
      },
      osmHospitalRelationships: {
        select: { id: true, hospitalId: true, updatedAt: true, status: true, hospital: { select: { status: true } } },
      },
    },
  },
} satisfies Prisma.WorkforceActivationSelect;

type WorkforceActivationClaimTarget = Prisma.WorkforceActivationGetPayload<{
  select: typeof workforceActivationClaimTargetSelect;
}>;

function isActivationUsable(
  activation: WorkforceActivationClaimTarget | null,
  purposes: readonly WorkforceActivationPurpose[],
  now: Date,
): activation is WorkforceActivationClaimTarget {
  return Boolean(
    activation &&
      purposes.includes(activation.purpose) &&
      activation.operationState === WorkforceActivationOperationState.NOT_STARTED &&
      !activation.usedAt &&
      !activation.revokedAt &&
      !activation.claimedAt &&
      !activation.reconciliationRequiredAt &&
      activation.expiresAt > now,
  );
}

function isActivationTargetEligible(
  activation: WorkforceActivationClaimTarget,
  allowMappedSubject = false,
): boolean {
  if (activation.purpose === WorkforceActivationPurpose.SELF_REGISTRATION) {
    return activation.selfRegistrationRelationships !== null &&
      activation.user.status === UserStatus.PROVISIONED &&
      (allowMappedSubject || activation.user.authSubject === null) &&
      !activation.user.roles.some(({ role }) => role === Role.ADMIN) &&
      !activation.user.memberships.some(({ membershipType, status }) =>
        membershipType === MembershipType.OWNER &&
        (status === MembershipStatus.ACTIVE || status === MembershipStatus.PROVISIONED),
      ) &&
      selfRegistrationRelationshipsSchema.safeParse(activation.selfRegistrationRelationships).success;
  }
  if (!activation.hospitalId || !activation.relationshipId) return false;
  if (activation.purpose === WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING) {
    return activation.relationshipKind === CHILD_OWNER_RELATIONSHIP_KIND &&
      isChildOwnerScopeEligible(activation.user, { hospitalId: activation.hospitalId, relationshipId: activation.relationshipId }, allowMappedSubject);
  }
  if (activation.purpose !== WorkforceActivationPurpose.ACTIVATION ||
    (activation.relationshipKind !== "OSM" && activation.relationshipKind !== "HOSPITAL_MEMBER")) return false;
  return isInitialWorkforceScopeEligible(activation.user, { hospitalId: activation.hospitalId, relationshipId: activation.relationshipId, kind: activation.relationshipKind }, allowMappedSubject);
}

/**
 * ADR-0018: a Child OWNER first credential completes exactly its pending OWNER membership. Any other open workforce
 * relationship needs an explicit trust decision, so it fails closed. The Child may still be PENDING_VERIFICATION
 * (first OWNER) or ACTIVE (replacement); the persisted invitation context is re-checked separately.
 */
function isChildOwnerScopeEligible(
  user: WorkforceActivationClaimTarget["user"],
  context: { hospitalId: string; relationshipId: string },
  allowMappedSubject = false,
): boolean {
  if (user.status !== UserStatus.PROVISIONED || (!allowMappedSubject && user.authSubject) ||
    user.roles.some(({ role }) => role === Role.ADMIN || role === Role.PATIENT) || user.person.patientProfile ||
    !user.roles.some(({ role }) => role === Role.HOSPITAL)) return false;
  const openMemberships = user.memberships.filter(({ status }) => status !== MembershipStatus.ENDED);
  if (openMemberships.length !== 1 || user.osmHospitalRelationships.some(({ status }) => status !== MembershipStatus.ENDED)) return false;
  const [target] = openMemberships;
  return Boolean(target && target.id === context.relationshipId && target.hospitalId === context.hospitalId &&
    target.membershipType === MembershipType.OWNER && target.status === MembershipStatus.PROVISIONED &&
    (target.hospital.status === HospitalStatus.PENDING_VERIFICATION || target.hospital.status === HospitalStatus.ACTIVE));
}

function isInitialWorkforceScopeEligible(
  user: WorkforceActivationClaimTarget["user"],
  context: { hospitalId: string; relationshipId: string; kind: WorkforceKind },
  allowMappedSubject = false,
): boolean {
  if (user.status !== UserStatus.PROVISIONED || (!allowMappedSubject && user.authSubject) ||
    user.roles.some(({ role }) => role === Role.ADMIN || role === Role.PATIENT) || user.person.patientProfile ||
    user.memberships.some(({ membershipType }) => membershipType === MembershipType.OWNER)) return false;
  const pendingStaff = user.memberships.filter(({ status }) => status === MembershipStatus.PROVISIONED);
  const pendingOsm = user.osmHospitalRelationships.filter(({ status }) => status === MembershipStatus.PROVISIONED);
  if ((pendingStaff.length && !user.roles.some(({ role }) => role === Role.HOSPITAL)) ||
    (pendingOsm.length && !user.roles.some(({ role }) => role === Role.OSM))) return false;
  // Cross-Hospital initial activation requires an explicit trust decision; never silently activate all scopes.
  if ([...pendingStaff, ...pendingOsm].some(({ hospitalId }) => hospitalId !== context.hospitalId)) return false;
  const target = context.kind === "OSM"
    ? pendingOsm.find(({ id, hospitalId }) => id === context.relationshipId && hospitalId === context.hospitalId)
    : pendingStaff.find(({ id, hospitalId, membershipType }) => id === context.relationshipId && hospitalId === context.hospitalId && membershipType === MembershipType.MEMBER);
  return Boolean(target && target.hospital.status === HospitalStatus.ACTIVE && user.roles.some(({ role }) =>
    role === (context.kind === "OSM" ? Role.OSM : Role.HOSPITAL)));
}

async function assertActivationContextAuthority(
  transaction: Prisma.TransactionClient,
  activation: Pick<WorkforceActivationClaimTarget, "hospitalId" | "relationshipKind" | "createdByUserId" | "user">,
): Promise<void> {
  if (!activation.hospitalId || (activation.relationshipKind !== "OSM" && activation.relationshipKind !== "HOSPITAL_MEMBER")) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
  // Claiming an existing OSM invitation is target-user self-service. Preserve the former
  // issuer trust boundary here only; all issuance and regeneration now require OWNER.
  const legacyOsmClaim = activation.relationshipKind === "OSM" &&
    !activation.user.memberships.some(({ status }) => status === MembershipStatus.PROVISIONED);
  await assertHospitalActorInDatabase(transaction, activation.createdByUserId, activation.hospitalId,
    legacyOsmClaim ? [MembershipType.OWNER, MembershipType.MEMBER] : [MembershipType.OWNER]);
}

/**
 * Persisted issuing context of a claimable activation. Staff/OSM: the issuer still provisions that Hospital.
 * Child OWNER (ADR-0018): the invitation context still holds and the issuer is still an OWNER of that Parent.
 */
async function assertActivationContext(
  transaction: Prisma.TransactionClient,
  activation: WorkforceActivationClaimTarget,
): Promise<ChildOwnerInvitationContext | null> {
  if (activation.purpose === WorkforceActivationPurpose.SELF_REGISTRATION) return null;
  if (activation.purpose !== WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING) {
    await assertActivationContextAuthority(transaction, activation);
    return null;
  }
  if (!activation.hospitalId || !activation.relationshipId) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
  const context = await assertChildOwnerInvitationContext(transaction, {
    membershipId: activation.relationshipId, childHospitalId: activation.hospitalId,
    userId: activation.userId, expectedStatus: MembershipStatus.PROVISIONED,
  });
  const issuer = await transaction.hospitalMembership.findFirst({
    where: parentOwnerMembershipWhere(activation.createdByUserId, context.parentHospitalId), select: { id: true },
  });
  if (!issuer) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
  return context;
}

/**
 * Read-only: resolves the masked identity cue for a valid, unconsumed token.
 * Every failure is the same generic conflict; the full name is never returned.
 */
export async function previewWorkforceActivation(
  token: string,
  dependencies: WorkforceServiceDependencies = {},
): Promise<{ maskedName: string; purpose: Exclude<WorkforceActivationPurpose, "SELF_REGISTRATION"> }> {
  const parsedToken = workforceActivationTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
  }

  const now = getNow(dependencies);

  try {
    const activation = await getDatabase(dependencies).workforceActivation.findUnique({
      where: { tokenHash: hashWorkforceActivationToken(parsedToken.data) },
      select: workforceActivationClaimTargetSelect,
    });

    if (
      !activation ||
      activation.purpose === WorkforceActivationPurpose.SELF_REGISTRATION ||
      !isActivationUsable(activation, [activation.purpose], now) ||
      !isActivationTargetEligible(activation)
    ) {
      throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
    }

    await getDatabase(dependencies).$transaction(async (transaction) => {
      await assertInitialCredentialStateInDatabase(transaction, activation.userId, activation.id);
      await assertActivationContext(transaction, activation);
    });
    return {
      maskedName: maskPersonName(activation.user.person.givenName, activation.user.person.familyName),
      purpose: activation.purpose,
    };
  } catch (error: unknown) {
    if (error instanceof ConflictError || error instanceof ForbiddenError) {
      throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
    }

    throw new InfrastructureError("Workforce activation could not be previewed");
  }
}

async function claimWorkforceActivation(
  token: string,
  purposes: readonly WorkforceActivationPurpose[],
  nationalId: string,
  dependencies: WorkforceServiceDependencies,
): Promise<ActivationClaim> {
  const tokenHash = hashWorkforceActivationToken(token);
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    // A failed identity check must persist its attempt, so it returns null instead of throwing.
    const claim = await runSerializable(
      database,
      async (transaction): Promise<ActivationClaim | null> => {
        const initialActivation = await transaction.workforceActivation.findUnique({
          where: { tokenHash },
          select: { userId: true },
        });
        if (!initialActivation) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
        await lockFirstCredentialOperation(transaction, initialActivation.userId);
        const activation = await transaction.workforceActivation.findUnique({
          where: { tokenHash },
          select: workforceActivationClaimTargetSelect,
        });

        if (
          !isActivationUsable(activation, purposes, now) ||
          !isActivationTargetEligible(activation)
        ) {
          throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
        }

        await assertInitialCredentialStateInDatabase(transaction, activation.userId, activation.id);
        await assertActivationContext(transaction, activation);
        if (activation.purpose === WorkforceActivationPurpose.SELF_REGISTRATION) {
          await assertCurrentSelfRegistrationEligibility(transaction, {
            userId: activation.userId,
            relationships: activation.selfRegistrationRelationships,
            now,
          });
        }

        if (!matchesPersonNationalId(activation.user.person.identityKeyHash, nationalId)) {
          await recordFailedVerification(transaction, activation, now);
          return null;
        }

        const claimedAt = now;
        const claimed = await transaction.workforceActivation.updateMany({
          where: {
            id: activation.id,
            tokenHash,
            purpose: activation.purpose,
            claimedAt: null,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { claimedAt, operationState: WorkforceActivationOperationState.CLAIMED },
        });

        if (claimed.count !== 1) {
          throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
        }

        return {
          activationId: activation.id,
          userId: activation.userId,
          claimedAt,
          authSubject: activation.user.authSubject,
        };
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );

    if (!claim) {
      throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
    }

    return claim;
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
    if (error instanceof ConflictError) {
      throw error;
    }

    throw normalizeDatabaseError(error, "Workforce activation could not be claimed");
  }
}

async function releaseWorkforceActivationClaim(
  claim: ActivationClaim,
  dependencies: WorkforceServiceDependencies,
  expectedState: WorkforceActivationOperationState = WorkforceActivationOperationState.CLAIMED,
): Promise<void> {
  try {
    const result = await getDatabase(dependencies).workforceActivation.updateMany({
      where: {
        id: claim.activationId,
        userId: claim.userId,
        claimedAt: claim.claimedAt,
        operationState: expectedState,
        reconciliationRequiredAt: null,
        usedAt: null,
        revokedAt: null,
      },
      data: { claimedAt: null, operationState: WorkforceActivationOperationState.NOT_STARTED },
    });

    if (result.count !== 1) {
      throw new WorkforceActivationReconciliationError();
    }
  } catch (error: unknown) {
    if (error instanceof WorkforceActivationReconciliationError) {
      throw error;
    }

    throw new WorkforceActivationReconciliationError();
  }
}

async function finalizeWorkforceActivationLocally(
  claim: ActivationClaim,
  authSubject: string,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  await runSerializable(
    database,
    async (transaction) => {
      const activation = await transaction.workforceActivation.findUnique({
        where: { id: claim.activationId },
        select: workforceActivationClaimTargetSelect,
      });

      const user = await transaction.user.findUnique({
        where: { id: claim.userId },
        select: { id: true, status: true, authSubject: true },
      });
      const selfRegistration = activation?.purpose === WorkforceActivationPurpose.SELF_REGISTRATION;

      if (
        !activation ||
        (!selfRegistration && !INITIAL_ACTIVATION_PURPOSES.includes(activation.purpose)) ||
        activation.operationState !== WorkforceActivationOperationState.PROVIDER_CONFIRMED ||
        activation.userId !== claim.userId ||
        activation.claimedAt?.getTime() !== claim.claimedAt.getTime() ||
        activation.usedAt ||
        activation.revokedAt ||
        activation.expiresAt <= now ||
        (!selfRegistration && !activation.hospitalId) ||
        activation.reconciliationRequiredAt ||
        !isActivationTargetEligible(activation, true) ||
        !user ||
        user.status !== UserStatus.PROVISIONED ||
        user.authSubject !== authSubject
      ) {
        throw new ConflictError("Workforce activation state changed before completion");
      }

      await assertInitialCredentialStateInDatabase(transaction, activation.userId, activation.id);
      const childOwnerContext = await assertActivationContext(transaction, activation);

      let selfRegistrationRelationships: SelfRegistrationRelationship[] = [];
      if (selfRegistration) {
        const eligibility = await assertCurrentSelfRegistrationEligibility(transaction, {
          userId: claim.userId,
          relationships: activation.selfRegistrationRelationships,
          now,
          expectedAuthSubject: authSubject,
          ignoreActivation: { kind: "WORKFORCE", id: activation.id },
        });
        selfRegistrationRelationships = eligibility.relationships;
        const eligibleCreatedAt = {
          gte: new Date(now.getTime() - SELF_REGISTRATION_ELIGIBILITY_WINDOW_MS),
          lte: now,
        };
        const staffRelationships = selfRegistrationRelationships.filter(({ kind }) => kind === "HOSPITAL_MEMBER");
        const osmRelationships = selfRegistrationRelationships.filter(({ kind }) => kind === "OSM");
        const patientRelationships = selfRegistrationRelationships.filter(({ kind }) => kind === "PATIENT");
        const activatedStaff = staffRelationships.length
          ? await transaction.hospitalMembership.updateMany({
              where: {
                id: { in: staffRelationships.map(({ id }) => id) },
                userId: claim.userId,
                membershipType: MembershipType.MEMBER,
                status: MembershipStatus.PROVISIONED,
                selfRegisteredAt: null,
                createdAt: eligibleCreatedAt,
                hospital: { status: HospitalStatus.ACTIVE, selfRegistrationEnabled: true },
              },
              data: { status: MembershipStatus.ACTIVE, selfRegisteredAt: now },
            })
          : { count: 0 };
        const activatedOsm = osmRelationships.length
          ? await transaction.osmHospitalRelationship.updateMany({
              where: {
                id: { in: osmRelationships.map(({ id }) => id) },
                userId: claim.userId,
                status: MembershipStatus.PROVISIONED,
                selfRegisteredAt: null,
                createdAt: eligibleCreatedAt,
                hospital: { status: HospitalStatus.ACTIVE, selfRegistrationEnabled: true },
              },
              data: { status: MembershipStatus.ACTIVE, selfRegisteredAt: now },
            })
          : { count: 0 };
        const markedPatients = patientRelationships.length
          ? await transaction.patientHospitalRelationship.updateMany({
              where: {
                id: { in: patientRelationships.map(({ id }) => id) },
                endedAt: null,
                selfRegisteredAt: null,
                createdAt: eligibleCreatedAt,
                hospital: { status: HospitalStatus.ACTIVE, selfRegistrationEnabled: true },
              },
              data: { selfRegisteredAt: now },
            })
          : { count: 0 };
        if (
          activatedStaff.count !== staffRelationships.length ||
          activatedOsm.count !== osmRelationships.length ||
          markedPatients.count !== patientRelationships.length
        ) {
          throw new ConflictError("Self-registration relationships changed before completion");
        }
      } else if (childOwnerContext && activation.relationshipId) {
        // ADR-0018 (O-D3): the only activation that may complete while its Hospital is still PENDING_VERIFICATION.
        if (!activation.hospitalId) {
          throw new ConflictError("Child OWNER activation Hospital context is missing");
        }
        await activatePendingChildOwner(transaction, {
          membershipId: activation.relationshipId,
          childHospitalId: activation.hospitalId,
          userId: claim.userId,
          fromStatus: MembershipStatus.PROVISIONED,
          context: childOwnerContext,
          actorUserId: null,
        });
      } else {
        if (!activation.hospitalId) {
          throw new ConflictError("Workforce activation Hospital context is missing");
        }
        const activatedMemberships = await transaction.hospitalMembership.updateMany({
          where: {
            userId: claim.userId,
            hospitalId: activation.hospitalId,
            membershipType: MembershipType.MEMBER,
            status: MembershipStatus.PROVISIONED,
            hospital: { status: HospitalStatus.ACTIVE },
          },
          data: { status: MembershipStatus.ACTIVE },
        });
        const activatedOsmRelationships = await transaction.osmHospitalRelationship.updateMany({
          where: {
            userId: claim.userId,
            hospitalId: activation.hospitalId,
            status: MembershipStatus.PROVISIONED,
            hospital: { status: HospitalStatus.ACTIVE },
          },
          data: { status: MembershipStatus.ACTIVE },
        });

        if (activatedMemberships.count + activatedOsmRelationships.count === 0) {
          throw new ConflictError("No workforce relationship is awaiting activation");
        }
      }

      const activatedUser = await transaction.user.updateMany({
        where: {
          id: claim.userId,
          status: UserStatus.PROVISIONED,
          authSubject,
        },
        data: { status: UserStatus.ACTIVE, ...(selfRegistration ? { identityAssurance: "SELF_REGISTERED" as const } : {}) },
      });

      if (activatedUser.count !== 1) {
        throw new ConflictError("Workforce account changed during activation");
      }

      const consumed = await transaction.workforceActivation.updateMany({
        where: {
          id: claim.activationId,
          userId: claim.userId,
          claimedAt: claim.claimedAt,
          usedAt: null,
          revokedAt: null,
        },
        data: { usedAt: now, operationState: WorkforceActivationOperationState.FINALIZED },
      });

      if (consumed.count !== 1) {
        throw new ConflictError("Workforce activation credential changed during completion");
      }

      if (selfRegistration) {
        const relationshipsByHospital = new Map<string, number>();
        for (const relationship of selfRegistrationRelationships) {
          relationshipsByHospital.set(relationship.hospitalId, (relationshipsByHospital.get(relationship.hospitalId) ?? 0) + 1);
        }
        for (const [hospitalId, relationshipCount] of relationshipsByHospital) {
          await recordAuditEvent({
            actorUserId: null,
            action: "self_registration.completed",
            resourceType: "Hospital",
            resourceId: hospitalId,
            metadata: {
              relationshipCount,
              purpose: selfRegistrationRelationships.some(({ kind }) => kind === "PATIENT")
                ? "COMBINED"
                : "WORKFORCE",
            },
          }, transaction);
        }
      } else {
        await recordAuditEvent(
          {
            actorUserId: null,
            action: "workforce_activation.completed",
            resourceType: "User",
            resourceId: claim.userId,
            metadata: {
              status: UserStatus.ACTIVE,
              source: "workforce_activation",
            },
          },
          transaction,
        );
      }
    },
    dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
  );
}

async function deleteProviderIdentityByDefault(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new WorkforceActivationReconciliationError();
  }
}

async function detachAuthSubjectFromDatabase(
  database: WorkforceDatabase,
  input: { userId: string; authSubject: string },
): Promise<boolean> {
  try {
    const result = await database.user.updateMany({
      where: {
        id: input.userId,
        authSubject: input.authSubject,
        status: UserStatus.PROVISIONED,
      },
      data: { authSubject: null },
    });

    return result.count === 1;
  } catch {
    throw new WorkforceActivationReconciliationError();
  }
}

async function compensateFailedWorkforceFinalization(
  claim: ActivationClaim,
  authSubject: string,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  const detachAuthSubject =
    dependencies.detachAuthSubject ??
    ((input: { userId: string; authSubject: string }) =>
      detachAuthSubjectFromDatabase(getDatabase(dependencies), input));
  const detached = await detachAuthSubject({ userId: claim.userId, authSubject });

  if (!detached) {
    throw new WorkforceActivationReconciliationError();
  }

  const deleteProviderIdentity =
    dependencies.deleteProviderIdentity ?? deleteProviderIdentityByDefault;
  await deleteProviderIdentity(authSubject);
}

async function transitionWorkforceProviderOperation(
  claim: ActivationClaim,
  expectedState: WorkforceActivationOperationState,
  state: WorkforceActivationOperationState,
  dependencies: WorkforceServiceDependencies,
): Promise<void> {
  await runSerializable(getDatabase(dependencies), async (transaction) => {
    const activation = await transaction.workforceActivation.findUnique({ where: { id: claim.activationId }, select: workforceActivationClaimTargetSelect });
    if (!activation || activation.userId !== claim.userId || activation.claimedAt?.getTime() !== claim.claimedAt.getTime() ||
      activation.operationState !== expectedState || activation.usedAt || activation.revokedAt || activation.reconciliationRequiredAt || activation.expiresAt <= getNow(dependencies)) {
      throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
    }
    if (state === WorkforceActivationOperationState.PROVIDER_STARTED) {
      if (!isActivationTargetEligible(activation)) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
      await assertInitialCredentialStateInDatabase(transaction, activation.userId, activation.id);
      await assertActivationContext(transaction, activation);
    }
    const changed = await transaction.workforceActivation.updateMany({ where: { id: claim.activationId, claimedAt: claim.claimedAt, operationState: expectedState, usedAt: null, revokedAt: null }, data: { operationState: state } });
    if (changed.count !== 1) throw new ConflictError(ACTIVATION_UNAVAILABLE_MESSAGE);
  }, dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES);
}

async function requireWorkforceActivationReconciliation(
  claim: ActivationClaim,
  dependencies: WorkforceServiceDependencies,
): Promise<never> {
  try {
    await runSerializable(getDatabase(dependencies), async (transaction) => {
      const marked = await transaction.workforceActivation.updateMany({ where: {
        id: claim.activationId, userId: claim.userId, claimedAt: claim.claimedAt,
        usedAt: null, reconciliationRequiredAt: null,
      }, data: { operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED, reconciliationRequiredAt: getNow(dependencies) } });
      if (marked.count) await recordAuditEvent({ actorUserId: null, action: "workforce_activation.reconciliation_required",
        resourceType: "WorkforceActivation", resourceId: claim.activationId, metadata: { targetUserId: claim.userId } }, transaction);
    }, dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES);
  } catch {
    // The already-durable claim/provider state still blocks all retries when even the marker cannot be stored.
    console.error("Workforce activation reconciliation marker could not be persisted");
  }
  throw new WorkforceActivationReconciliationError();
}

async function isWorkforceActivationFinalized(
  claim: ActivationClaim, authSubject: string, dependencies: WorkforceServiceDependencies,
): Promise<boolean> {
  try {
    const activation = await getDatabase(dependencies).workforceActivation.findUnique({ where: { id: claim.activationId },
      select: { userId: true, operationState: true, usedAt: true, user: { select: { status: true, authSubject: true } } } });
    return Boolean(activation && activation.userId === claim.userId && activation.operationState === WorkforceActivationOperationState.FINALIZED &&
      activation.usedAt && activation.user.status === UserStatus.ACTIVE && activation.user.authSubject === authSubject);
  } catch { return false; }
}

export async function completeWorkforceActivation(
  token: string,
  input: WorkforceActivationCompletionInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<{ userId: string }> {
  return completeWorkforceActivationForPurposes(
    token,
    input,
    INITIAL_ACTIVATION_PURPOSES,
    dependencies,
  );
}

export async function completeWorkforceSelfRegistration(
  token: string,
  input: WorkforceActivationCompletionInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<{ userId: string }> {
  return completeWorkforceActivationForPurposes(
    token,
    input,
    [WorkforceActivationPurpose.SELF_REGISTRATION],
    dependencies,
  );
}

async function completeWorkforceActivationForPurposes(
  token: string,
  input: WorkforceActivationCompletionInput,
  purposes: readonly WorkforceActivationPurpose[],
  dependencies: WorkforceServiceDependencies,
): Promise<{ userId: string }> {
  const parsedToken = workforceActivationTokenSchema.safeParse(token);
  const parsedInput = workforceActivationCompletionSchema.safeParse(input);

  if (!parsedToken.success || !parsedInput.success) {
    throw new ValidationError("Workforce activation data is invalid");
  }

  const claim = await claimWorkforceActivation(
    parsedToken.data,
    purposes,
    parsedInput.data.nationalId,
    dependencies,
  );
  const provisionIdentity = dependencies.provisionIdentity ?? provisionPasswordAuthIdentity;
  let provisionedIdentity: ProvisionPasswordAuthIdentityResult;
  try {
    // Durably record possible provider effects before sending the first request; secrets stay in memory only.
    await transitionWorkforceProviderOperation(claim, WorkforceActivationOperationState.CLAIMED, WorkforceActivationOperationState.PROVIDER_STARTED, dependencies);
  } catch {
    return requireWorkforceActivationReconciliation(claim, dependencies);
  }
  try {
    provisionedIdentity = await provisionIdentity({ userId: claim.userId, password: parsedInput.data.password });
  } catch (error: unknown) {
    if (error instanceof PasswordAuthProvisioningReconciliationError ||
      !(error instanceof PasswordAuthProvisioningProviderRejectedError || error instanceof ConflictError || error instanceof ValidationError || error instanceof NotFoundError)) {
      return requireWorkforceActivationReconciliation(claim, dependencies);
    }
    await releaseWorkforceActivationClaim(claim, dependencies, WorkforceActivationOperationState.PROVIDER_STARTED);
    throw error;
  }
  if (provisionedIdentity.userId !== claim.userId || !zUuid(provisionedIdentity.authSubject)) {
    return requireWorkforceActivationReconciliation(claim, dependencies);
  }
  try {
    await transitionWorkforceProviderOperation(claim, WorkforceActivationOperationState.PROVIDER_STARTED, WorkforceActivationOperationState.PROVIDER_CONFIRMED, dependencies);
  } catch {
    return requireWorkforceActivationReconciliation(claim, dependencies);
  }
  try {
    await finalizeWorkforceActivationLocally(claim, provisionedIdentity.authSubject, dependencies);
  } catch (error: unknown) {
    // A lost DB response may hide a committed finalization. Confirm it before considering initial-identity compensation.
    if (await isWorkforceActivationFinalized(claim, provisionedIdentity.authSubject, dependencies)) return { userId: claim.userId };
    try {
      await compensateFailedWorkforceFinalization(claim, provisionedIdentity.authSubject, dependencies);
      await releaseWorkforceActivationClaim(claim, dependencies, WorkforceActivationOperationState.PROVIDER_CONFIRMED);
    } catch {
      return requireWorkforceActivationReconciliation(claim, dependencies);
    }
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Workforce activation could not be finalized");
  }

  return { userId: claim.userId };
}

export type WorkforcePasswordResetIssueResult = {
  activationId: string;
  userId: string;
  hospitalId: string;
  targetKind: WorkforceResetTargetKind;
  activationToken: string;
  activationExpiresAt: Date;
  activationMode: "ASSISTED";
};

/** No independent account-owner recovery proof is currently approved (ADR-0008 remediation). */
export async function issueWorkforcePasswordReset(
  actor: ActorContext | null | undefined,
  input: unknown,
  _dependencies?: WorkforceServiceDependencies,
): Promise<WorkforcePasswordResetIssueResult> {
  const parsed = workforcePasswordResetRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Password reset data is invalid");
  }
  if (!actor) {
    throw new ForbiddenError();
  }
  void _dependencies;
  assertWorkforceCredentialReplacementSupported();
  throw new ForbiddenError();
}

export async function completeWorkforcePasswordReset(
  _token: string,
  _input: WorkforceActivationCompletionInput,
  _dependencies?: WorkforceServiceDependencies,
): Promise<{ userId: string }> {
  // Reject even legacy, issuer-held, claimed or consumed tokens before DB/provider side effects.
  void [_token, _input, _dependencies];
  assertWorkforceCredentialReplacementSupported();
  throw new ForbiddenError();
}

/**
 * Compensation for an assisted handoff that failed after this actor issued the token.
 * It can only revoke an unused credential created by the same actor.
 */
export async function revokeIssuedWorkforceActivation(
  actor: ActorContext | null | undefined,
  input: { activationId: string },
  dependencies: WorkforceServiceDependencies = {},
): Promise<void> {
  const activationId = z.uuid().safeParse(input.activationId);

  if (!activationId.success) {
    throw new ValidationError("Activation revocation data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    await runSerializable(
      getDatabase(dependencies),
      async (transaction) => {
        const activation = await transaction.workforceActivation.findUnique({
          where: { id: activationId.data },
          select: { id: true, userId: true, purpose: true, hospitalId: true, relationshipId: true, createdByUserId: true, claimedAt: true, usedAt: true, revokedAt: true },
        });

        if (!activation || activation.createdByUserId !== actor.userId) {
          throw new ForbiddenError();
        }

        if (!activation.hospitalId) throw new ForbiddenError();
        let authorityHospitalId = activation.hospitalId;
        if (activation.purpose === WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING) {
          if (!activation.relationshipId) throw new ForbiddenError();
          const context = await assertChildOwnerInvitationContext(transaction, {
            membershipId: activation.relationshipId,
            childHospitalId: activation.hospitalId,
            userId: activation.userId,
            expectedStatus: MembershipStatus.PROVISIONED,
          });
          authorityHospitalId = context.parentHospitalId;
        }
        assertActorPolicy(actor, WORKFORCE_CAPABILITIES.activationRevoke, authorityHospitalId);
        await assertOwnerInDatabase(transaction, actor.userId, authorityHospitalId);

        if (activation.usedAt || activation.revokedAt) {
          return;
        }

        if (activation.claimedAt) {
          throw new ConflictError("The activation credential is currently being used");
        }

        const revoked = await transaction.workforceActivation.updateMany({
          where: { id: activation.id, claimedAt: null, usedAt: null, revokedAt: null },
          data: { revokedAt: getNow(dependencies) },
        });

        if (revoked.count !== 1) {
          throw new ConflictError("The activation credential changed during revocation");
        }

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: auditActionFor(activation.purpose, "revoked"),
            resourceType: "WorkforceActivation",
            resourceId: activation.id,
            metadata: { source: "assisted_handoff_failure" },
          },
          transaction,
        );
      },
      dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Activation revocation could not be completed");
  }
}

export class WorkforceBulkDuplicateError extends ValidationError {
  readonly rowNumbers: readonly number[];

  constructor(rowNumbers: readonly number[]) {
    super("Duplicate national IDs were submitted");
    this.name = "WorkforceBulkDuplicateError";
    this.rowNumbers = rowNumbers;
  }
}

export type WorkforceBulkRowResult =
  | {
      rowNumber: number;
      status: "created" | "existing";
      userId: string;
      relationshipId: string;
      activationRequired: boolean;
    }
  | {
      rowNumber: number;
      status: "invalid";
      reason: "INVALID_ROW" | "CONFLICT" | "UNAVAILABLE";
    };

export type WorkforceBulkProvisionResult = {
  kind: WorkforceKind;
  hospitalId: string;
  rows: WorkforceBulkRowResult[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findDuplicateNationalIdRows(rows: readonly unknown[]): number[] {
  const firstSeen = new Map<string, number>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const nationalId =
      isRecord(row) && typeof row.nationalId === "string" ? row.nationalId.trim() : "";

    if (!nationalId) {
      return;
    }

    const first = firstSeen.get(nationalId);

    if (first === undefined) {
      firstSeen.set(nationalId, index);
      return;
    }

    duplicates.add(first + 1);
    duplicates.add(index + 1);
  });

  return [...duplicates].sort((left, right) => left - right);
}

/**
 * Provisions up to 50 people of one kind. Every row runs the single-person provisioning logic in
 * its own serializable transaction, so one bad row never blocks the others. Plaintext activation
 * tokens are intentionally dropped; they are only issued through activation slips or regeneration.
 */
export async function provisionWorkforceBulk(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceBulkProvisionResult> {
  const parsed = workforceBulkProvisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Bulk workforce data is invalid");
  }

  const { kind, rows, targetHospitalId, submissionId } = parsed.data;
  const capability = kind === "OSM" ? WORKFORCE_CAPABILITIES.osmProvision : WORKFORCE_CAPABILITIES.create;
  assertActorPolicy(actor, capability, targetHospitalId);
  if (!actor) throw new ForbiddenError();
  const duplicateRowNumbers = findDuplicateNationalIdRows(rows);
  if (duplicateRowNumbers.length > 0) throw new WorkforceBulkDuplicateError(duplicateRowNumbers);

  const database = getDatabase(dependencies);
  const now = getNow(dependencies);
  const expiresAt = workforceBulkSubmissionExpiry(submissionId, now);
  const requestFingerprint = fingerprintWorkforceBulkSubmission(actor.userId, parsed.data);
  const batchKey = { actorUserId: actor.userId, submissionId };
  const retryLimit = dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES;
  try {
    await runSerializable(database, async (transaction) => {
      await assertWorkforceProvisionerInDatabase(transaction, actor.userId, targetHospitalId, kind);
      const existing = await transaction.workforceBulkSubmission.findUnique({
        where: { actorUserId_submissionId: batchKey },
      });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint || existing.hospitalId !== targetHospitalId ||
          existing.kind !== kind || existing.rowCount !== rows.length || existing.expiresAt <= now) {
          throw new ConflictError("The submission key belongs to different workforce data");
        }
        return;
      }
      // Bounded cleanup; expired keys remain unusable because their timestamp is part of the key.
      const expired = await transaction.workforceBulkSubmission.findMany({
        where: { expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: 50,
        select: { actorUserId: true, submissionId: true },
      });
      if (expired.length) await transaction.workforceBulkSubmission.deleteMany({ where: { OR: expired } });
      await transaction.workforceBulkSubmission.create({ data: {
        ...batchKey, hospitalId: targetHospitalId, kind, requestFingerprint, rowCount: rows.length,
        createdAt: now, expiresAt,
      } });
    }, retryLimit);
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Bulk submission could not be established");
  }

  const results: WorkforceBulkRowResult[] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    const key = { ...batchKey, rowNumber };
    try {
      const committed = await runSerializable(database, async (transaction): Promise<{
        outcome: WorkforceBulkRowResult;
        takeoverTask: CaregiverInvitationTakeoverTask | null;
      }> => {
        // Replays must also reauthorize. Serializable ordering covers authority changes during each row.
        await assertWorkforceProvisionerInDatabase(transaction, actor.userId, targetHospitalId, kind);
        const batch = await transaction.workforceBulkSubmission.findUnique({ where: { actorUserId_submissionId: batchKey } });
        if (!batch || batch.expiresAt <= getNow(dependencies)) throw new ConflictError("Bulk submission expired");
        const receipt = await transaction.workforceBulkRowReceipt.findUnique({
          where: { actorUserId_submissionId_rowNumber: key },
        });
        if (receipt) {
          const saved = workforceBulkReceiptSchema.parse(receipt.result);
          if (saved.status !== "invalid" || saved.reason !== "UNAVAILABLE" || receipt.attempts >= WORKFORCE_BULK_MAX_ATTEMPTS) {
            return { outcome: saved, takeoverTask: null };
          }
        }
        const rowInput = { ...(isRecord(row) ? row : {}), targetHospitalId };
        const validated = kind === "OSM" ? osmProvisionSchema.safeParse(rowInput) : hospitalMemberProvisionSchema.safeParse(rowInput);
        let outcome: WorkforceBulkRowResult;
        let takeoverTask: CaregiverInvitationTakeoverTask | null = null;
        if (!validated.success) {
          outcome = { rowNumber, status: "invalid", reason: "INVALID_ROW" };
        } else {
          const identity = await createOrReuseWorkforceIdentity(transaction, {
            actorUserId: actor.userId, kind, hospitalId: targetHospitalId,
            nationalId: validated.data.nationalId, givenName: validated.data.givenName, familyName: validated.data.familyName,
            profession: "profession" in validated.data ? hospitalMemberProvisionSchema.shape.profession.parse(validated.data.profession) : null,
            now: getNow(dependencies), dependencies, issueInitialActivation: true,
          });
          outcome = { rowNumber, status: !identity.relationshipCreated && !identity.relationshipChanged ? "existing" : "created",
            userId: identity.userId, relationshipId: identity.relationshipId, activationRequired: identity.userStatus === UserStatus.PROVISIONED };
          takeoverTask = identity.takeoverTask;
        }
        await transaction.workforceBulkRowReceipt.upsert({ where: { actorUserId_submissionId_rowNumber: key },
          create: { ...key, result: outcome }, update: { result: outcome, attempts: { increment: 1 } } });
        return { outcome, takeoverTask };
      }, retryLimit);
      if (committed.takeoverTask) {
        await revokeCaregiverInvitationTakeoverSessionsAfterCommit(database, committed.takeoverTask, {
          revokeProviderSessions: dependencies.revokeProviderSessions,
        });
      }
      results.push(committed.outcome);
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) throw error;
      // Domain writes rolled back. Persist an explicit failure separately; never overwrite a concurrently committed success.
      const fallback: WorkforceBulkRowResult = { rowNumber, status: "invalid", reason:
        error instanceof ValidationError ? "INVALID_ROW" : error instanceof ConflictError ? "CONFLICT" : "UNAVAILABLE" };
      try {
        const result = await runSerializable(database, async (transaction): Promise<WorkforceBulkRowResult> => {
          await assertWorkforceProvisionerInDatabase(transaction, actor.userId, targetHospitalId, kind);
          const existing = await transaction.workforceBulkRowReceipt.findUnique({ where: { actorUserId_submissionId_rowNumber: key } });
          if (existing) {
            const saved = workforceBulkReceiptSchema.parse(existing.result);
            if (saved.status !== "invalid" || saved.reason !== "UNAVAILABLE" || existing.attempts >= WORKFORCE_BULK_MAX_ATTEMPTS) return saved;
          }
          await transaction.workforceBulkRowReceipt.upsert({ where: { actorUserId_submissionId_rowNumber: key },
            create: { ...key, result: fallback }, update: { result: fallback, attempts: { increment: 1 } } });
          return fallback;
        }, retryLimit);
        results.push(result);
      } catch (persistenceError: unknown) {
        throw normalizeDatabaseError(persistenceError, "Bulk outcomes could not be confirmed; retry the same submission");
      }
    }
  }
  return { kind, hospitalId: targetHospitalId, rows: results };
}

export type WorkforceActivationSlip = {
  userId: string;
  maskedName: string;
  hospitalName: string;
  activationToken: string;
  activationExpiresAt: Date;
};

export type WorkforceActivationSlipFailure = {
  userId: string;
  reason: "NOT_PENDING" | "IN_USE" | "UNAVAILABLE";
};

export type WorkforceActivationSlipResult = {
  kind: WorkforceKind;
  slips: WorkforceActivationSlip[];
  failures: WorkforceActivationSlipFailure[];
};

const IN_USE_ACTIVATION_MESSAGE = "The activation credential is currently being used";

/**
 * Issues fresh REMOTE credentials (revoking the previous ones) for selected pending people.
 * The returned plaintext tokens exist only in this result; callers must never persist or log them.
 */
export async function issueWorkforceActivationSlips(
  actor: ActorContext | null | undefined,
  input: WorkforceActivationSlipRequestInput,
  dependencies: WorkforceServiceDependencies = {},
): Promise<WorkforceActivationSlipResult> {
  const parsed = workforceActivationSlipRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Activation slip data is invalid");
  }

  const { kind, targetHospitalId, userIds } = parsed.data;

  assertActorPolicy(
    actor,
    kind === "OSM" ? WORKFORCE_CAPABILITIES.osmProvision : WORKFORCE_CAPABILITIES.create,
    targetHospitalId,
  );

  const database = getDatabase(dependencies);
  const slips: WorkforceActivationSlip[] = [];
  const failures: WorkforceActivationSlipFailure[] = [];

  for (const userId of userIds) {
    try {
      const slip = await runSerializable(
        database,
        async (transaction) => {
          const issued = await regenerateActivationInTransaction(transaction, {
            actorUserId: actor!.userId,
            request: { userId, targetHospitalId, kind, mode: "REMOTE" },
            now: getNow(dependencies),
            dependencies,
            source: "activation_slip",
          });
          const [user, hospital] = await Promise.all([
            transaction.user.findUnique({
              where: { id: userId },
              select: { person: { select: { givenName: true, familyName: true } } },
            }),
            transaction.hospital.findUnique({
              where: { id: targetHospitalId },
              select: { name: true },
            }),
          ]);

          if (!user || !hospital) {
            throw new NotFoundError("The workforce account was not found");
          }

          return {
            userId,
            maskedName: maskPersonName(user.person.givenName, user.person.familyName),
            hospitalName: hospital.name,
            activationToken: issued.activationToken,
            activationExpiresAt: issued.activationExpiresAt,
          };
        },
        dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES,
      );

      slips.push(slip);
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      failures.push({
        userId,
        reason:
          error instanceof ConflictError && error.message === IN_USE_ACTIVATION_MESSAGE
            ? "IN_USE"
            : error instanceof ConflictError || error instanceof NotFoundError
              ? "NOT_PENDING"
              : "UNAVAILABLE",
      });
    }
  }

  return { kind, slips, failures };
}

export type WorkforceHospitalOwnerForReset = {
  userId: string;
  displayName: string;
  canReset: boolean;
};

/** Platform ADMIN only: the OWNERs of a Hospital whose password can be reset in person (D3). */
export async function listHospitalOwnersForPasswordReset(
  actor: ActorContext | null | undefined,
  hospitalId: string,
  database: WorkforceDatabase = getPrisma(),
): Promise<WorkforceHospitalOwnerForReset[]> {
  const parsedHospitalId = workforceTargetHospitalIdSchema.safeParse(hospitalId);

  if (!parsedHospitalId.success) {
    throw new ValidationError("Hospital selection is invalid");
  }

  if (!actor?.roles.includes(Role.ADMIN)) {
    throw new ForbiddenError();
  }

  try {
    const currentActor = await database.user.findUnique({
      where: { id: actor.userId },
      select: { status: true, roles: { select: { role: true } } },
    });

    if (
      currentActor?.status !== UserStatus.ACTIVE ||
      !currentActor.roles.some(({ role }) => role === Role.ADMIN)
    ) {
      throw new ForbiddenError();
    }

    const owners = await database.hospitalMembership.findMany({
      where: {
        hospitalId: parsedHospitalId.data,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        userId: true,
        user: {
          select: {
            status: true,
            authSubject: true,
            roles: { select: { role: true } },
            person: { select: { givenName: true, familyName: true } },
          },
        },
      },
    });

    return owners.map(({ userId, user }) => ({
      userId,
      displayName: toDisplayName(user.person.givenName, user.person.familyName),
      canReset: false,
    }));
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Hospital Owners could not be loaded");
  }
}

async function assertEligibleOwnerRemains(transaction: Prisma.TransactionClient, hospitalId: string): Promise<void> {
  const eligibleOwnerCount = await transaction.hospitalMembership.count({
    where: {
      hospitalId: hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      user: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.HOSPITAL } },
      },
    },
  });

  if (eligibleOwnerCount < 2) {
    throw new ConflictError("At least one eligible Hospital Owner must remain");
  }
}

export async function releaseWorkforceRelationship(
  actor: ActorContext | null | undefined, input: unknown, dependencies: WorkforceServiceDependencies = {},
): Promise<{ relationshipId: string; hospitalId: string }> {
  const parsed = workforceReleaseSchema.safeParse(input);
  if (!actor) throw new ForbiddenError();
  if (!parsed.success) throw new ValidationError("Workforce release data is invalid");
  const data = parsed.data;
  assertActorPolicy(actor, WORKFORCE_CAPABILITIES.release, data.targetHospitalId);
  try {
    return await runSerializable(getDatabase(dependencies), async (tx) => {
      await assertOwnerInDatabase(tx, actor.userId, data.targetHospitalId);
      const current = data.kind === "osm"
        ? await tx.osmHospitalRelationship.findFirst({ where: { id: data.relationshipId, hospitalId: data.targetHospitalId }, select: { id: true, userId: true, status: true, updatedAt: true } })
        : await tx.hospitalMembership.findFirst({ where: { id: data.relationshipId, hospitalId: data.targetHospitalId }, select: { id: true, userId: true, status: true, updatedAt: true, membershipType: true } });
      if (!current) throw new NotFoundError();
      if (current.status === MembershipStatus.ENDED || current.updatedAt.getTime() !== new Date(data.expectedUpdatedAt).getTime()) throw new ConflictError("Workforce relationship changed or is permanently ended");
      if ("membershipType" in current && current.membershipType === MembershipType.OWNER && current.status === MembershipStatus.ACTIVE) {
        await assertEligibleOwnerRemains(tx, data.targetHospitalId);
      }
      const now = getNow(dependencies);
      const where = { id: current.id, status: current.status, updatedAt: current.updatedAt };
      const updated = data.kind === "osm"
        ? await tx.osmHospitalRelationship.updateMany({ where, data: { status: MembershipStatus.ENDED } })
        : await tx.hospitalMembership.updateMany({ where, data: { status: MembershipStatus.ENDED } });
      if (updated.count !== 1) throw new ConflictError("Workforce relationship changed");
      // Patient assignments are supported only by the OSM relationship; ending a staff membership leaves them intact.
      const ended = data.kind === "osm"
        ? await tx.patientOsmAssignment.updateMany({
          where: { osmUserId: current.userId, endedAt: null, patientHospitalRelationship: { hospitalId: data.targetHospitalId } },
          data: { endedAt: now, endedByUserId: actor.userId },
        })
        : { count: 0 };
      // Tokens are global credential capabilities. Revoke all outstanding workforce tokens of this user.
      const revoked = await tx.workforceActivation.updateMany({ where: { userId: current.userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await recordAuditEvent({ actorUserId: actor.userId, action: "workforce.permanently_released",
        resourceType: data.kind === "osm" ? "OsmHospitalRelationship" : "HospitalMembership", resourceId: current.id,
        metadata: { hospitalId: data.targetHospitalId, targetUserId: current.userId, fromStatus: current.status, toStatus: MembershipStatus.ENDED,
          endedAssignmentCount: ended.count, revokedActivationCount: revoked.count } }, tx);
      return { relationshipId: current.id, hospitalId: data.targetHospitalId };
    }, dependencies.transactionRetries ?? DEFAULT_TRANSACTION_RETRIES);
  } catch (error: unknown) { throw normalizeDatabaseError(error, "Workforce release could not be completed"); }
}
