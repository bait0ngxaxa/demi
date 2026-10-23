import "server-only";

import { randomUUID } from "node:crypto";
import {
  CaregiverInvitationStatus,
  CaregiverRelationshipStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import {
  createUnpersistedPasswordAuthIdentity,
  deleteUnpersistedPasswordAuthIdentity,
  type UnpersistedPasswordAuthIdentity,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import {
  hashIdentityReference,
  identityKeyHashesMatch,
} from "@/modules/identity/services/identity-service";
import {
  ConflictError,
  InfrastructureError,
} from "@/shared/errors/application-error";
import {
  createPublicSelfRegistrationRateLimiter,
  type PublicSelfRegistrationRateLimiter,
} from "@/modules/self-registration/services/public-self-registration-rate-limit";

import { caregiverAccountClaimInputSchema } from "../schemas/caregiver-relationship-schemas";
import { FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION } from "./caregiver-relationship-service";
import { hashCaregiverInvitationToken } from "./caregiver-invitation-token-service";
import {
  activatableInvitationSelect,
  activateCaregiverRelationship,
  resolveCaregiverSharingGates,
  type CaregiverSharingGates,
} from "./caregiver-scope-activation";

export class CaregiverAccountClaimRejectedError extends Error {
  constructor() {
    super("Caregiver account claim was rejected");
    this.name = "CaregiverAccountClaimRejectedError";
  }
}

export class CaregiverAccountClaimRateLimitedError extends Error {
  constructor() {
    super("ลองใหม่ภายหลัง");
    this.name = "CaregiverAccountClaimRateLimitedError";
  }
}

export type CaregiverAccountClaimDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  rateLimiter?: PublicSelfRegistrationRateLimiter;
  createProviderIdentity?: (input: { userId: string; password: string }) => Promise<UnpersistedPasswordAuthIdentity>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  createUserId?: () => string;
  gates?: CaregiverSharingGates;
};

export type AcceptedCaregiverAccountClaim = {
  userId: string;
  relationshipId: string;
  acceptedAt: Date;
};

type InvitationClaimRow = {
  id: string;
  patientProfileId: string;
  status: CaregiverInvitationStatus;
  expiresAt: Date;
  caregiverUserId: string | null;
  caregiverPersonId: string | null;
  recipientIdentityKeyHash: string | null;
};

type ExpiredInvitationRow = { id: string };
type AcceptedInvitationRow = { id: string; acceptedAt: Date };

function databaseFor(dependencies: CaregiverAccountClaimDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function nowFor(dependencies: CaregiverAccountClaimDependencies): Date {
  const now = dependencies.now?.() ?? new Date();
  if (Number.isNaN(now.getTime())) throw new InfrastructureError("Caregiver account claim clock is invalid");
  return now;
}

async function recordRejectedClaim(database: PrismaClient, invitationId?: string): Promise<void> {
  await recordAuditEvent({
    actorUserId: null,
    action: "caregiver_invitation.account_claim_rejected",
    resourceType: "caregiver_invitation",
    ...(invitationId ? { resourceId: invitationId } : {}),
    metadata: { result: "REJECTED" },
  }, database);
}

async function consumeClaimLimits(
  input: unknown,
  ipAddress: string,
  now: Date,
  dependencies: CaregiverAccountClaimDependencies,
): Promise<void> {
  if (!ipAddress || ipAddress.length > 64) {
    throw new InfrastructureError("Caregiver account claim client address is unavailable");
  }

  const limiter = dependencies.rateLimiter ?? createPublicSelfRegistrationRateLimiter();
  if (!await limiter.consume("IP", ipAddress, now)) throw new CaregiverAccountClaimRateLimitedError();

  const candidateToken = input && typeof input === "object" && "token" in input
    ? caregiverAccountClaimInputSchema.shape.token.safeParse(input.token)
    : null;
  if (candidateToken?.success) {
    const invitationPrincipal = hashCaregiverInvitationToken(candidateToken.data);
    if (!await limiter.consume("INVITATION", invitationPrincipal, now)) {
      throw new CaregiverAccountClaimRateLimitedError();
    }
  }
}

async function markHashInvitationExpired(database: PrismaClient, invitationId: string): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    const expired = await transaction.$queryRaw<ExpiredInvitationRow[]>(Prisma.sql`
      UPDATE "CaregiverInvitation"
      SET "status" = 'EXPIRED',
          "recipientIdentityKeyHash" = NULL,
          "expiredAt" = clock_timestamp(),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${invitationId}::uuid
        AND "caregiverUserId" IS NULL
        AND "caregiverPersonId" IS NULL
        AND "recipientIdentityKeyHash" IS NOT NULL
        AND "status" = 'PENDING'
        AND "expiresAt" <= clock_timestamp()
      RETURNING "id"
    `);
    if (expired.length === 1) {
      await recordAuditEvent({
        actorUserId: null,
        action: "caregiver_invitation.expired",
        resourceType: "caregiver_invitation",
        resourceId: invitationId,
        metadata: { status: CaregiverInvitationStatus.EXPIRED },
      }, transaction);
    }
  });
}

