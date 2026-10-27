import "server-only";

import {
  IdentityAssurance,
  HospitalRetirementEventKind,
  HospitalServiceAreaFacilityKind,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  WorkforceActivationPurpose,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  lockCaregiverInvitationIdentityInTransaction,
  revokeCaregiverInvitationTakeoverSessionsAfterCommit,
  type CaregiverInvitationTakeoverTask,
} from "@/modules/account-security/services/caregiver-invitation-takeover-lock";
import type { ProviderSessionRevocationOutcome } from "@/modules/account-security/adapters/supabase-account-security-provider";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { unreconciledAccountRecoveryWhere, unreconciledWorkforceResetWhere } from "@/modules/auth/services/credential-recovery-state";
import { generateUniqueHospitalCode } from "@/modules/hospital-governance/services/hospital-governance-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { assertWorkforceRelationshipsCompatible } from "@/modules/identity/services/workforce-relationship-compatibility";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import type { ActivationCredentialGenerator } from "@/modules/workforce/services/activation-token-service";
import {
  issueChildOwnerActivation,
  resolveWorkforceGrantee,
  revokeChildOwnerActivation,
} from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { HOSPITAL_SERVICE_AREA_CAPABILITIES } from "../policies/hospital-service-area-policy";
import {
  childFacilityCancelSchema,
  childFacilityCreateSchema,
  childFacilityRenameSchema,
  childFacilityTargetSchema,
  childOwnerInvitationResponseSchema,
  childOwnerInviteeSchema,
  childOwnerLinkIssueSchema,
} from "../schemas/hospital-service-area-schemas";
import { activatePendingChildOwner, assertChildOwnerInvitationContext } from "./child-owner-invitation-context";
import { authorize, operation } from "./hospital-service-area-service";

export type ChildFacilityDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  generateCredential?: ActivationCredentialGenerator;
  revokeProviderSessions?: (authSubject: string) => Promise<ProviderSessionRevocationOutcome>;
};

/**
 * What the Parent sees right after an invitation. The plaintext token exists only in ACTIVATION_LINK and is never
 * stored, so a replayed submission answers ALREADY_ISSUED and the Parent regenerates the link when needed.
 */
export type ChildOwnerInvitationIssue =
  | { status: "ACTIVATION_LINK"; activationToken: string; activationExpiresAt: Date; activationMode: "REMOTE" | "ASSISTED" }
  | { status: "AWAITING_ACCEPTANCE" }
  | { status: "ADMIN_RESET_REQUIRED" }
  | { status: "ALREADY_ISSUED" };

export type ChildFacility = { id: string; hospitalCode: string; name: string };
export type ChildFacilityCreateResult = { child: ChildFacility; invitation: ChildOwnerInvitationIssue };

type ChildOwnerInvitee = { nationalId: string; givenName: string; familyName: string; mode: "REMOTE" | "ASSISTED" };

const OPEN_INVITATION_STATUSES = [MembershipStatus.PROVISIONED, MembershipStatus.INVITED];

function getDatabase(dependencies: ChildFacilityDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: ChildFacilityDependencies): Date {
  return dependencies.now ? new Date(dependencies.now().getTime()) : new Date();
}

function parse<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } }, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}

/**
 * Grants the Child's first (or replacement) OWNER invitation (O-D4/O-D6). A new or reusable PROVISIONED account gets a
 * PROVISIONED OWNER membership and a workforce activation credential; an ACTIVE account gets an INVITED membership and
 * no credential, so nothing is granted until that person accepts in their own session (ADR-0012).
 */
