import "server-only";

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
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
  ApplicationError,
} from "@/shared/errors/application-error";

import { assertFamilyAuthenticatedActor, assertFamilyPatientSelf } from "../policies/caregiver-relationship-policy";
import {
  caregiverInvitationIdSchema,
  caregiverRelationshipIdSchema,
  createCaregiverInvitationInputSchema,
  caregiverInvitationTokenSchema,
} from "../schemas/caregiver-relationship-schemas";
import {
  generateCaregiverInvitationCredential,
  hashCaregiverInvitationToken,
  type CaregiverInvitationCredential,
} from "./caregiver-invitation-token-service";

export const CAREGIVER_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
export const FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION = "family-delegation-v1";

export type CaregiverRelationshipServiceDependencies = {
  database?: PrismaClient;
  now?: () => Date;
  generateCredential?: () => CaregiverInvitationCredential;
};

export type CreatedCaregiverInvitation = {
  invitationId: string;
  plaintextToken: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type AcceptedCaregiverInvitation = {
  invitationId: string;
  relationshipId: string;
  acceptedAt: Date;
  acceptanceContractVersion: typeof FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION;
};

type CurrentUserRecord = {
  id: string;
  personId: string;
  roles: { role: Role }[];
};

type ExpiringInvitationRow = { id: string };
type CaregiverInvitationIssueTimeRow = { issuedAt: Date; expiresAt: Date };
type AcceptedInvitationRow = { id: string; acceptedAt: Date };

function getDatabase(dependencies: CaregiverRelationshipServiceDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: CaregiverRelationshipServiceDependencies): Date {
  const now = dependencies.now?.() ?? new Date();

  if (Number.isNaN(now.getTime())) {
    throw new InfrastructureError("Server time could not be resolved");
  }

  return now;
}

function rethrowServiceError(error: unknown, message: string): never {
  if (error instanceof ApplicationError) {
    throw error;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new ConflictError("The caregiver relationship changed concurrently");
  }

  throw new InfrastructureError(message);
}

async function assertActiveUser(
  database: Prisma.TransactionClient | PrismaClient,
  actor: ActorContext,
): Promise<CurrentUserRecord> {
  const user = await database.user.findFirst({
    where: {
      id: actor.userId,
      personId: actor.personId,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      personId: true,
      roles: { select: { role: true } },
    },
  });

  if (!user) {
    throw new ForbiddenError();
  }

  return user;
}

async function assertPatientSelf(
  database: Prisma.TransactionClient,
  actor: ActorContext,
): Promise<{ patientProfileId: string; patientPersonId: string }> {
  assertFamilyPatientSelf(actor);
  const user = await assertActiveUser(database, actor);

  if (!user.roles.some(({ role }) => role === Role.PATIENT)) {
    throw new ForbiddenError();
  }

  const patientProfile = await database.patientProfile.findUnique({
    where: { personId: user.personId },
    select: { id: true, personId: true },
  });

  if (!patientProfile || patientProfile.personId !== actor.personId) {
    throw new ForbiddenError();
  }

  return { patientProfileId: patientProfile.id, patientPersonId: patientProfile.personId };
}

async function expirePairInvitations(
  database: Prisma.TransactionClient,
  actorUserId: string,
  patientProfileId: string,
  caregiverUserId: string,
): Promise<void> {
  const expiredInvitations = await database.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
    UPDATE "CaregiverInvitation"
    SET "status" = 'EXPIRED',
        "expiredAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "patientProfileId" = ${patientProfileId}::uuid
      AND "caregiverUserId" = ${caregiverUserId}::uuid
      AND "status" = 'PENDING'
      AND "expiresAt" <= clock_timestamp()
    RETURNING "id"
  `);

  for (const invitation of expiredInvitations) {
    await recordAuditEvent(
      {
        actorUserId,
        action: "caregiver_invitation.expired",
        resourceType: "caregiver_invitation",
        resourceId: invitation.id,
        metadata: { status: CaregiverInvitationStatus.EXPIRED },
      },
      database,
    );
  }
}

async function expireInvitationIfDue(
  database: Prisma.TransactionClient,
  actorUserId: string,
  invitationId: string,
): Promise<boolean> {
  const expiredInvitations = await database.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
    UPDATE "CaregiverInvitation"
    SET "status" = 'EXPIRED',
        "expiredAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${invitationId}::uuid
      AND "status" = 'PENDING'
      AND "expiresAt" <= clock_timestamp()
    RETURNING "id"
  `);

  if (expiredInvitations.length === 0) {
    return false;
  }

  await recordAuditEvent(
    {
      actorUserId,
      action: "caregiver_invitation.expired",
      resourceType: "caregiver_invitation",
      resourceId: invitationId,
      metadata: { status: CaregiverInvitationStatus.EXPIRED },
    },
    database,
  );

  return true;
}

