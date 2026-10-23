import "server-only";

import {
  CaregiverInvitationStatus,
  CaregiverRelationshipStatus,
  Prisma,
  Role,
  UserStatus,
  type CaregiverResource,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference, identityKeyHashesMatch } from "@/modules/identity/services/identity-service";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
  ApplicationError,
} from "@/shared/errors/application-error";

import { formatCaregiverRelationshipLabel, isPlanMedicationResource } from "../domain/caregiver-sharing-contract";
import { assertFamilyAuthenticatedActor, assertFamilyPatientSelf } from "../policies/caregiver-relationship-policy";
import {
  caregiverInvitationIdSchema,
  caregiverRelationshipIdSchema,
  createCaregiverInvitationInputSchema,
  caregiverInvitationTokenSchema,
  updateCaregiverRelationshipLabelInputSchema,
} from "../schemas/caregiver-relationship-schemas";
import {
  activatableInvitationSelect,
  activateCaregiverRelationship,
  parseRequestedScopes,
  resolveCaregiverSharingGates,
  type CaregiverSharingGates,
} from "./caregiver-scope-activation";
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
  gates?: CaregiverSharingGates;
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
  identityKeyHash: string;
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
      person: { select: { identityKeyHash: true } },
    },
  });

  if (!user) {
    throw new ForbiddenError();
  }

  return {
    id: user.id,
    personId: user.personId,
    identityKeyHash: user.person.identityKeyHash,
    roles: user.roles,
  };
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
        "recipientIdentityKeyHash" = NULL,
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