async function inviteChildOwnerInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    parentHospitalId: string;
    childHospitalId: string;
    areaId: string;
    invitee: ChildOwnerInvitee;
    now: Date;
    generateCredential?: ActivationCredentialGenerator;
  },
): Promise<{ issue: ChildOwnerInvitationIssue; takeoverTask: CaregiverInvitationTakeoverTask | null }> {
  const { user } = await resolveWorkforceGrantee(transaction, { hospitalId: input.childHospitalId, ...input.invitee });
  await assertWorkforceRelationshipsCompatible(transaction, user.id, "HOSPITAL");
  const open = await transaction.hospitalMembership.findFirst({
    where: { userId: user.id, hospitalId: input.childHospitalId, status: { not: MembershipStatus.ENDED } },
    select: { id: true },
  });
  if (open) throw new ConflictError("The invitee already has a relationship with this facility");

  const caregiverClaimed = user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION;
  const accepting = user.status === UserStatus.ACTIVE && !caregiverClaimed;
  if (!accepting) {
    await transaction.userRole.upsert({
      where: { userId_role: { userId: user.id, role: Role.HOSPITAL } },
      update: {},
      create: { userId: user.id, role: Role.HOSPITAL },
    });
  }
  const membership = await transaction.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.childHospitalId,
      membershipType: MembershipType.OWNER,
      status: accepting ? MembershipStatus.INVITED : MembershipStatus.PROVISIONED,
      invitedByUserId: input.actorUserId,
      invitedViaServiceAreaId: input.areaId,
    },
    select: { id: true, status: true },
  });
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "hospital_membership.provisioned",
    resourceType: "HospitalMembership",
    resourceId: membership.id,
    metadata: { role: Role.HOSPITAL, profession: null, status: membership.status },
  }, transaction);

  let takeoverTask: CaregiverInvitationTakeoverTask | null = null;
  const issue: ChildOwnerInvitationIssue = caregiverClaimed
    ? { status: "ADMIN_RESET_REQUIRED" }
    : accepting
      ? { status: "AWAITING_ACCEPTANCE" }
      : {
        status: "ACTIVATION_LINK",
        ...(await issueChildOwnerActivation(transaction, {
          userId: user.id,
          createdByUserId: input.actorUserId,
          childHospitalId: input.childHospitalId,
          membershipId: membership.id,
          mode: input.invitee.mode,
          now: input.now,
          source: "child_owner_invitation",
          generateCredential: input.generateCredential,
        })),
      };

  if (caregiverClaimed) {
    takeoverTask = await lockCaregiverInvitationIdentityInTransaction(transaction, {
      userId: user.id,
      actorUserId: input.actorUserId,
      hospitalId: input.childHospitalId,
      now: input.now,
      heldOwnerMembershipId: membership.id,
    });
    if (!takeoverTask) throw new InfrastructureError("The caregiver account could not be quarantined");
  }

  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "hospital.child_owner_invited",
    resourceType: "Hospital",
    resourceId: input.childHospitalId,
    metadata: {
      parentHospitalId: input.parentHospitalId,
      membershipId: membership.id,
      delivery: caregiverClaimed ? "ADMIN_RESET_REQUIRED" : accepting ? "ACCOUNT_ACCEPTANCE" : input.invitee.mode,
    },
  }, transaction);

  return { issue, takeoverTask };
}

async function revokeHeldInviteeSessions(
  database: PrismaClient,
  takeoverTask: CaregiverInvitationTakeoverTask | null,
  dependencies: ChildFacilityDependencies,
): Promise<void> {
  if (!takeoverTask) return;
  await revokeCaregiverInvitationTakeoverSessionsAfterCommit(database, takeoverTask, {
    revokeProviderSessions: dependencies.revokeProviderSessions,
  });
}

const managedChildSelect = {
  id: true,
  child: {
    select: {
      id: true, hospitalCode: true, name: true, status: true, updatedAt: true, registeredForParentHospitalId: true,
      serviceAreaEligibility: { select: { kind: true } },
    },
  },
} satisfies Prisma.HospitalServiceAreaSelect;

type ManagedChild = Prisma.HospitalServiceAreaGetPayload<{ select: typeof managedChildSelect }>;

/** The Child of an ACTIVE association of this exact Parent. A transferred or ended Child is not found (O1-E). */
async function findManagedChild(
  transaction: Prisma.TransactionClient,
  parentHospitalId: string,
  childHospitalId: string,
): Promise<ManagedChild> {
  const area = await transaction.hospitalServiceArea.findFirst({
    where: { parentHospitalId, childHospitalId, endedAt: null },
    select: managedChildSelect,
  });
  if (!area || area.child.serviceAreaEligibility?.kind !== HospitalServiceAreaFacilityKind.CHILD) throw new NotFoundError();
  return area;
}