export async function createCaregiverInvitation(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<CreatedCaregiverInvitation> {
  assertFamilyPatientSelf(actor);
  const parsedInput = createCaregiverInvitationInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new ValidationError("A valid Thai National ID is required");
  }

  const recipientIdentityHash = hashIdentityReference({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: parsedInput.data.nationalId,
  });
  const credential = (dependencies.generateCredential ?? generateCaregiverInvitationCredential)();

  try {
    const result = await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const patient = await assertPatientSelf(transaction, actor);
      const recipientPerson = await transaction.person.findUnique({
        where: { identityKeyHash: recipientIdentityHash },
        select: {
          id: true,
          user: {
            select: { id: true, personId: true, status: true, authSubject: true },
          },
        },
      });
      const caregiver = recipientPerson?.user;

      if (
        !recipientPerson ||
        !caregiver ||
        caregiver.status !== UserStatus.ACTIVE ||
        !caregiver.authSubject ||
        caregiver.personId !== recipientPerson.id ||
        caregiver.id === actor.userId ||
        recipientPerson.id === patient.patientPersonId
      ) {
        throw new ConflictError("A caregiver invitation cannot be created for this information");
      }

      await expirePairInvitations(
        transaction,
        actor.userId,
        patient.patientProfileId,
        caregiver.id,
      );

      const activeRelationship = await transaction.caregiverRelationship.findFirst({
        where: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.id,
          status: CaregiverRelationshipStatus.ACTIVE,
        },
        select: { id: true },
      });
      const pendingInvitation = await transaction.caregiverInvitation.findFirst({
        where: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.id,
          status: CaregiverInvitationStatus.PENDING,
        },
        select: { id: true },
      });

      if (activeRelationship || pendingInvitation) {
        throw new ConflictError("A caregiver invitation cannot be created for this information");
      }

      const [issueTime] = await transaction.$queryRaw<CaregiverInvitationIssueTimeRow[]>(Prisma.sql`
        SELECT issue_time AS "issuedAt",
               issue_time + INTERVAL '24 hours' AS "expiresAt"
        FROM (SELECT clock_timestamp()::timestamptz(3) AS issue_time) AS issued
      `);
      if (!issueTime) {
        throw new InfrastructureError("Caregiver invitation issue time could not be resolved");
      }

      const invitation = await transaction.caregiverInvitation.create({
        data: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.id,
          caregiverPersonId: recipientPerson.id,
          issuedByUserId: actor.userId,
          tokenHash: credential.tokenHash,
          status: CaregiverInvitationStatus.PENDING,
          issuedAt: issueTime.issuedAt,
          expiresAt: issueTime.expiresAt,
        },
        select: { id: true, issuedAt: true, expiresAt: true },
      });

      await recordAuditEvent(
        {
          actorUserId: actor.userId,
          action: "caregiver_invitation.created",
          resourceType: "caregiver_invitation",
          resourceId: invitation.id,
          metadata: {
            status: CaregiverInvitationStatus.PENDING,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
        transaction,
      );

      return invitation;
    });

    return {
      invitationId: result.id,
      issuedAt: result.issuedAt,
      expiresAt: result.expiresAt,
      plaintextToken: credential.plaintextToken,
    };
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be created");
  }
}

export type CaregiverInvitationPreview = {
  status: CaregiverInvitationStatus;
  expiresAt: Date;
  patientDisplayName: string;
  acceptanceContractVersion: typeof FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION;
};

function formatPersonDisplayName(person: { givenName: string | null; familyName: string | null }): string {
  const displayName = [person.givenName, person.familyName]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(" ");

  return displayName || "ผู้ป่วย";
}

