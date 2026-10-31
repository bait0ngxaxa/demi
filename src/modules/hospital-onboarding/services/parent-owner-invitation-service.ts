import "server-only";

import {
  HospitalOnboardingApplicationStatus,
  HospitalStatus,
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  UserTakeoverProviderState,
  WorkforceActivationPurpose,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { isRetryableSerializableTransactionError, runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ProviderSessionRevocationOutcome } from "@/modules/account-security/adapters/supabase-account-security-provider";
import {
  revokeCaregiverInvitationTakeoverSessionsAfterCommit,
  type CaregiverInvitationTakeoverTask,
} from "@/modules/account-security/services/caregiver-invitation-takeover-lock";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assertPlatformAdminInDatabase } from "@/modules/hospital-governance/services/hospital-governance-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import type { ActivationCredentialGenerator } from "@/modules/workforce/services/activation-token-service";
import {
  writeHospitalOwnerInvitationInTransaction,
  type HospitalOwnerInvitationIssue,
  type HospitalOwnerInvitationView,
} from "@/modules/workforce/services/hospital-owner-invitation";
import { issueHospitalOwnerActivation, revokeHospitalOwnerActivation } from "@/modules/workforce/services/workforce-service";
import { ApplicationError, ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { assertHospitalOnboardingCapability, HOSPITAL_ONBOARDING_CAPABILITIES } from "../policies/hospital-onboarding-policy";
import {
  parentOwnerHospitalIdListSchema,
  parentOwnerInvitationCancelSchema,
  parentOwnerInvitationTargetSchema,
  parentOwnerInviteeSchema,
  parentOwnerLinkIssueSchema,
  type ParentOwnerInviteeInput,
} from "../schemas/parent-owner-invitation-schemas";
import { openOwnerInvitationWhere, parentOwnerInvitableHospitalWhere } from "./parent-owner-invitation-context";

export type ParentOwnerInvitationDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  generateCredential?: ActivationCredentialGenerator;
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
};

const PARENT_OWNER_PURPOSE = WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING;

function getDatabase(dependencies: ParentOwnerInvitationDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: ParentOwnerInvitationDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function parse<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } }, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Parent owner invitation data is invalid");
  return parsed.data;
}

function requireAdminActor(actor: ActorContext | null | undefined): ActorContext {
  if (!actor) throw new ForbiddenError();
  assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.ownerInvite);
  return actor;
}

/** Serializable, never replayed: a concurrent change (including the open-invitation unique index) is a conflict. */
async function operation<T>(database: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await runSerializableTransaction(database, work, 0);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (isRetryableSerializableTransactionError(error)) throw new ConflictError("The owner invitation changed concurrently; reload before retrying");
    throw new InfrastructureError("Parent owner invitation could not be completed");
  }
}

/**
 * Plain reads for the ADMIN page and directory: each query sees committed data, and nothing here writes, so there is
 * no serializable transaction whose serialization failure would break the page.
 */
async function read<T>(database: PrismaClient, work: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await work(database);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Parent owner invitation could not be loaded");
  }
}

async function revokeHeldInviteeSessions(
  database: PrismaClient,
  takeoverTask: CaregiverInvitationTakeoverTask | null,
  dependencies: ParentOwnerInvitationDependencies,
): Promise<void> {
  if (!takeoverTask) return;
  await revokeCaregiverInvitationTakeoverSessionsAfterCommit(database, takeoverTask, {
    revokeProviderSessions: dependencies.revokeProviderSessions,
  });
}

type InvitableParent = { id: string; hospitalCode: string; name: string; status: HospitalStatus };

/**
 * ADR-0024 (Q1/Q3): the Hospital is an invitable Parent (role PARENT, never a Child), PENDING_VERIFICATION or ACTIVE
 * without an ACTIVE OWNER, and has no PENDING public application (ADMIN decides it first).
 */