async function findOpenOwnerInvitation(
  transaction: Prisma.TransactionClient,
  childHospitalId: string,
): Promise<{
  id: string;
  userId: string;
  status: MembershipStatus;
  invitedViaServiceAreaId: string | null;
  user: { identityAssurance: IdentityAssurance; takeoverLock: { providerState: UserTakeoverProviderState; heldOwnerMembershipIds: string[] } | null };
} | null> {
  return transaction.hospitalMembership.findFirst({
    where: {
      hospitalId: childHospitalId,
      membershipType: MembershipType.OWNER,
      status: { in: OPEN_INVITATION_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, userId: true, status: true, invitedViaServiceAreaId: true,
      user: { select: { identityAssurance: true, takeoverLock: { select: { providerState: true, heldOwnerMembershipIds: true } } } },
    },
  });
}

async function hasActiveOwner(transaction: Prisma.TransactionClient, childHospitalId: string): Promise<boolean> {
  return await transaction.hospitalMembership.findFirst({
    where: { hospitalId: childHospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    select: { id: true },
  }) !== null;
}

/** The Parent may act on the OWNER invitation only while the Child is pending or ACTIVE without an ACTIVE OWNER (O-D5). */
async function assertOwnerInvitationManageable(transaction: Prisma.TransactionClient, area: ManagedChild): Promise<void> {
  if (area.child.status === HospitalStatus.PENDING_VERIFICATION) return;
  if (area.child.status === HospitalStatus.ACTIVE && !(await hasActiveOwner(transaction, area.child.id))) return;
  throw new ConflictError("The facility owner is managed by the facility itself");
}

async function endOpenOwnerInvitation(
  transaction: Prisma.TransactionClient,
  input: { membership: { id: string; status: MembershipStatus }; childHospitalId: string; parentHospitalId: string; actorUserId: string; now: Date; reason: string },
): Promise<void> {
  if (input.membership.status === MembershipStatus.PROVISIONED) {
    await revokeChildOwnerActivation(transaction, {
      membershipId: input.membership.id, actorUserId: input.actorUserId, now: input.now, source: input.reason,
    });
  }
  const ended = await transaction.hospitalMembership.updateMany({
    where: { id: input.membership.id, status: input.membership.status },
    data: { status: MembershipStatus.ENDED },
  });
  if (ended.count !== 1) throw new ConflictError("The owner invitation changed concurrently");
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "hospital.child_owner_invitation_ended",
    resourceType: "Hospital",
    resourceId: input.childHospitalId,
    metadata: { parentHospitalId: input.parentHospitalId, membershipId: input.membership.id, fromStatus: input.membership.status, reason: input.reason },
  }, transaction);
}

/**
 * N1-D5 replay for a Parent-registered Child: the same OWNER, Parent, name and invitee identity return the
 * Child already created; any other use of the nonce is a conflict. Returns null while the nonce is unused.
 */
async function findReplayedChild(
  database: Pick<Prisma.TransactionClient, "hospital">,
  input: { submissionNonce: string; parentHospitalId: string; name: string; nationalId: string },
  actorUserId: string,
): Promise<ChildFacilityCreateResult | null> {
  const existing = await database.hospital.findUnique({
    where: { registrationNonce: input.submissionNonce },
    select: {
      id: true, hospitalCode: true, name: true, registeredByUserId: true, registeredForParentHospitalId: true,
      memberships: {
        where: { membershipType: MembershipType.OWNER, invitedViaServiceAreaId: { not: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { user: { select: { person: { select: { identityKeyHash: true } } } } },
      },
    },
  });
  if (!existing) return null;

  const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: input.nationalId });
  if (
    existing.registeredByUserId !== actorUserId ||
    existing.registeredForParentHospitalId !== input.parentHospitalId ||
    existing.name !== input.name ||
    existing.memberships[0]?.user.person.identityKeyHash !== identityKeyHash
  ) {
    throw new ConflictError("This submission was already used for a different facility");
  }
  return { child: { id: existing.id, hospitalCode: existing.hospitalCode, name: existing.name }, invitation: { status: "ALREADY_ISSUED" } };
}

/**
 * ADR-0018 (O-D2): the active Parent OWNER registers a Child facility, attaches it to that Parent's network and invites
 * its first OWNER, in one serializable transaction. The role row is created before the area so the network role
 * trigger passes; Patient reads and reports stay closed until the Child is ACTIVE (O-D3).
 */