export async function previewCaregiverInvitation(
  actor: ActorContext | null | undefined,
  plaintextToken: unknown,
  dependencies: Pick<CaregiverRelationshipServiceDependencies, "database" | "now"> = {},
): Promise<CaregiverInvitationPreview> {
  assertFamilyAuthenticatedActor(actor);
  const parsedToken = caregiverInvitationTokenSchema.safeParse(plaintextToken);

  if (!parsedToken.success) {
    throw new NotFoundError();
  }

  const database = dependencies.database ?? getPrisma();

  try {
    const user = await assertActiveUser(database, actor);
    const invitation = await database.caregiverInvitation.findUnique({
      where: { tokenHash: hashCaregiverInvitationToken(parsedToken.data) },
      select: {
        caregiverUserId: true,
        caregiverPersonId: true,
        status: true,
        expiresAt: true,
        patientProfile: {
          select: {
            person: { select: { givenName: true, familyName: true } },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundError();
    }

    if (
      invitation.caregiverUserId !== user.id ||
      invitation.caregiverPersonId !== user.personId
    ) {
      throw new ForbiddenError();
    }

    const status =
      invitation.status === CaregiverInvitationStatus.PENDING &&
      invitation.expiresAt.getTime() <= getNow(dependencies).getTime()
        ? CaregiverInvitationStatus.EXPIRED
        : invitation.status;

    return {
      status,
      expiresAt: invitation.expiresAt,
      patientDisplayName: formatPersonDisplayName(invitation.patientProfile.person),
      acceptanceContractVersion: FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION,
    };
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be previewed");
  }
}

type PendingInvitationTransition = "REJECTED" | "REVOKED";
type PendingInvitationLocator = { invitationId: string } | { tokenHash: string };

async function transitionPendingInvitation(
  actor: ActorContext,
  locator: PendingInvitationLocator,
  transition: PendingInvitationTransition,
  dependencies: CaregiverRelationshipServiceDependencies,
): Promise<"COMPLETED" | "EXPIRED"> {
  assertFamilyAuthenticatedActor(actor);

  const outcome = await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
    const user = await assertActiveUser(transaction, actor);
    let where: Prisma.CaregiverInvitationWhereInput;
    if (transition === "REJECTED") {
      where = {
        ...("tokenHash" in locator ? { tokenHash: locator.tokenHash } : { id: locator.invitationId }),
        caregiverUserId: user.id,
        caregiverPersonId: user.personId,
      };
    } else {
      if (!("invitationId" in locator)) {
        throw new ValidationError();
      }
      where = {
        id: locator.invitationId,
        patientProfile: { is: { personId: user.personId } },
        issuedByUserId: user.id,
      };
    }
    const invitation = await transaction.caregiverInvitation.findFirst({
      where,
      select: { id: true, status: true },
    });

    if (!invitation) {
      throw new NotFoundError();
    }

    if (invitation.status !== CaregiverInvitationStatus.PENDING) {
      throw new ConflictError("The caregiver invitation is no longer pending");
    }

    if (transition === "REVOKED") {
      await assertPatientSelf(transaction, actor);
    }

    const transitioned =
      transition === "REJECTED"
        ? await transaction.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
            UPDATE "CaregiverInvitation"
            SET "status" = 'REJECTED',
                "rejectedAt" = clock_timestamp(),
                "updatedAt" = clock_timestamp()
            WHERE "id" = ${invitation.id}::uuid
              AND "caregiverUserId" = ${user.id}::uuid
              AND "caregiverPersonId" = ${user.personId}::uuid
              AND "status" = 'PENDING'
              AND "expiresAt" > clock_timestamp()
            RETURNING "id"
          `)
        : await transaction.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
            UPDATE "CaregiverInvitation"
            SET "status" = 'REVOKED',
                "revokedAt" = clock_timestamp(),
                "revokedByUserId" = ${user.id}::uuid,
                "updatedAt" = clock_timestamp()
            WHERE "id" = ${invitation.id}::uuid
              AND "status" = 'PENDING'
              AND "expiresAt" > clock_timestamp()
              AND "issuedByUserId" = ${user.id}::uuid
              AND "patientProfileId" = (
                SELECT "PatientProfile"."id"
                FROM "PatientProfile"
                WHERE "PatientProfile"."personId" = ${user.personId}::uuid
              )
            RETURNING "id"
          `);

    if (transitioned.length === 0) {
      if (await expireInvitationIfDue(transaction, user.id, invitation.id)) {
        return "EXPIRED" as const;
      }

      throw new ConflictError("The caregiver invitation changed concurrently");
    }

    const status =
      transition === "REJECTED"
        ? CaregiverInvitationStatus.REJECTED
        : CaregiverInvitationStatus.REVOKED;
    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: `caregiver_invitation.${transition.toLowerCase()}`,
        resourceType: "caregiver_invitation",
        resourceId: invitation.id,
        metadata: { status },
      },
      transaction,
    );

    return "COMPLETED" as const;
  });

  return outcome;
}