async function findManageableParent(transaction: Prisma.TransactionClient, hospitalId: string): Promise<InvitableParent> {
  const hospital = await transaction.hospital.findUnique({ where: { id: hospitalId }, select: { id: true } });
  if (!hospital) throw new NotFoundError("The Hospital was not found");
  const [parent, pendingApplication] = await Promise.all([
    transaction.hospital.findFirst({
      where: { id: hospitalId, ...parentOwnerInvitableHospitalWhere },
      select: { id: true, hospitalCode: true, name: true, status: true },
    }),
    transaction.hospitalOnboardingApplication.findFirst({
      where: { hospitalId, status: HospitalOnboardingApplicationStatus.PENDING },
      select: { id: true },
    }),
  ]);
  if (!parent) throw new ConflictError("Only a Parent Hospital can take a platform ADMIN owner invitation");
  if (pendingApplication) throw new ConflictError("A pending onboarding application must be decided first");
  if (parent.status === HospitalStatus.ACTIVE && (await hasActiveOwner(transaction, parent.id))) {
    throw new ConflictError("The Hospital already has an active owner");
  }
  return parent;
}

async function hasActiveOwner(transaction: Prisma.TransactionClient, hospitalId: string): Promise<boolean> {
  return await transaction.hospitalMembership.findFirst({
    where: { hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    select: { id: true },
  }) !== null;
}

const openInvitationSelect = {
  id: true,
  userId: true,
  status: true,
  createdAt: true,
  invitedByUserId: true,
  invitedViaServiceAreaId: true,
  user: {
    select: {
      identityAssurance: true,
      takeoverLock: { select: { providerState: true, heldOwnerMembershipIds: true } },
      person: { select: { givenName: true, familyName: true } },
    },
  },
} satisfies Prisma.HospitalMembershipSelect;

type OpenInvitation = Prisma.HospitalMembershipGetPayload<{ select: typeof openInvitationSelect }>;

async function findOpenOwnerInvitation(transaction: Prisma.TransactionClient, hospitalId: string): Promise<OpenInvitation | null> {
  const open = await transaction.hospitalMembership.findFirst({
    where: { hospitalId, ...openOwnerInvitationWhere },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: openInvitationSelect,
  });
  // Only an ADMIN Parent invitation exists on an invitable Parent; anything else needs reconciliation.
  if (open && (open.invitedByUserId === null || open.invitedViaServiceAreaId !== null)) {
    throw new ConflictError("The open owner invitation requires reconciliation");
  }
  return open;
}

function isHeldForAdminReset(invitation: OpenInvitation): boolean {
  const lock = invitation.user.takeoverLock;
  return invitation.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION &&
    lock !== null && lock.providerState !== UserTakeoverProviderState.RESOLVED &&
    lock.heldOwnerMembershipIds.includes(invitation.id);
}

function isCaregiverClaimed(invitation: OpenInvitation): boolean {
  return invitation.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
    (invitation.user.takeoverLock !== null && invitation.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED);
}

/** Ends the open invitation in the same transaction: an unclaimed link is revoked, the membership becomes ENDED. */
async function endOpenOwnerInvitation(
  transaction: Prisma.TransactionClient,
  input: { invitation: OpenInvitation; actorUserId: string; now: Date; reason: string },
): Promise<void> {
  if (input.invitation.status === MembershipStatus.PROVISIONED) {
    await revokeHospitalOwnerActivation(transaction, {
      purpose: PARENT_OWNER_PURPOSE, membershipId: input.invitation.id, actorUserId: input.actorUserId, now: input.now, source: input.reason,
    });
  }
  const ended = await transaction.hospitalMembership.updateMany({
    where: { id: input.invitation.id, status: input.invitation.status },
    data: { status: MembershipStatus.ENDED },
  });
  if (ended.count !== 1) throw new ConflictError("The owner invitation changed concurrently");
}

/**
 * Nonce replay (like `createHospital`): the same Hospital and invitee identity answer ALREADY_ISSUED without a new
 * token; any other use of the nonce is a conflict. Returns null while the nonce is unused.
 */
async function findReplayedInvitation(
  database: Pick<Prisma.TransactionClient, "hospitalMembership">,
  input: Pick<ParentOwnerInviteeInput, "submissionNonce" | "hospitalId" | "nationalId">,
): Promise<HospitalOwnerInvitationIssue | null> {
  const existing = await database.hospitalMembership.findUnique({
    where: { invitationNonce: input.submissionNonce },
    select: { hospitalId: true, user: { select: { person: { select: { identityKeyHash: true } } } } },
  });
  if (!existing) return null;
  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: input.nationalId });
  if (existing.hospitalId !== input.hospitalId || existing.user.person.identityKeyHash !== identityKeyHash) {
    throw new ConflictError("This submission was already used for a different invitation");
  }
  return { status: "ALREADY_ISSUED" };
}