export async function createChildFacility(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildFacilityCreateResult> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childFacilityCreateSchema, input);
  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
    const outcome = await operation(database, async (tx) => {
      await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childCreate);
      const replayed = await findReplayedChild(tx, data, actor.userId);
      if (replayed) return { result: replayed, takeoverTask: null };

      const hospitalCode = await generateUniqueHospitalCode(tx);
      const child = await tx.hospital.create({
        data: {
          hospitalCode,
          name: data.name,
          status: HospitalStatus.PENDING_VERIFICATION,
          registrationNonce: data.submissionNonce,
          registeredByUserId: actor.userId,
          registeredForParentHospitalId: data.parentHospitalId,
          serviceAreaEligibility: {
            create: { kind: HospitalServiceAreaFacilityKind.CHILD, verifiedAt: now, classifiedByUserId: actor.userId },
          },
        },
        select: { id: true, hospitalCode: true, name: true },
      });
      const area = await tx.hospitalServiceArea.create({
        data: { parentHospitalId: data.parentHospitalId, childHospitalId: child.id, createdByUserId: actor.userId },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "hospital.child_created",
        resourceType: "Hospital",
        resourceId: child.id,
        metadata: { parentHospitalId: data.parentHospitalId, hospitalCode: child.hospitalCode, toStatus: HospitalStatus.PENDING_VERIFICATION, networkRole: "CHILD" },
      }, tx);
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "hospital_service_area.attached",
        resourceType: "HospitalServiceArea",
        resourceId: area.id,
        metadata: { parentHospitalId: data.parentHospitalId, childHospitalId: child.id, fromStatus: null, toStatus: "ACTIVE" },
      }, tx);

      const invited = await inviteChildOwnerInTransaction(tx, {
        actorUserId: actor.userId,
        parentHospitalId: data.parentHospitalId,
        childHospitalId: child.id,
        areaId: area.id,
        invitee: data,
        now,
        generateCredential: dependencies.generateCredential,
      });
      return { result: { child, invitation: invited.issue }, takeoverTask: invited.takeoverTask };
    });
    await revokeHeldInviteeSessions(database, outcome.takeoverTask, dependencies);
    return outcome.result;
  } catch (error: unknown) {
    // A concurrent submit of the same nonce may have won: answer with its Child when it matches.
    if (error instanceof ConflictError) {
      const replayed = await findReplayedChild(database, data, actor.userId).catch((replayError: unknown) => {
        if (replayError instanceof ConflictError) throw replayError;
        throw new InfrastructureError("Child facility registration could not be completed");
      });
      if (replayed) return replayed;
    }
    throw error;
  }
}

/** Issues a new REMOTE or ASSISTED link for the pending (PROVISIONED) OWNER invitation; the previous link is revoked. */
export async function issueChildOwnerLink(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildOwnerInvitationIssue> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childOwnerLinkIssueSchema, input);
  const now = getNow(dependencies);

  return operation(getDatabase(dependencies), async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    await assertOwnerInvitationManageable(tx, area);
    const membership = await findOpenOwnerInvitation(tx, area.child.id);
    if (!membership || membership.status !== MembershipStatus.PROVISIONED || membership.invitedViaServiceAreaId !== area.id) {
      throw new ConflictError("No owner invitation is waiting for an activation link");
    }
    if (
      membership.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
      (membership.user.takeoverLock !== null && membership.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED)
    ) {
      throw new ConflictError("This owner invitation is waiting for platform ADMIN identity verification");
    }
    // The latest issuer becomes the inviter whose Parent authority completion re-checks.
    await tx.hospitalMembership.updateMany({
      where: { id: membership.id, status: MembershipStatus.PROVISIONED },
      data: { invitedByUserId: actor.userId },
    });
    const issued = await issueChildOwnerActivation(tx, {
      userId: membership.userId,
      createdByUserId: actor.userId,
      childHospitalId: area.child.id,
      membershipId: membership.id,
      mode: data.mode,
      now,
      source: "explicit_regeneration",
      generateCredential: dependencies.generateCredential,
    });
    return { status: "ACTIVATION_LINK", ...issued };
  });
}

/** Revokes a pending OWNER link, or ends its unusable held invitation without changing the Child facility. */
export async function revokeChildOwnerLink(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<void> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childFacilityTargetSchema, input);
  const now = getNow(dependencies);

  await operation(getDatabase(dependencies), async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    await assertOwnerInvitationManageable(tx, area);
    const membership = await findOpenOwnerInvitation(tx, area.child.id);
    const heldForAdminReset = membership !== null &&
      membership.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION &&
      membership.user.takeoverLock !== null &&
      membership.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED &&
      membership.user.takeoverLock.heldOwnerMembershipIds.includes(membership.id);
    if (heldForAdminReset && membership) {
      await endOpenOwnerInvitation(tx, {
        membership,
        childHospitalId: area.child.id,
        parentHospitalId: data.parentHospitalId,
        actorUserId: actor.userId,
        now,
        reason: "parent_cancelled_held_invitation",
      });
      return;
    }
    if (!membership || membership.status !== MembershipStatus.PROVISIONED) throw new ConflictError("No activation link is open for this facility");
    await revokeChildOwnerActivation(tx, { membershipId: membership.id, actorUserId: actor.userId, now, source: "parent_revocation" });
  });
}