async function findCommittedClaim(
  database: PrismaClient,
  input: { userId: string; authSubject: string; personHash: string; invitationId: string },
): Promise<AcceptedCaregiverAccountClaim | null> {
  const user = await database.user.findFirst({
    where: {
      id: input.userId,
      authSubject: input.authSubject,
      status: { in: [UserStatus.ACTIVE, UserStatus.SUSPENDED] },
      identityAssurance: "CAREGIVER_INVITATION",
      person: { identityKeyHash: input.personHash },
      roles: { some: { role: Role.CAREGIVER } },
    },
    select: {
      id: true,
      caregiverRelationships: {
        where: { sourceInvitationId: input.invitationId, status: CaregiverRelationshipStatus.ACTIVE },
        select: { id: true, activatedAt: true },
        take: 1,
      },
    },
  });
  const relationship = user?.caregiverRelationships[0];
  return user && relationship
    ? { userId: user.id, relationshipId: relationship.id, acceptedAt: relationship.activatedAt }
    : null;
}

export async function createCaregiverAccountFromInvitation(
  input: unknown,
  context: { ipAddress: string },
  dependencies: CaregiverAccountClaimDependencies = {},
): Promise<AcceptedCaregiverAccountClaim> {
  const database = databaseFor(dependencies);
  const now = nowFor(dependencies);
  await consumeClaimLimits(input, context.ipAddress, now, dependencies);
  const parsed = caregiverAccountClaimInputSchema.safeParse(input);
  if (!parsed.success) {
    await recordRejectedClaim(database);
    throw new CaregiverAccountClaimRejectedError();
  }

  const invitationTokenHash = hashCaregiverInvitationToken(parsed.data.token);
  const personHash = hashIdentityReference({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: parsed.data.nationalId,
  });

  let invitation: InvitationClaimRow | null;
  try {
    invitation = await database.caregiverInvitation.findUnique({
      where: { tokenHash: invitationTokenHash },
      select: {
        id: true,
        patientProfileId: true,
        status: true,
        expiresAt: true,
        caregiverUserId: true,
        caregiverPersonId: true,
        recipientIdentityKeyHash: true,
      },
    });
  } catch {
    throw new InfrastructureError("Caregiver invitation could not be loaded");
  }

  if (!invitation) {
    await recordRejectedClaim(database);
    throw new CaregiverAccountClaimRejectedError();
  }

  const isUnregisteredRecipient = invitation.status === CaregiverInvitationStatus.PENDING &&
    invitation.caregiverUserId === null && invitation.caregiverPersonId === null &&
    invitation.recipientIdentityKeyHash !== null;
  if (isUnregisteredRecipient && invitation.expiresAt.getTime() <= now.getTime()) {
    await markHashInvitationExpired(database, invitation.id);
    throw new CaregiverAccountClaimRejectedError();
  }

  if (!isUnregisteredRecipient || invitation.recipientIdentityKeyHash === null ||
    !identityKeyHashesMatch(invitation.recipientIdentityKeyHash, personHash)) {
    await recordRejectedClaim(database, invitation.id);
    throw new CaregiverAccountClaimRejectedError();
  }

  let existingPerson: { id: string } | null;
  try {
    existingPerson = await database.person.findUnique({
      where: { identityKeyHash: personHash },
      select: { id: true },
    });
  } catch {
    throw new InfrastructureError("Caregiver identity could not be checked");
  }
  if (existingPerson) {
    await recordRejectedClaim(database, invitation.id);
    throw new CaregiverAccountClaimRejectedError();
  }

  const userId = (dependencies.createUserId ?? randomUUID)();
  const createProviderIdentity = dependencies.createProviderIdentity ?? createUnpersistedPasswordAuthIdentity;
  const deleteProviderIdentity = dependencies.deleteProviderIdentity ?? deleteUnpersistedPasswordAuthIdentity;
  const providerIdentity = await createProviderIdentity({ userId, password: parsed.data.password });
  let providerCompensated = false;
  let rejectionAudited = false;
  const gates = resolveCaregiverSharingGates(dependencies.gates);

  try {
    const outcome = await runSerializableTransaction(database, async (transaction) => {
      const currentInvitation = await transaction.caregiverInvitation.findUnique({
        where: { id: invitation.id },
        select: {
          ...activatableInvitationSelect,
          status: true,
          caregiverUserId: true,
          caregiverPersonId: true,
          recipientIdentityKeyHash: true,
        },
      });
      if (!currentInvitation || currentInvitation.status !== CaregiverInvitationStatus.PENDING ||
        currentInvitation.caregiverUserId !== null || currentInvitation.caregiverPersonId !== null ||
        currentInvitation.recipientIdentityKeyHash === null ||
        !identityKeyHashesMatch(currentInvitation.recipientIdentityKeyHash, personHash)) {
        throw new CaregiverAccountClaimRejectedError();
      }

      const expired = await transaction.$queryRaw<ExpiredInvitationRow[]>(Prisma.sql`
        UPDATE "CaregiverInvitation"
        SET "status" = 'EXPIRED',
            "recipientIdentityKeyHash" = NULL,
            "expiredAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${currentInvitation.id}::uuid
          AND "status" = 'PENDING'
          AND "recipientIdentityKeyHash" = ${currentInvitation.recipientIdentityKeyHash}
          AND "expiresAt" <= clock_timestamp()
        RETURNING "id"
      `);
      if (expired.length === 1) {
        await recordAuditEvent({
          actorUserId: null,
          action: "caregiver_invitation.expired",
          resourceType: "caregiver_invitation",
          resourceId: currentInvitation.id,
          metadata: { status: CaregiverInvitationStatus.EXPIRED },
        }, transaction);
        return { kind: "EXPIRED" as const };
      }

      const existing = await transaction.person.findUnique({
        where: { identityKeyHash: personHash },
        select: { id: true },
      });
      if (existing) throw new CaregiverAccountClaimRejectedError();

      const person = await transaction.person.create({
        data: {
          identityKeyHash: personHash,
          givenName: parsed.data.givenName,
          familyName: parsed.data.familyName,
          nameIsSelfAsserted: true,
        },
        select: { id: true },
      });
      await transaction.user.create({
        data: {
          id: userId,
          personId: person.id,
          authSubject: providerIdentity.authSubject,
          providerLoginAlias: providerIdentity.providerLoginAlias,
          status: UserStatus.ACTIVE,
          identityAssurance: "CAREGIVER_INVITATION",
          roles: { create: { role: Role.CAREGIVER } },
        },
      });

      const acceptedRows = await transaction.$queryRaw<AcceptedInvitationRow[]>(Prisma.sql`
        UPDATE "CaregiverInvitation"
        SET "caregiverUserId" = ${userId}::uuid,
            "caregiverPersonId" = ${person.id}::uuid,
            "recipientIdentityKeyHash" = NULL,
            "status" = 'ACCEPTED',
            "acceptedAt" = clock_timestamp(),
            "acceptanceContractVersion" = ${FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${currentInvitation.id}::uuid
          AND "tokenHash" = ${invitationTokenHash}
          AND "status" = 'PENDING'
          AND "caregiverUserId" IS NULL
          AND "caregiverPersonId" IS NULL
          AND "recipientIdentityKeyHash" = ${personHash}
          AND "expiresAt" > clock_timestamp()
        RETURNING "id", "acceptedAt"
      `);
      const acceptedAt = acceptedRows[0]?.acceptedAt;
      if (!acceptedAt) throw new CaregiverAccountClaimRejectedError();

      // AF-5: a scope that is no longer available rolls the whole claim back (provider identity compensated below).
      const relationship = await activateCaregiverRelationship(transaction, {
        invitation: currentInvitation,
        caregiver: { userId, personId: person.id },
        acceptedAt,
        gates,
      }).catch((error: unknown) => {
        if (error instanceof ConflictError) throw new CaregiverAccountClaimRejectedError();
        throw error;
      });

      await recordAuditEvent({
        actorUserId: userId,
        action: "caregiver_account.created",
        resourceType: "User",
        resourceId: userId,
        metadata: { role: Role.CAREGIVER, status: UserStatus.ACTIVE },
      }, transaction);
      await recordAuditEvent({
        actorUserId: userId,
        action: "caregiver_invitation.accepted",
        resourceType: "caregiver_invitation",
        resourceId: currentInvitation.id,
        metadata: {
          status: CaregiverInvitationStatus.ACCEPTED,
          acceptanceContractVersion: FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION,
        },
      }, transaction);
      await recordAuditEvent({
        actorUserId: userId,
        action: "caregiver_relationship.activated",
        resourceType: "caregiver_relationship",
        resourceId: relationship.relationshipId,
        metadata: { status: CaregiverRelationshipStatus.ACTIVE },
      }, transaction);

      return {
        kind: "ACCEPTED" as const,
        userId,
        relationshipId: relationship.relationshipId,
        acceptedAt,
      };
    });

    if (outcome.kind === "EXPIRED") {
      await deleteProviderIdentity(providerIdentity.authSubject);
      providerCompensated = true;
      await recordRejectedClaim(database, invitation.id);
      rejectionAudited = true;
      throw new CaregiverAccountClaimRejectedError();
    }
    return { userId: outcome.userId, relationshipId: outcome.relationshipId, acceptedAt: outcome.acceptedAt };
  } catch (error: unknown) {
    if (!providerCompensated) {
      let committedClaim: AcceptedCaregiverAccountClaim | null;
      try {
        committedClaim = await findCommittedClaim(database, {
          userId,
          authSubject: providerIdentity.authSubject,
          personHash,
          invitationId: invitation.id,
        });
      } catch {
        throw new InfrastructureError("Caregiver account claim outcome requires reconciliation");
      }
      if (committedClaim) return committedClaim;
    }

    if (!providerCompensated) {
      try {
        await deleteProviderIdentity(providerIdentity.authSubject);
        providerCompensated = true;
      } catch {
        throw new InfrastructureError("Caregiver account claim requires provider reconciliation");
      }
    }

    if (error instanceof CaregiverAccountClaimRejectedError) {
      if (!rejectionAudited) await recordRejectedClaim(database, invitation.id);
      throw error;
    }
    throw new InfrastructureError("Caregiver account could not be created");
  }
}