async function inviteInTransaction(
  transaction: Prisma.TransactionClient,
  input: { actor: ActorContext; data: ParentOwnerInviteeInput; now: Date; replaceOpen: boolean; generateCredential?: ActivationCredentialGenerator },
): Promise<{ issue: HospitalOwnerInvitationIssue; takeoverTask: CaregiverInvitationTakeoverTask | null }> {
  await assertPlatformAdminInDatabase(transaction, input.actor.userId);
  const replayed = await findReplayedInvitation(transaction, input.data);
  if (replayed) return { issue: replayed, takeoverTask: null };

  const parent = await findManageableParent(transaction, input.data.hospitalId);
  const open = await findOpenOwnerInvitation(transaction, parent.id);
  if (open && !input.replaceOpen) throw new ConflictError("An owner invitation is already open for this Hospital");
  if (open) {
    await endOpenOwnerInvitation(transaction, { invitation: open, actorUserId: input.actor.userId, now: input.now, reason: "invitee_changed" });
  }

  const written = await writeHospitalOwnerInvitationInTransaction(transaction, {
    actorUserId: input.actor.userId,
    hospitalId: parent.id,
    binding: { kind: "PARENT", invitationNonce: input.data.submissionNonce },
    invitee: input.data,
    now: input.now,
    generateCredential: input.generateCredential,
  });
  const replacement = parent.status === HospitalStatus.ACTIVE;
  await recordAuditEvent({
    actorUserId: input.actor.userId,
    action: open ? "hospital.parent_owner_invitee_changed" : "hospital.parent_owner_invited",
    resourceType: "Hospital",
    resourceId: parent.id,
    metadata: {
      membershipId: written.membershipId,
      delivery: written.delivery,
      replacement,
      ...(open ? { previousMembershipId: open.id, previousStatus: open.status } : {}),
    },
  }, transaction);
  return { issue: written.issue, takeoverTask: written.takeoverTask };
}

async function invite(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies,
  replaceOpen: boolean,
): Promise<HospitalOwnerInvitationIssue> {
  const admin = requireAdminActor(actor);
  const data = parse(parentOwnerInviteeSchema, input);
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    const outcome = await operation(database, (tx) => inviteInTransaction(tx, {
      actor: admin, data, now, replaceOpen, generateCredential: dependencies.generateCredential,
    }));
    await revokeHeldInviteeSessions(database, outcome.takeoverTask, dependencies);
    return outcome.issue;
  } catch (error: unknown) {
    // A concurrent submit of the same nonce may have won: answer ALREADY_ISSUED when it matches.
    if (error instanceof ConflictError) {
      const replayed = await findReplayedInvitation(database, data).catch((replayError: unknown) => {
        if (replayError instanceof ConflictError) throw replayError;
        throw new InfrastructureError("Parent owner invitation could not be completed");
      });
      if (replayed) return replayed;
    }
    throw error;
  }
}

/**
 * ADR-0024 (path B): platform ADMIN invites the first OWNER of a pending Parent Hospital, or a replacement OWNER of an
 * ACTIVE Parent without an ACTIVE OWNER (Q3). Identity and delivery are those of a Child OWNER invitation (Q4).
 */