/**
 * Invites a (new) OWNER while the Child is pending or ACTIVE without an ACTIVE OWNER (O-D5): an open invitation is
 * ended first (its link revoked, its membership ENDED). Also the path after a decline or a cancelled link.
 */
export async function changeChildOwnerInvitee(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildOwnerInvitationIssue> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childOwnerInviteeSchema, input);
  const now = getNow(dependencies);

  const database = getDatabase(dependencies);
  const outcome = await operation(database, async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    await assertOwnerInvitationManageable(tx, area);
    const membership = await findOpenOwnerInvitation(tx, area.child.id);
    if (membership) {
      await endOpenOwnerInvitation(tx, {
        membership, childHospitalId: area.child.id, parentHospitalId: data.parentHospitalId, actorUserId: actor.userId, now, reason: "invitee_changed",
      });
    }
    return inviteChildOwnerInTransaction(tx, {
      actorUserId: actor.userId, parentHospitalId: data.parentHospitalId, childHospitalId: area.child.id, areaId: area.id,
      invitee: data, now, generateCredential: dependencies.generateCredential,
    });
  });
  await revokeHeldInviteeSessions(database, outcome.takeoverTask, dependencies);
  return outcome.issue;
}

/** O-D4: a replacement OWNER only for an ACTIVE Child with no ACTIVE OWNER and no open invitation. */
export async function inviteReplacementChildOwner(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildOwnerInvitationIssue> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childOwnerInviteeSchema, input);
  const now = getNow(dependencies);

  const database = getDatabase(dependencies);
  const outcome = await operation(database, async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    if (area.child.status !== HospitalStatus.ACTIVE || (await hasActiveOwner(tx, area.child.id))) {
      throw new ConflictError("A replacement owner can only be invited for an active facility without an owner");
    }
    if (await findOpenOwnerInvitation(tx, area.child.id)) throw new ConflictError("An owner invitation is already open for this facility");
    return inviteChildOwnerInTransaction(tx, {
      actorUserId: actor.userId, parentHospitalId: data.parentHospitalId, childHospitalId: area.child.id, areaId: area.id,
      invitee: data, now, generateCredential: dependencies.generateCredential,
    });
  });
  await revokeHeldInviteeSessions(database, outcome.takeoverTask, dependencies);
  return outcome.issue;
}

/**
 * Cancels a Child this Parent registered that never became ACTIVE, in one transaction: open invitations end, the
 * area ends with the reason, and the Hospital is RETIRED with its retirement history (actor = the Parent OWNER).
 */
export async function cancelPendingChildFacility(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<void> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childFacilityCancelSchema, input);

  await operation(getDatabase(dependencies), async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    if (area.child.status !== HospitalStatus.PENDING_VERIFICATION || area.child.registeredForParentHospitalId !== data.parentHospitalId) {
      throw new ConflictError("Only a facility this Parent registered that is not yet active can be cancelled");
    }
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!now) throw new InfrastructureError();

    const heldOwnerRows = await tx.hospitalMembership.findMany({
      where: { hospitalId: area.child.id, membershipType: MembershipType.OWNER, status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.ENDED] } },
      select: {
        id: true,
        user: { select: { identityAssurance: true, takeoverLock: { select: { providerState: true, heldOwnerMembershipIds: true } } } },
      },
    });
    if (heldOwnerRows.some(({ id, user }) =>
      user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION &&
      user.takeoverLock !== null && user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED &&
      user.takeoverLock.heldOwnerMembershipIds.includes(id)
    )) {
      throw new ConflictError("A held child owner invitation must be resolved before retiring this facility");
    }
    const open = await tx.hospitalMembership.findMany({
      where: { hospitalId: area.child.id, status: { not: MembershipStatus.ENDED } },
      select: { id: true, status: true },
    });
    for (const membership of open) {
      await endOpenOwnerInvitation(tx, {
        membership, childHospitalId: area.child.id, parentHospitalId: data.parentHospitalId, actorUserId: actor.userId, now, reason: "facility_cancelled",
      });
    }

    const ended = await tx.hospitalServiceArea.updateMany({
      where: { id: area.id, endedAt: null },
      data: { endedAt: now, endedByUserId: actor.userId, endReason: data.reason },
    });
    if (ended.count !== 1) throw new ConflictError("Service area changed concurrently");
    await recordAuditEvent({
      actorUserId: actor.userId,
      action: "hospital_service_area.ended",
      resourceType: "HospitalServiceArea",
      resourceId: area.id,
      metadata: { parentHospitalId: data.parentHospitalId, childHospitalId: area.child.id, fromStatus: "ACTIVE", toStatus: "ENDED", reasonStored: true },
    }, tx);

    const retired = await tx.hospital.updateMany({
      where: { id: area.child.id, status: HospitalStatus.PENDING_VERIFICATION },
      data: { status: HospitalStatus.RETIRED, retiredAt: now, retiredByUserId: actor.userId, retiredReason: data.reason },
    });
    if (retired.count !== 1) throw new ConflictError("The facility changed concurrently");
    await tx.hospitalRetirementEvent.create({
      data: { hospitalId: area.child.id, kind: HospitalRetirementEventKind.RETIRED, reason: data.reason, actorUserId: actor.userId, createdAt: now },
    });
    await recordAuditEvent({
      actorUserId: actor.userId,
      action: "hospital.retired",
      resourceType: "Hospital",
      resourceId: area.child.id,
      metadata: {
        hospitalCode: area.child.hospitalCode,
        fromStatus: HospitalStatus.PENDING_VERIFICATION,
        toStatus: HospitalStatus.RETIRED,
        reasonStored: true,
        source: "parent_cancellation",
        parentHospitalId: data.parentHospitalId,
      },
    }, tx);
  });
}

