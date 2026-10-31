import "server-only";

import {
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  WorkforceActivationPurpose,
  type Prisma,
} from "@prisma/client";

import {
  lockCaregiverInvitationIdentityInTransaction,
  type CaregiverInvitationTakeoverTask,
} from "@/modules/account-security/services/caregiver-invitation-takeover-lock";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assertWorkforceRelationshipsCompatible } from "@/modules/identity/services/workforce-relationship-compatibility";
import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";

import type { WorkforceActivationMode } from "../schemas/workforce-schemas";
import type { ActivationCredentialGenerator } from "./activation-token-service";
import { issueHospitalOwnerActivation, resolveWorkforceGrantee } from "./workforce-service";

/**
 * What the inviter sees right after an OWNER invitation. The plaintext token exists only in ACTIVATION_LINK and is
 * never stored, so a replayed submission answers ALREADY_ISSUED and the inviter regenerates the link when needed.
 */
export type HospitalOwnerInvitationIssue =
  | { status: "ACTIVATION_LINK"; activationToken: string; activationExpiresAt: Date; activationMode: WorkforceActivationMode }
  | { status: "AWAITING_ACCEPTANCE" }
  | { status: "ADMIN_RESET_REQUIRED" }
  | { status: "ALREADY_ISSUED" };

export type HospitalOwnerInvitee = { nationalId: string; givenName: string; familyName: string; mode: WorkforceActivationMode };

/** Child: invited by its Parent OWNER through the active area (ADR-0018). Parent: invited by platform ADMIN (ADR-0024). */
export type HospitalOwnerInvitationBinding =
  | { kind: "CHILD"; serviceAreaId: string }
  | { kind: "PARENT"; invitationNonce: string };

export type HospitalOwnerInvitationWrite = {
  membershipId: string;
  delivery: "ADMIN_RESET_REQUIRED" | "ACCOUNT_ACCEPTANCE" | WorkforceActivationMode;
  issue: HospitalOwnerInvitationIssue;
  takeoverTask: CaregiverInvitationTakeoverTask | null;
};

/**
 * The invitee write shared by Child and Parent OWNER invitations (O-D4/O-D6, ADR-0024). A new or reusable PROVISIONED
 * account gets a PROVISIONED OWNER membership and a workforce activation credential; an ACTIVE account gets an INVITED
 * membership and no credential, so nothing is granted until that person accepts in their own session (ADR-0012); a
 * caregiver-claimed account is held PROVISIONED behind the REC-1 takeover lock (FIX-1b). The caller authorizes the
 * inviter, checks the Hospital and records its own invitation audit.
 */
export async function writeHospitalOwnerInvitationInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    hospitalId: string;
    binding: HospitalOwnerInvitationBinding;
    invitee: HospitalOwnerInvitee;
    now: Date;
    generateCredential?: ActivationCredentialGenerator;
  },
): Promise<HospitalOwnerInvitationWrite> {
  const { user } = await resolveWorkforceGrantee(transaction, { hospitalId: input.hospitalId, ...input.invitee });
  await assertWorkforceRelationshipsCompatible(transaction, user.id, "HOSPITAL");
  const open = await transaction.hospitalMembership.findFirst({
    where: { userId: user.id, hospitalId: input.hospitalId, status: { not: MembershipStatus.ENDED } },
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
      hospitalId: input.hospitalId,
      membershipType: MembershipType.OWNER,
      status: accepting ? MembershipStatus.INVITED : MembershipStatus.PROVISIONED,
      invitedByUserId: input.actorUserId,
      ...(input.binding.kind === "CHILD"
        ? { invitedViaServiceAreaId: input.binding.serviceAreaId }
        : { invitationNonce: input.binding.invitationNonce }),
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

  const issue: HospitalOwnerInvitationIssue = caregiverClaimed
    ? { status: "ADMIN_RESET_REQUIRED" }
    : accepting
      ? { status: "AWAITING_ACCEPTANCE" }
      : {
        status: "ACTIVATION_LINK",
        ...(await issueHospitalOwnerActivation(transaction, {
          purpose: input.binding.kind === "CHILD"
            ? WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING
            : WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING,
          userId: user.id,
          createdByUserId: input.actorUserId,
          hospitalId: input.hospitalId,
          membershipId: membership.id,
          mode: input.invitee.mode,
          now: input.now,
          source: input.binding.kind === "CHILD" ? "child_owner_invitation" : "parent_owner_invitation",
          generateCredential: input.generateCredential,
        })),
      };

  let takeoverTask: CaregiverInvitationTakeoverTask | null = null;
  if (caregiverClaimed) {
    takeoverTask = await lockCaregiverInvitationIdentityInTransaction(transaction, {
      userId: user.id,
      actorUserId: input.actorUserId,
      hospitalId: input.hospitalId,
      now: input.now,
      heldOwnerMembershipId: membership.id,
    });
    if (!takeoverTask) throw new InfrastructureError("The caregiver account could not be quarantined");
  }

  return {
    membershipId: membership.id,
    delivery: caregiverClaimed ? "ADMIN_RESET_REQUIRED" : accepting ? "ACCOUNT_ACCEPTANCE" : input.invitee.mode,
    issue,
    takeoverTask,
  };
}

/** Inviter-side projection of an open OWNER invitation (Parent page for a Child, ADMIN page for a Parent). */
export type HospitalOwnerInvitationView = {
  membershipId: string;
  inviteeName: string;
  delivery: "ACTIVATION_LINK" | "ACCOUNT_ACCEPTANCE" | "ADMIN_RESET_REQUIRED";
  link: { status: "OPEN" | "EXPIRED" | "IN_USE" | "NONE"; expiresAt: Date | null; mode: WorkforceActivationMode | null };
};