export async function inviteParentOwner(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<HospitalOwnerInvitationIssue> {
  return invite(actor, input, dependencies, false);
}

/** Invites another person: the open invitation (if any) ends first in the same transaction, as for a Child. */
export async function changeParentOwnerInvitee(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<HospitalOwnerInvitationIssue> {
  return invite(actor, input, dependencies, true);
}

/** Issues a new REMOTE or ASSISTED link for the PROVISIONED invitation; the previous unclaimed link is revoked. */
export async function issueParentOwnerLink(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<HospitalOwnerInvitationIssue> {
  const admin = requireAdminActor(actor);
  const data = parse(parentOwnerLinkIssueSchema, input);
  const now = getNow(dependencies);

  return operation(getDatabase(dependencies), async (tx) => {
    await assertPlatformAdminInDatabase(tx, admin.userId);
    const parent = await findManageableParent(tx, data.hospitalId);
    const invitation = await findOpenOwnerInvitation(tx, parent.id);
    if (!invitation || invitation.status !== MembershipStatus.PROVISIONED) {
      throw new ConflictError("No owner invitation is waiting for an activation link");
    }
    if (isCaregiverClaimed(invitation)) {
      throw new ConflictError("This owner invitation is waiting for platform ADMIN identity verification");
    }
    // The latest issuer becomes the inviter whose ADMIN authority completion re-checks.
    const rebound = await tx.hospitalMembership.updateMany({
      where: { id: invitation.id, status: MembershipStatus.PROVISIONED },
      data: { invitedByUserId: admin.userId },
    });
    if (rebound.count !== 1) throw new ConflictError("The owner invitation changed concurrently");
    const issued = await issueHospitalOwnerActivation(tx, {
      purpose: PARENT_OWNER_PURPOSE,
      userId: invitation.userId,
      createdByUserId: admin.userId,
      hospitalId: parent.id,
      membershipId: invitation.id,
      mode: data.mode,
      now,
      source: "explicit_regeneration",
      generateCredential: dependencies.generateCredential,
    });
    await recordAuditEvent({
      actorUserId: admin.userId,
      action: "hospital.parent_owner_link_issued",
      resourceType: "Hospital",
      resourceId: parent.id,
      metadata: { membershipId: invitation.id, mode: data.mode },
    }, tx);
    return { status: "ACTIVATION_LINK", ...issued };
  });
}

/** Revokes the open link, or ends a held (caregiver-claimed) invitation; the Hospital itself is unchanged. */
export async function revokeParentOwnerLink(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<void> {
  const admin = requireAdminActor(actor);
  const data = parse(parentOwnerInvitationTargetSchema, input);
  const now = getNow(dependencies);

  await operation(getDatabase(dependencies), async (tx) => {
    await assertPlatformAdminInDatabase(tx, admin.userId);
    const parent = await findManageableParent(tx, data.hospitalId);
    const invitation = await findOpenOwnerInvitation(tx, parent.id);
    if (!invitation) throw new ConflictError("No activation link is open for this Hospital");
    const held = isHeldForAdminReset(invitation);
    if (held) {
      await endOpenOwnerInvitation(tx, { invitation, actorUserId: admin.userId, now, reason: "admin_cancelled_held_invitation" });
    } else {
      if (invitation.status !== MembershipStatus.PROVISIONED) throw new ConflictError("No activation link is open for this Hospital");
      const revoked = await revokeHospitalOwnerActivation(tx, {
        purpose: PARENT_OWNER_PURPOSE, membershipId: invitation.id, actorUserId: admin.userId, now, source: "admin_revocation",
      });
      if (!revoked) throw new ConflictError("No activation link is open for this Hospital");
    }
    await recordAuditEvent({
      actorUserId: admin.userId,
      action: "hospital.parent_owner_link_revoked",
      resourceType: "Hospital",
      resourceId: parent.id,
      metadata: { membershipId: invitation.id, invitationEnded: held },
    }, tx);
  });
}

/**
 * ADR-0024: platform ADMIN withdraws the Hospital's current open ADMIN invitation in any state (open or expired link,
 * awaiting acceptance, or held for an ADMIN reset): an unclaimed link is revoked and the membership ENDS, so a pending
 * Parent returns to the public application list and may be invited again. A link being used is a conflict. Not blocked
 * by the Hospital's status or applications, so an invitation can always be withdrawn.
 */
export async function cancelParentOwnerInvitation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<void> {
  const admin = requireAdminActor(actor);
  const data = parse(parentOwnerInvitationCancelSchema, input);
  const now = getNow(dependencies);

  await operation(getDatabase(dependencies), async (tx) => {
    await assertPlatformAdminInDatabase(tx, admin.userId);
    const membership = await tx.hospitalMembership.findFirst({
      where: { id: data.membershipId, hospitalId: data.hospitalId, ...openOwnerInvitationWhere },
      select: { id: true, invitedByUserId: true, invitedViaServiceAreaId: true },
    });
    if (!membership) throw new NotFoundError("The owner invitation was not found");
    if (membership.invitedByUserId === null || membership.invitedViaServiceAreaId !== null) {
      throw new ConflictError("Only a platform ADMIN Parent owner invitation can be cancelled here");
    }
    const invitation = await findOpenOwnerInvitation(tx, data.hospitalId);
    if (invitation?.id !== membership.id) throw new ConflictError("The owner invitation changed concurrently");
    const held = isHeldForAdminReset(invitation);
    // A claimed link fails inside the revoke, so the transaction rolls back and nothing changes.
    await endOpenOwnerInvitation(tx, {
      invitation, actorUserId: admin.userId, now, reason: held ? "admin_cancelled_held_invitation" : "admin_cancelled_invitation",
    });
    await recordAuditEvent({
      actorUserId: admin.userId,
      action: "hospital.parent_owner_invitation_cancelled",
      resourceType: "Hospital",
      resourceId: data.hospitalId,
      metadata: { membershipId: invitation.id, fromStatus: invitation.status, held },
    }, tx);
  });
}

export type ParentOwnerInvitationAvailability =
  /** Pending Parent: invite its first OWNER. */
  | "FIRST_OWNER"
  /** ACTIVE Parent without an ACTIVE OWNER: invite a replacement (Q3). */
  | "REPLACEMENT"
  /** A PENDING public application must be decided first (Q1). */
  | "PENDING_APPLICATION"
  /** Not invitable: a Child, SUSPENDED/RETIRED, or ACTIVE with an ACTIVE OWNER. */
  | "UNAVAILABLE";

export type ParentOwnerInvitationState = {
  hospital: InvitableParent;
  availability: ParentOwnerInvitationAvailability;
  pendingApplication: { id: string; createdAt: Date } | null;
  invitation: (HospitalOwnerInvitationView & { invitedAt: Date }) | null;
  lastDeclinedAt: Date | null;
};

/** ADMIN Hospital page projection of the Parent OWNER invitation path. Read-only; every caller is a persisted ADMIN. */
export async function getParentOwnerInvitationState(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<ParentOwnerInvitationState> {
  const admin = requireAdminActor(actor);
  const { hospitalId } = parse(parentOwnerInvitationTargetSchema, input);
  const now = getNow(dependencies);

  return read(getDatabase(dependencies), async (tx) => {
    await assertPlatformAdminInDatabase(tx, admin.userId);
    const hospital = await tx.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, hospitalCode: true, name: true, status: true },
    });
    if (!hospital) throw new NotFoundError("The Hospital was not found");
    const [invitable, pendingApplication, activeOwner, declined, open] = await Promise.all([
      tx.hospital.findFirst({ where: { id: hospitalId, ...parentOwnerInvitableHospitalWhere }, select: { id: true } }),
      tx.hospitalOnboardingApplication.findFirst({
        where: { hospitalId, status: HospitalOnboardingApplicationStatus.PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, createdAt: true },
      }),
      hasActiveOwner(tx, hospitalId),
      tx.hospitalMembership.findFirst({
        where: { hospitalId, membershipType: MembershipType.OWNER, invitationDeclinedAt: { not: null }, invitedViaServiceAreaId: null },
        orderBy: [{ invitationDeclinedAt: "desc" }, { id: "desc" }],
        select: { invitationDeclinedAt: true },
      }),
      tx.hospitalMembership.findFirst({
        where: { hospitalId, ...openOwnerInvitationWhere, invitedByUserId: { not: null }, invitedViaServiceAreaId: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: openInvitationSelect,
      }),
    ]);
    const activation = open?.status === MembershipStatus.PROVISIONED
      ? await tx.workforceActivation.findFirst({
          where: { relationshipId: open.id, purpose: PARENT_OWNER_PURPOSE, usedAt: null, revokedAt: null },
          select: { expiresAt: true, mode: true, claimedAt: true },
        })
      : null;

    const availability: ParentOwnerInvitationAvailability = !invitable
      ? "UNAVAILABLE"
      : pendingApplication
        ? "PENDING_APPLICATION"
        : hospital.status === HospitalStatus.PENDING_VERIFICATION
          ? "FIRST_OWNER"
          : activeOwner ? "UNAVAILABLE" : "REPLACEMENT";

    return {
      hospital,
      availability,
      pendingApplication,
      invitation: open ? {
        membershipId: open.id,
        inviteeName: [open.user.person.givenName, open.user.person.familyName].filter(Boolean).join(" "),
        delivery: isHeldForAdminReset(open)
          ? "ADMIN_RESET_REQUIRED"
          : open.status === MembershipStatus.INVITED ? "ACCOUNT_ACCEPTANCE" : "ACTIVATION_LINK",
        link: !activation
          ? { status: "NONE", expiresAt: null, mode: null }
          : {
              status: activation.claimedAt ? "IN_USE" : activation.expiresAt <= now ? "EXPIRED" : "OPEN",
              expiresAt: activation.expiresAt,
              mode: activation.mode,
            },
        invitedAt: open.createdAt,
      } : null,
      lastDeclinedAt: declined?.invitationDeclinedAt ?? null,
    };
  });
}

/** ADMIN directory cue (PO-2): which onboarding path is open for each listed Hospital. */
export type ParentOnboardingPath = "PENDING_APPLICATION" | "OPEN_INVITATION";

export async function listParentOnboardingPaths(
  actor: ActorContext | null | undefined,
  hospitalIds: readonly string[],
  dependencies: ParentOwnerInvitationDependencies = {},
): Promise<Map<string, ParentOnboardingPath>> {
  const admin = requireAdminActor(actor);
  const ids = parse(parentOwnerHospitalIdListSchema, [...hospitalIds]);
  if (ids.length === 0) return new Map();

  return read(getDatabase(dependencies), async (tx) => {
    await assertPlatformAdminInDatabase(tx, admin.userId);
    const [applications, invitations] = await Promise.all([
      tx.hospitalOnboardingApplication.findMany({
        where: { hospitalId: { in: ids }, status: HospitalOnboardingApplicationStatus.PENDING },
        select: { hospitalId: true },
      }),
      tx.hospitalMembership.findMany({
        where: { hospitalId: { in: ids }, ...openOwnerInvitationWhere, invitedByUserId: { not: null }, invitedViaServiceAreaId: null },
        select: { hospitalId: true },
      }),
    ]);
    return new Map<string, ParentOnboardingPath>([
      ...invitations.map(({ hospitalId }): [string, ParentOnboardingPath] => [hospitalId, "OPEN_INVITATION"]),
      ...applications.map(({ hospitalId }): [string, ParentOnboardingPath] => [hospitalId, "PENDING_APPLICATION"]),
    ]);
  });
}