/** O-D5: only the Parent renames its attached Child (optimistic concurrency); the Child's own OWNER has no rename path. */
export async function renameChildFacility(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildFacility> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childFacilityRenameSchema, input);
  const expectedUpdatedAt = new Date(data.expectedUpdatedAt);

  return operation(getDatabase(dependencies), async (tx) => {
    await authorize(tx, actor, data.parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.childManage);
    const area = await findManagedChild(tx, data.parentHospitalId, data.childHospitalId);
    if (area.child.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new ConflictError("The facility changed before this operation");
    if (area.child.name === data.name) throw new ValidationError("The facility already has this name");
    const updated = await tx.hospital.updateMany({
      where: { id: area.child.id, updatedAt: area.child.updatedAt },
      data: { name: data.name },
    });
    if (updated.count !== 1) throw new ConflictError("The facility changed before this operation");
    await recordAuditEvent({
      actorUserId: actor.userId,
      action: "hospital.renamed",
      resourceType: "Hospital",
      resourceId: area.child.id,
      metadata: { fromName: area.child.name, toName: data.name, parentHospitalId: data.parentHospitalId, source: "parent_owner" },
    }, tx);
    return { id: area.child.id, hospitalCode: area.child.hospitalCode, name: data.name };
  });
}

export type ChildOwnerInvitationForActor = {
  membershipId: string;
  child: ChildFacility;
  parent: ChildFacility;
  invitedAt: Date;
};

/** Pending OWNER invitations addressed to the actor's own ACTIVE account (O-D6). */
export async function listChildOwnerInvitationsForActor(
  actor: ActorContext | null | undefined,
  dependencies: ChildFacilityDependencies = {},
): Promise<ChildOwnerInvitationForActor[]> {
  if (!actor) throw new ForbiddenError();
  const database = getDatabase(dependencies);
  const account = await database.user.findUnique({
    where: { id: actor.userId },
    select: { status: true, identityAssurance: true, takeoverLock: { select: { providerState: true } } },
  });
  if (
    !account || account.status !== UserStatus.ACTIVE || account.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
    (account.takeoverLock !== null && account.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED)
  ) return [];

  const rows = await database.hospitalMembership.findMany({
    where: {
      userId: actor.userId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.INVITED,
      invitedViaServiceArea: { is: { endedAt: null } },
      user: { is: { personId: actor.personId, status: UserStatus.ACTIVE } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
    select: {
      id: true,
      createdAt: true,
      hospital: { select: { id: true, hospitalCode: true, name: true } },
      invitedViaServiceArea: { select: { parent: { select: { id: true, hospitalCode: true, name: true } } } },
    },
  });
  return rows.flatMap((row) => row.invitedViaServiceArea
    ? [{ membershipId: row.id, child: row.hospital, parent: row.invitedViaServiceArea.parent, invitedAt: row.createdAt }]
    : []);
}

async function findOwnInvitation(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  membershipId: string,
): Promise<{ id: string; hospitalId: string }> {
  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      id: membershipId,
      userId: actor.userId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.INVITED,
      invitedViaServiceAreaId: { not: null },
      user: { is: { personId: actor.personId, status: UserStatus.ACTIVE } },
    },
    select: { id: true, hospitalId: true },
  });
  if (!membership) throw new NotFoundError();
  return membership;
}