async function expireHashInvitation(
  database: Prisma.TransactionClient,
  actorUserId: string,
  patientProfileId: string,
  recipientIdentityKeyHash: string,
): Promise<void> {
  const expiredInvitations = await database.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
    UPDATE "CaregiverInvitation"
    SET "status" = 'EXPIRED',
        "recipientIdentityKeyHash" = NULL,
        "expiredAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "patientProfileId" = ${patientProfileId}::uuid
      AND "recipientIdentityKeyHash" = ${recipientIdentityKeyHash}
      AND "caregiverUserId" IS NULL
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
  actorUserId: string | null,
  invitationId: string,
): Promise<boolean> {
  const expiredInvitations = await database.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
    UPDATE "CaregiverInvitation"
    SET "status" = 'EXPIRED',
        "recipientIdentityKeyHash" = NULL,
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

async function expireInvitationFromPublicPreview(
  database: PrismaClient,
  invitationId: string,
): Promise<void> {
  await runSerializableTransaction(database, async (transaction) => {
    await expireInvitationIfDue(transaction, null, invitationId);
  });
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
  const { appointmentRelationshipIds, resources } = parsedInput.data;
  const gates = resolveCaregiverSharingGates(dependencies.gates);
  if ((appointmentRelationshipIds.length > 0 || resources.length > 0) && !gates.delegatedReadEnabled) {
    throw new ValidationError("Caregiver sharing is not available");
  }
  if (resources.some(isPlanMedicationResource) && !gates.planMedicationEnabled) {
    throw new ValidationError("Caregiver sharing is not available");
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
      const isUnregisteredRelative = recipientPerson === null;

      if (recipientPerson && (
        !caregiver ||
        caregiver.status !== UserStatus.ACTIVE ||
        !caregiver.authSubject ||
        caregiver.personId !== recipientPerson.id ||
        caregiver.id === actor.userId ||
        recipientPerson.id === patient.patientPersonId
      )) {
        throw new ConflictError("A caregiver invitation cannot be created for this information");
      }

      if (isUnregisteredRelative) {
        await expireHashInvitation(transaction, actor.userId, patient.patientProfileId, recipientIdentityHash);
      } else if (caregiver) {
        await expirePairInvitations(transaction, actor.userId, patient.patientProfileId, caregiver.id);
      }

      const recipientUserFilter: Prisma.CaregiverRelationshipWhereInput = isUnregisteredRelative
        ? { caregiverUser: { person: { identityKeyHash: recipientIdentityHash } } }
        : { caregiverUserId: caregiver?.id };
      const activeRelationship = await transaction.caregiverRelationship.findFirst({
        where: {
          patientProfileId: patient.patientProfileId,
          ...recipientUserFilter,
          status: CaregiverRelationshipStatus.ACTIVE,
        },
        select: { id: true },
      });
      const pendingInvitation = await transaction.caregiverInvitation.findFirst({
        where: {
          patientProfileId: patient.patientProfileId,
          status: CaregiverInvitationStatus.PENDING,
          ...(isUnregisteredRelative
            ? { recipientIdentityKeyHash: recipientIdentityHash }
            : { caregiverUserId: caregiver?.id }),
        },
        select: { id: true },
      });

      if (activeRelationship || pendingInvitation) {
        throw new ConflictError("A caregiver invitation cannot be created for this information");
      }

      if (appointmentRelationshipIds.length > 0) {
        const ownOngoing = await transaction.patientHospitalRelationship.count({
          where: {
            id: { in: appointmentRelationshipIds }, patientProfileId: patient.patientProfileId,
            ...activePatientHospitalRelationshipWhere, hospital: { is: { status: "ACTIVE" } },
          },
        });
        if (ownOngoing !== appointmentRelationshipIds.length) {
          throw new ValidationError("Appointment sharing can only name the Patient's ongoing Hospitals");
        }
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
          ...(isUnregisteredRelative
            ? { recipientIdentityKeyHash: recipientIdentityHash }
            : { caregiverUserId: caregiver?.id, caregiverPersonId: recipientPerson?.id }),
          issuedByUserId: actor.userId,
          tokenHash: credential.tokenHash,
          status: CaregiverInvitationStatus.PENDING,
          issuedAt: issueTime.issuedAt,
          expiresAt: issueTime.expiresAt,
          requestedRelationshipLabel: parsedInput.data.relationshipLabel ?? null,
          requestedRelationshipLabelOther: parsedInput.data.relationshipLabelOther ?? null,
          requestedScopes: { appointmentRelationshipIds, resources },
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
            requestedAppointmentHospitalCount: appointmentRelationshipIds.length,
            requestedResources: resources.join(","),
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

/**
 * AF-5: what accepting this invitation will share. Hospital names are listed only to the signed-in invitee whose
 * identity matches the invitation; the public (token-only) preview gets the count.
 */
export type CaregiverInvitationRequestedSharing = {
  relationshipLabel: string | null;
  appointmentHospitalCount: number;
  appointmentHospitalNames: string[] | null;
  resources: CaregiverResource[];
};

export type CaregiverInvitationPreview = {
  status: CaregiverInvitationStatus;
  expiresAt: Date;
  patientDisplayName: string;
  acceptanceContractVersion: typeof FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION;
  requestedSharing: CaregiverInvitationRequestedSharing;
};

const requestedSharingSelect = {
  requestedRelationshipLabel: true,
  requestedRelationshipLabelOther: true,
  requestedScopes: true,
} satisfies Prisma.CaregiverInvitationSelect;

async function toRequestedSharing(
  database: PrismaClient,
  invitation: Prisma.CaregiverInvitationGetPayload<{ select: typeof requestedSharingSelect }> & { patientProfileId: string },
  withHospitalNames: boolean,
): Promise<CaregiverInvitationRequestedSharing> {
  // An unparsable stored value lists nothing here; acceptance then fails closed.
  const scopes = parseRequestedScopes(invitation.requestedScopes) ?? { appointmentRelationshipIds: [], resources: [] };
  const hospitals = withHospitalNames && scopes.appointmentRelationshipIds.length > 0
    ? await database.patientHospitalRelationship.findMany({
        where: { id: { in: scopes.appointmentRelationshipIds }, patientProfileId: invitation.patientProfileId },
        select: { id: true, hospital: { select: { name: true } } },
      })
    : [];
  return {
    relationshipLabel: formatCaregiverRelationshipLabel(invitation.requestedRelationshipLabel, invitation.requestedRelationshipLabelOther),
    appointmentHospitalCount: scopes.appointmentRelationshipIds.length,
    appointmentHospitalNames: withHospitalNames
      ? scopes.appointmentRelationshipIds.flatMap((id) => hospitals.find((row) => row.id === id)?.hospital.name ?? [])
      : null,
    resources: scopes.resources,
  };
}

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
        recipientIdentityKeyHash: true,
        status: true,
        expiresAt: true,
        patientProfileId: true,
        ...requestedSharingSelect,
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

    const isBoundToUser = invitation.caregiverUserId === user.id &&
      invitation.caregiverPersonId === user.personId;
    const isHashInvitationForUser = invitation.caregiverUserId === null &&
      invitation.caregiverPersonId === null && invitation.recipientIdentityKeyHash !== null &&
      identityKeyHashesMatch(invitation.recipientIdentityKeyHash, user.identityKeyHash);
    if (!isBoundToUser && !isHashInvitationForUser) {
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
      requestedSharing: await toRequestedSharing(database, invitation, true),
    };
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation could not be previewed");
  }
}

export type PublicCaregiverInvitationPreview = {
  status: "NEEDS_ACCOUNT" | "NEEDS_LOGIN";
  expiresAt: Date;
  patientDisplayName: string;
  acceptanceContractVersion: typeof FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION;
  requestedSharing: CaregiverInvitationRequestedSharing;
};

/** Token possession previews only the invitation's patient and the required next account step. */
export async function previewPublicCaregiverInvitation(
  plaintextToken: unknown,
  dependencies: Pick<CaregiverRelationshipServiceDependencies, "database" | "now"> = {},
): Promise<PublicCaregiverInvitationPreview> {
  const parsedToken = caregiverInvitationTokenSchema.safeParse(plaintextToken);
  if (!parsedToken.success) throw new NotFoundError();

  const database = dependencies.database ?? getPrisma();
  try {
    const invitation = await database.caregiverInvitation.findUnique({
      where: { tokenHash: hashCaregiverInvitationToken(parsedToken.data) },
      select: {
        id: true,
        caregiverUserId: true,
        caregiverPersonId: true,
        recipientIdentityKeyHash: true,
        status: true,
        expiresAt: true,
        patientProfileId: true,
        ...requestedSharingSelect,
        patientProfile: { select: { person: { select: { givenName: true, familyName: true } } } },
      },
    });

    if (!invitation) {
      throw new NotFoundError();
    }

    const isUnclaimedIdentity = invitation.caregiverUserId === null &&
      invitation.caregiverPersonId === null && invitation.recipientIdentityKeyHash !== null;
    if (invitation.status !== CaregiverInvitationStatus.PENDING) {
      throw new NotFoundError();
    }
    if (invitation.expiresAt.getTime() <= getNow(dependencies).getTime()) {
      if (isUnclaimedIdentity) {
        await expireInvitationFromPublicPreview(database, invitation.id);
      }
      throw new NotFoundError();
    }

    return {
      status: isUnclaimedIdentity ? "NEEDS_ACCOUNT" : "NEEDS_LOGIN",
      expiresAt: invitation.expiresAt,
      patientDisplayName: formatPersonDisplayName(invitation.patientProfile.person),
      acceptanceContractVersion: FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION,
      requestedSharing: await toRequestedSharing(database, invitation, false),
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
        OR: [
          { caregiverUserId: user.id, caregiverPersonId: user.personId },
          { caregiverUserId: null, caregiverPersonId: null, recipientIdentityKeyHash: user.identityKeyHash },
        ],
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
                "caregiverUserId" = ${user.id}::uuid,
                "caregiverPersonId" = ${user.personId}::uuid,
                "recipientIdentityKeyHash" = NULL,
                "rejectedAt" = clock_timestamp(),
                "updatedAt" = clock_timestamp()
            WHERE "id" = ${invitation.id}::uuid
              AND (
                ("caregiverUserId" = ${user.id}::uuid AND "caregiverPersonId" = ${user.personId}::uuid)
                OR ("caregiverUserId" IS NULL AND "caregiverPersonId" IS NULL
                    AND "recipientIdentityKeyHash" = ${user.identityKeyHash})
              )
              AND "status" = 'PENDING'
              AND "expiresAt" > clock_timestamp()
            RETURNING "id"
          `)
        : await transaction.$queryRaw<ExpiringInvitationRow[]>(Prisma.sql`
            UPDATE "CaregiverInvitation"
            SET "status" = 'REVOKED',
                "recipientIdentityKeyHash" = NULL,
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

export type ReissuedCaregiverInvitationLink = {
  invitationId: string;
  plaintextToken: string;
  expiresAt: Date;
};

/**
 * Customer decision E2 (ก-17): only the token hash is stored, so showing a pending invitation as a QR
 * rotates its secret. Recipient, expiry and acceptance rules stay unchanged; the previous link stops working.
 */
export async function reissueCaregiverInvitationLink(
  actor: ActorContext | null | undefined,
  invitationId: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<ReissuedCaregiverInvitationLink> {
  assertFamilyPatientSelf(actor);

  const parsedInvitationId = caregiverInvitationIdSchema.safeParse({ invitationId });
  if (!parsedInvitationId.success) {
    throw new ValidationError();
  }

  const credential = (dependencies.generateCredential ?? generateCaregiverInvitationCredential)();

  try {
    const outcome = await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const patient = await assertPatientSelf(transaction, actor);
      const invitation = await transaction.caregiverInvitation.findFirst({
        where: {
          id: parsedInvitationId.data.invitationId,
          patientProfileId: patient.patientProfileId,
          issuedByUserId: actor.userId,
        },
        select: { id: true, status: true },
      });

      if (!invitation) {
        throw new NotFoundError();
      }

      if (invitation.status !== CaregiverInvitationStatus.PENDING) {
        throw new ConflictError("The caregiver invitation is no longer pending");
      }

      const reissued = await transaction.$queryRaw<Array<{ id: string; expiresAt: Date }>>(Prisma.sql`
        UPDATE "CaregiverInvitation"
        SET "tokenHash" = ${credential.tokenHash},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${invitation.id}::uuid
          AND "patientProfileId" = ${patient.patientProfileId}::uuid
          AND "issuedByUserId" = ${actor.userId}::uuid
          AND "status" = 'PENDING'
          AND "expiresAt" > clock_timestamp()
        RETURNING "id", "expiresAt"
      `);
      const row = reissued[0];

      if (!row) {
        if (await expireInvitationIfDue(transaction, actor.userId, invitation.id)) {
          return { kind: "EXPIRED" as const };
        }

        throw new ConflictError("The caregiver invitation changed concurrently");
      }

      await recordAuditEvent(
        {
          actorUserId: actor.userId,
          action: "caregiver_invitation.link_reissued",
          resourceType: "caregiver_invitation",
          resourceId: row.id,
          metadata: {
            status: CaregiverInvitationStatus.PENDING,
            expiresAt: row.expiresAt.toISOString(),
          },
        },
        transaction,
      );

      return { kind: "REISSUED" as const, invitationId: row.id, expiresAt: row.expiresAt };
    });

    if (outcome.kind === "EXPIRED") {
      throw new ConflictError("The caregiver invitation has expired");
    }

    return {
      invitationId: outcome.invitationId,
      plaintextToken: credential.plaintextToken,
      expiresAt: outcome.expiresAt,
    };
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver invitation link could not be reissued");
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
  const gates = resolveCaregiverSharingGates(dependencies.gates);

  try {
    const outcome = await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const user = await assertActiveUser(transaction, actor);
      const invitation = await transaction.caregiverInvitation.findUnique({
        where: { tokenHash },
        select: {
          ...activatableInvitationSelect,
          caregiverUserId: true,
          caregiverPersonId: true,
          recipientIdentityKeyHash: true,
          status: true,
        },
      });

      if (!invitation) {
        throw new NotFoundError();
      }

      const isBoundToUser = invitation.caregiverUserId === user.id &&
        invitation.caregiverPersonId === user.personId;
      const isHashInvitationForUser = invitation.caregiverUserId === null &&
        invitation.caregiverPersonId === null && invitation.recipientIdentityKeyHash !== null &&
        identityKeyHashesMatch(invitation.recipientIdentityKeyHash, user.identityKeyHash);
      if (!isBoundToUser && !isHashInvitationForUser) {
        throw new ForbiddenError();
      }

      if (invitation.status !== CaregiverInvitationStatus.PENDING) {
        throw new ConflictError("The caregiver invitation is no longer pending");
      }

      const acceptedInvitations = await transaction.$queryRaw<AcceptedInvitationRow[]>(Prisma.sql`
        UPDATE "CaregiverInvitation"
        SET "status" = 'ACCEPTED',
            "caregiverUserId" = ${user.id}::uuid,
            "caregiverPersonId" = ${user.personId}::uuid,
            "recipientIdentityKeyHash" = NULL,
            "acceptedAt" = clock_timestamp(),
            "acceptanceContractVersion" = ${FAMILY_DELEGATION_ACCEPTANCE_CONTRACT_VERSION},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${invitation.id}::uuid
          AND (
            ("caregiverUserId" = ${user.id}::uuid AND "caregiverPersonId" = ${user.personId}::uuid)
            OR ("caregiverUserId" IS NULL AND "caregiverPersonId" IS NULL
                AND "recipientIdentityKeyHash" = ${user.identityKeyHash})
          )
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

      const relationship = await activateCaregiverRelationship(transaction, {
        invitation,
        caregiver: { userId: user.id, personId: user.personId },
        acceptedAt,
        gates,
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
          resourceId: relationship.relationshipId,
          metadata: { status: CaregiverRelationshipStatus.ACTIVE },
        },
        transaction,
      );

      return {
        kind: "ACCEPTED" as const,
        invitationId: invitation.id,
        relationshipId: relationship.relationshipId,
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

/**
 * AF-5: ending a relationship (Patient revocation or caregiver withdrawal) revokes every actionable appointment and
 * resource grant under it in the same transaction. Reads already deny through the relationship status; this keeps
 * the grant records consistent with it.
 */
async function revokeRelationshipGrants(
  transaction: Prisma.TransactionClient,
  relationshipId: string,
  actorUserId: string,
  now: Date,
): Promise<void> {
  const where = { caregiverRelationshipId: relationshipId, status: { in: ["PENDING", "ACTIVE"] as ("PENDING" | "ACTIVE")[] } };
  const [appointmentGrants, resourceGrants] = await Promise.all([
    transaction.caregiverAppointmentGrant.findMany({ where, select: { id: true, status: true, contractVersion: true } }),
    transaction.caregiverResourceGrant.findMany({ where, select: { id: true, status: true, resource: true, contractVersion: true } }),
  ]);
  const data = { status: "REVOKED" as const, revokedByUserId: actorUserId, revokedAt: now };
  await transaction.caregiverAppointmentGrant.updateMany({ where: { id: { in: appointmentGrants.map(({ id }) => id) }, ...where }, data });
  await transaction.caregiverResourceGrant.updateMany({ where: { id: { in: resourceGrants.map(({ id }) => id) }, ...where }, data });
  for (const grant of appointmentGrants) {
    await recordAuditEvent({
      actorUserId, action: "caregiver_appointment_grant.revoked", resourceType: "caregiver_appointment_grant", resourceId: grant.id,
      metadata: { contractVersion: grant.contractVersion, priorStatus: grant.status, reason: "RELATIONSHIP_ENDED" },
    }, transaction);
  }
  for (const grant of resourceGrants) {
    await recordAuditEvent({
      actorUserId, action: "caregiver_resource_grant.revoked", resourceType: "caregiver_resource_grant", resourceId: grant.id,
      metadata: { resource: grant.resource, contractVersion: grant.contractVersion, priorStatus: grant.status, reason: "RELATIONSHIP_ENDED" },
    }, transaction);
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
      await revokeRelationshipGrants(transaction, relationship.id, actor.userId, now);

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
      await revokeRelationshipGrants(transaction, relationship.id, user.id, now);

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

/** AF-5: the Patient edits a caregiver's label; optimistic version, audited without the free-text value. */
export async function updateCaregiverRelationshipLabel(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: CaregiverRelationshipServiceDependencies = {},
): Promise<{ relationshipLabelVersion: number }> {
  assertFamilyPatientSelf(actor);
  const parsed = updateCaregiverRelationshipLabelInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError();
  }

  try {
    return await runSerializableTransaction(getDatabase(dependencies), async (transaction) => {
      const patient = await assertPatientSelf(transaction, actor);
      const relationship = await transaction.caregiverRelationship.findFirst({
        where: { id: parsed.data.relationshipId, patientProfileId: patient.patientProfileId },
        select: { id: true, status: true, relationshipLabel: true, relationshipLabelVersion: true },
      });
      if (!relationship) {
        throw new NotFoundError();
      }
      if (relationship.status !== CaregiverRelationshipStatus.ACTIVE || relationship.relationshipLabelVersion !== parsed.data.expectedVersion) {
        throw new ConflictError("The caregiver relationship changed concurrently");
      }

      const changed = await transaction.caregiverRelationship.updateMany({
        where: {
          id: relationship.id,
          patientProfileId: patient.patientProfileId,
          status: CaregiverRelationshipStatus.ACTIVE,
          relationshipLabelVersion: parsed.data.expectedVersion,
        },
        data: {
          relationshipLabel: parsed.data.relationshipLabel,
          relationshipLabelOther: parsed.data.relationshipLabelOther ?? null,
          relationshipLabelVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The caregiver relationship changed concurrently");
      }

      const version = parsed.data.expectedVersion + 1;
      await recordAuditEvent(
        {
          actorUserId: actor.userId,
          action: "caregiver_relationship.label_updated",
          resourceType: "caregiver_relationship",
          resourceId: relationship.id,
          metadata: { fromLabel: relationship.relationshipLabel, toLabel: parsed.data.relationshipLabel, relationshipLabelVersion: version },
        },
        transaction,
      );
      return { relationshipLabelVersion: version };
    });
  } catch (error: unknown) {
    rethrowServiceError(error, "Caregiver relationship label could not be updated");
  }
}

export const caregiverRelationshipServiceInternals = {
  assertActiveUser,
  assertPatientSelf,
  expireInvitationIfDue,
  expirePairInvitations,
  formatPersonDisplayName,
};