export async function rejectCaregiverInvitation(
  actor: ActorContext | null | undefined,
  plaintextToken: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<void> {
  assertFamilyAuthenticatedActor(actor);

  const parsedToken = caregiverInvitationTokenSchema.safeParse(plaintextToken);
  if (!parsedToken.success) {
    throw new NotFoundError();
  }

  try {
    const outcome = await transitionPendingInvitation(
      actor,
      { tokenHash: hashCaregiverInvitationToken(parsedToken.data) },
      "REJECTED",
      dependencies,
    );
    if (outcome === "EXPIRED") {
      throw new ConflictError("The caregiver invitation has expired");
    }
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be rejected");
  }
}

export async function revokePendingCaregiverInvitation(
  actor: ActorContext | null | undefined,
  invitationId: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<void> {
  assertFamilyPatientSelf(actor);

  const parsedInvitationId = caregiverInvitationIdSchema.safeParse({ invitationId });
  if (!parsedInvitationId.success) {
    throw new ValidationError();
  }

  try {
    const outcome = await transitionPendingInvitation(
      actor,
      { invitationId: parsedInvitationId.data.invitationId },
      "REVOKED",
      dependencies,
    );
    if (outcome === "EXPIRED") {
      throw new ConflictError("The caregiver invitation has expired");
    }
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be revoked");
  }
}

export async function acceptCaregiverInvitation(
  actor: ActorContext | null | undefined,
  plaintextToken: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<AcceptedCaregiverInvitation> {
  assertFamilyAuthenticatedActor(actor);
  const parsedToken = caregiverInvitationTokenSchema.safeParse(plaintextToken);

  if (!parsedToken.success) {
    throw new NotFoundError();
  }

  const tokenHash = hashCaregiverInvitationToken(parsedToken.data);

  try {
    const outcome = await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const user = await assertActiveUser(transaction, actor);
      const invitation = await transaction.caregiverInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          patientProfileId: true,
          caregiverUserId: true,
          caregiverPersonId: true,
          status: true,
        },
      });

      if (!invitation) {
        throw new NotFoundError();
      }

      if (
        invitation.caregiverUserId !== user.id ||
        invitation.caregiverPersonId !== user.personId
      ) {
        throw new ForbiddenError();
      }

      if (invitation.status !== CaregiverInvitationStatus.PENDING) {
        throw new ConflictError("The caregiver invitation is no longer pending");
      }

      const acceptedInvitations = await transaction.$queryRaw<AcceptedInvitationRow[]>(Prisma.sql`
        UPDATE "CaregiverInvitation"
        SET "status" = 'ACCEPTED',
            "acceptedAt" = clock_timestamp(),
            "acceptanceContractVersion" = ${FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${invitation.id}::uuid
          AND "caregiverUserId" = ${user.id}::uuid
          AND "caregiverPersonId" = ${user.personId}::uuid
          AND "status" = 'PENDING'
          AND "expiresAt" > clock_timestamp()
        RETURNING "id", "acceptedAt"
      `);

      if (acceptedInvitations.length === 0) {
        if (await expireInvitationIfDue(transaction, user.id, invitation.id)) {
          return { kind: "EXPIRED" as const };
        }

        throw new ConflictError("The caregiver invitation changed concurrently");
      }

      const acceptedAt = acceptedInvitations[0]?.acceptedAt;
      if (!acceptedAt) {
        throw new InfrastructureError("Caregiver acceptance time could not be recorded");
      }

      const relationship = await transaction.caregiverRelationship.create({
        data: {
          patientProfileId: invitation.patientProfileId,
          caregiverUserId: user.id,
          sourceInvitationId: invitation.id,
          status: CaregiverRelationshipStatus.ACTIVE,
          activatedAt: acceptedAt,
        },
        select: { id: true },
      });

      await recordAuditEvent(
        {
          actorUserId: user.id,
          action: "caregiver_invitation.accepted",
          resourceType: "caregiver_invitation",
          resourceId: invitation.id,
          metadata: {
            status: CaregiverInvitationStatus.ACCEPTED,
            acceptanceContractVersion: FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION,
          },
        },
        transaction,
      );
      await recordAuditEvent(
        {
          actorUserId: user.id,
          action: "caregiver_relationship.activated",
          resourceType: "caregiver_relationship",
          resourceId: relationship.id,
          metadata: { status: CaregiverRelationshipStatus.ACTIVE },
        },
        transaction,
      );

      return {
        kind: "ACCEPTED" as const,
        invitationId: invitation.id,
        relationshipId: relationship.id,
        acceptedAt,
      };
    });

    if (outcome.kind === "EXPIRED") {
      throw new ConflictError("The caregiver invitation has expired");
    }

    return {
      invitationId: outcome.invitationId,
      relationshipId: outcome.relationshipId,
      acceptedAt: outcome.acceptedAt,
      acceptanceContractVersion: FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION,
    };
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be accepted");
  }
}