/**
 * The invitee accepts in their own authenticated session: the OWNER membership and, for a first OWNER, the Child
 * become ACTIVE in one transaction, after re-checking the same invitation context as token completion.
 */
export async function acceptChildOwnerInvitation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<void> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childOwnerInvitationResponseSchema, input);

  await operation(getDatabase(dependencies), async (tx) => {
    const membership = await findOwnInvitation(tx, actor, data.membershipId);
    const [identityState, adminRole, inFlightRecovery, ambiguousReset] = await Promise.all([
      tx.user.findUnique({
        where: { id: actor.userId },
        select: { identityAssurance: true, takeoverLock: { select: { providerState: true } } },
      }),
      tx.userRole.findUnique({ where: { userId_role: { userId: actor.userId, role: Role.ADMIN } }, select: { userId: true } }),
      tx.accountRecovery.findFirst({ where: { targetUserId: actor.userId, ...unreconciledAccountRecoveryWhere }, select: { id: true } }),
      tx.workforceActivation.findFirst({ where: { userId: actor.userId, ...unreconciledWorkforceResetWhere }, select: { id: true } }),
    ]);
    if (
      !identityState || identityState.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION ||
      (identityState.takeoverLock !== null && identityState.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED)
    ) throw new ConflictError("This account requires identity verification before accepting");
    if (adminRole || inFlightRecovery || ambiguousReset) throw new ConflictError("This account requires reconciliation before accepting");
    const context = await assertChildOwnerInvitationContext(tx, {
      membershipId: membership.id, childHospitalId: membership.hospitalId, userId: actor.userId, expectedStatus: MembershipStatus.INVITED,
    });
    await tx.userRole.upsert({
      where: { userId_role: { userId: actor.userId, role: Role.HOSPITAL } },
      update: {},
      create: { userId: actor.userId, role: Role.HOSPITAL },
    });
    await activatePendingChildOwner(tx, {
      membershipId: membership.id, childHospitalId: membership.hospitalId, userId: actor.userId,
      fromStatus: MembershipStatus.INVITED, context, actorUserId: actor.userId,
    });
    await recordAuditEvent({
      actorUserId: actor.userId,
      action: "hospital.child_owner_invitation_accepted",
      resourceType: "HospitalMembership",
      resourceId: membership.id,
      metadata: { childHospitalId: membership.hospitalId, parentHospitalId: context.parentHospitalId },
    }, tx);
  });
}

/** The invitee declines: the membership ENDS with the decline recorded, and the Child stays pending for its Parent. */
export async function declineChildOwnerInvitation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<void> {
  if (!actor) throw new ForbiddenError();
  const data = parse(childOwnerInvitationResponseSchema, input);
  const now = getNow(dependencies);

  await operation(getDatabase(dependencies), async (tx) => {
    const membership = await findOwnInvitation(tx, actor, data.membershipId);
    const declined = await tx.hospitalMembership.updateMany({
      where: { id: membership.id, userId: actor.userId, status: MembershipStatus.INVITED },
      data: { status: MembershipStatus.ENDED, invitationDeclinedAt: now },
    });
    if (declined.count !== 1) throw new ConflictError("The invitation changed concurrently");
    await recordAuditEvent({
      actorUserId: actor.userId,
      action: "hospital.child_owner_invitation_declined",
      resourceType: "HospitalMembership",
      resourceId: membership.id,
      metadata: { childHospitalId: membership.hospitalId },
    }, tx);
  });
}

export type ManagedChildOwnerInvitation = {
  membershipId: string;
  inviteeName: string;
  delivery: "ACTIVATION_LINK" | "ACCOUNT_ACCEPTANCE" | "ADMIN_RESET_REQUIRED";
  link: { status: "OPEN" | "EXPIRED" | "IN_USE" | "NONE"; expiresAt: Date | null; mode: "REMOTE" | "ASSISTED" | null };
};

export type ManagedChildFacility = {
  areaId: string;
  attachedAt: Date;
  child: ChildFacility & { status: HospitalStatus; updatedAt: Date };
  registeredByThisParent: boolean;
  /** รอเปิดใช้งาน / ใช้งานอยู่ / ไม่มีผู้ดูแล (O1-D). */
  state: "PENDING_ACTIVATION" | "ACTIVE" | "NO_OWNER" | "INACTIVE";
  invitation: ManagedChildOwnerInvitation | null;
  lastDeclinedAt: Date | null;
};

/** Parent page projection of every Child currently attached to this Parent, with its OWNER invitation state. */
export async function listManagedChildFacilities(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: ChildFacilityDependencies = {},
): Promise<ManagedChildFacility[]> {
  if (!actor) throw new ForbiddenError();
  const { parentHospitalId } = parse(childFacilityTargetSchema.pick({ parentHospitalId: true }), input);
  const now = getNow(dependencies);

  return operation(getDatabase(dependencies), async (tx) => {
    await authorize(tx, actor, parentHospitalId, HOSPITAL_SERVICE_AREA_CAPABILITIES.read);
    const areas = await tx.hospitalServiceArea.findMany({
      where: { parentHospitalId, endedAt: null },
      orderBy: { id: "asc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        child: {
          select: {
            id: true, hospitalCode: true, name: true, status: true, updatedAt: true, registeredForParentHospitalId: true,
            memberships: {
              where: { membershipType: MembershipType.OWNER, OR: [{ status: { in: [MembershipStatus.ACTIVE, ...OPEN_INVITATION_STATUSES] } }, { invitationDeclinedAt: { not: null } }] },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                id: true, status: true, invitationDeclinedAt: true,
                user: {
                  select: {
                    identityAssurance: true,
                    takeoverLock: { select: { providerState: true, heldOwnerMembershipIds: true } },
                    person: { select: { givenName: true, familyName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const openIds = areas.flatMap(({ child }) => child.memberships.filter(({ status }) => status === MembershipStatus.PROVISIONED).map(({ id }) => id));
    const activations = openIds.length === 0 ? [] : await tx.workforceActivation.findMany({
      where: { relationshipId: { in: openIds }, purpose: WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING, usedAt: null, revokedAt: null },
      select: { relationshipId: true, expiresAt: true, mode: true, claimedAt: true },
    });
    const activationByMembership = new Map(activations.map((activation) => [activation.relationshipId, activation]));

    return areas.map(({ id, createdAt, child }): ManagedChildFacility => {
      const open = child.memberships.find(({ status }) => status === MembershipStatus.PROVISIONED || status === MembershipStatus.INVITED);
      const activeOwner = child.memberships.some(({ status }) => status === MembershipStatus.ACTIVE);
      const declined = child.memberships.find(({ invitationDeclinedAt }) => invitationDeclinedAt !== null);
      const activation = open ? activationByMembership.get(open.id) : undefined;
      const heldForAdminReset = open !== undefined &&
        open.user.identityAssurance === IdentityAssurance.CAREGIVER_INVITATION &&
        open.user.takeoverLock !== null &&
        open.user.takeoverLock.providerState !== UserTakeoverProviderState.RESOLVED &&
        open.user.takeoverLock.heldOwnerMembershipIds.includes(open.id);
      const state = child.status === HospitalStatus.PENDING_VERIFICATION
        ? "PENDING_ACTIVATION"
        : child.status !== HospitalStatus.ACTIVE ? "INACTIVE" : activeOwner ? "ACTIVE" : "NO_OWNER";
      return {
        areaId: id,
        attachedAt: createdAt,
        child: { id: child.id, hospitalCode: child.hospitalCode, name: child.name, status: child.status, updatedAt: child.updatedAt },
        registeredByThisParent: child.registeredForParentHospitalId === parentHospitalId,
        state,
        invitation: open ? {
          membershipId: open.id,
          inviteeName: [open.user.person.givenName, open.user.person.familyName].filter(Boolean).join(" "),
          delivery: heldForAdminReset
            ? "ADMIN_RESET_REQUIRED"
            : open.status === MembershipStatus.INVITED ? "ACCOUNT_ACCEPTANCE" : "ACTIVATION_LINK",
          link: !activation
            ? { status: "NONE", expiresAt: null, mode: null }
            : {
                status: activation.claimedAt ? "IN_USE" : activation.expiresAt <= now ? "EXPIRED" : "OPEN",
                expiresAt: activation.expiresAt,
                mode: activation.mode,
              },
        } : null,
        lastDeclinedAt: declined?.invitationDeclinedAt ?? null,
      };
    }).sort((left, right) => left.child.name.localeCompare(right.child.name, "th"));
  });
}