export async function revokeCaregiverRelationship(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<void> {
  assertFamilyPatientSelf(actor);

  const parsedRelationshipId = caregiverRelationshipIdSchema.safeParse({ relationshipId });
  if (!parsedRelationshipId.success) {
    throw new ValidationError();
  }

  try {
    await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const patient = await assertPatientSelf(transaction, actor);
      const relationship = await transaction.caregiverRelationship.findFirst({
        where: {
          id: parsedRelationshipId.data.relationshipId,
          patientProfileId: patient.patientProfileId,
        },
        select: { id: true, status: true },
      });

      if (!relationship) {
        throw new NotFoundError();
      }
      if (relationship.status !== CaregiverRelationshipStatus.ACTIVE) {
        throw new ConflictError("The caregiver relationship is no longer active");
      }

      const now = getNow(dependencies);
      const changed = await transaction.caregiverRelationship.updateMany({
        where: {
          id: relationship.id,
          patientProfileId: patient.patientProfileId,
          status: CaregiverRelationshipStatus.ACTIVE,
        },
        data: {
          status: CaregiverRelationshipStatus.REVOKED,
          revokedAt: now,
          revokedByUserId: actor.userId,
        },
      });

      if (changed.count !== 1) {
        throw new ConflictError("The caregiver relationship changed concurrently");
      }

      await recordAuditEvent(
        {
          actorUserId: actor.userId,
          action: "caregiver_relationship.revoked",
          resourceType: "caregiver_relationship",
          resourceId: relationship.id,
          metadata: { status: CaregiverRelationshipStatus.REVOKED },
        },
        transaction,
      );
    });
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver relationship could not be revoked");
  }
}

export async function withdrawOwnCaregiverRelationship(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<void> {
  assertFamilyAuthenticatedActor(actor);

  const parsedRelationshipId = caregiverRelationshipIdSchema.safeParse({ relationshipId });
  if (!parsedRelationshipId.success) {
    throw new ValidationError();
  }

  try {
    await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const user = await assertActiveUser(transaction, actor);
      const relationship = await transaction.caregiverRelationship.findFirst({
        where: { id: parsedRelationshipId.data.relationshipId, caregiverUserId: user.id },
        select: { id: true, status: true },
      });

      if (!relationship) {
        throw new NotFoundError();
      }
      if (relationship.status !== CaregiverRelationshipStatus.ACTIVE) {
        throw new ConflictError("The caregiver relationship is no longer active");
      }

      const now = getNow(dependencies);
      const changed = await transaction.caregiverRelationship.updateMany({
        where: {
          id: relationship.id,
          caregiverUserId: user.id,
          status: CaregiverRelationshipStatus.ACTIVE,
        },
        data: {
          status: CaregiverRelationshipStatus.WITHDRAWN,
          withdrawnAt: now,
        },
      });

      if (changed.count !== 1) {
        throw new ConflictError("The caregiver relationship changed concurrently");
      }

      await recordAuditEvent(
        {
          actorUserId: user.id,
          action: "caregiver_relationship.withdrawn",
          resourceType: "caregiver_relationship",
          resourceId: relationship.id,
          metadata: { status: CaregiverRelationshipStatus.WITHDRAWN },
        },
        transaction,
      );
    });
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver relationship could not be withdrawn");
  }
}

export const caregiverRelationshipServiceInternals = {
  assertActiveUser,
  assertPatientSelf,
  expireInvitationIfDue,
  expirePairInvitations,
  formatPersonDisplayName,
};
