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
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";

import { assertFamilyAuthenticatedActor } from "../policies/caregiver-relationship-policy";
import { familyManagementCursorSchema } from "../schemas/caregiver-relationship-schemas";

export const FAMILY_MANAGEMENT_PAGE_SIZE = 30;

export type FamilyInvitationManagementItem = {
  invitationId: string;
  status: CaregiverInvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
};

export type FamilyRelationshipManagementItem = {
  relationshipId: string;
  status: CaregiverRelationshipStatus;
  activatedAt: Date;
  revokedAt: Date | null;
  withdrawnAt: Date | null;
};

export type FamilyManagementOverview = {
  patient: {
    invitations: readonly FamilyInvitationManagementItem[];
    nextInvitationsCursor: string | null;
    relationships: readonly FamilyRelationshipManagementItem[];
    nextRelationshipsCursor: string | null;
  } | null;
  caregiver: {
    invitations: readonly FamilyInvitationManagementItem[];
    nextInvitationsCursor: string | null;
    relationships: readonly FamilyRelationshipManagementItem[];
    nextRelationshipsCursor: string | null;
  };
};

export type FamilyManagementQueryDependencies = {
  database?: PrismaClient;
  now?: () => Date;
};

const invitationManagementSelect = {
  id: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
} satisfies Prisma.CaregiverInvitationSelect;

const relationshipManagementSelect = {
  id: true,
  status: true,
  activatedAt: true,
  revokedAt: true,
  withdrawnAt: true,
} satisfies Prisma.CaregiverRelationshipSelect;

const caregiverInvitationManagementSelect = invitationManagementSelect;

const caregiverRelationshipManagementSelect = relationshipManagementSelect;

type InvitationRecord = Prisma.CaregiverInvitationGetPayload<{
  select: typeof invitationManagementSelect;
}>;
type RelationshipRecord = Prisma.CaregiverRelationshipGetPayload<{
  select: typeof relationshipManagementSelect;
}>;

function getDatabase(dependencies: FamilyManagementQueryDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: FamilyManagementQueryDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function asInvitationItem(
  invitation: InvitationRecord,
  now: Date,
): FamilyInvitationManagementItem {
  return {
    invitationId: invitation.id,
    status:
      invitation.status === CaregiverInvitationStatus.PENDING &&
      invitation.expiresAt.getTime() <= now.getTime()
        ? CaregiverInvitationStatus.EXPIRED
        : invitation.status,
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
  };
}

function asRelationshipItem(
  relationship: RelationshipRecord,
): FamilyRelationshipManagementItem {
  return {
    relationshipId: relationship.id,
    status: relationship.status,
    activatedAt: relationship.activatedAt,
    revokedAt: relationship.revokedAt,
    withdrawnAt: relationship.withdrawnAt,
  };
}

function getNextCursor<T extends { id: string }>(rows: readonly T[]): string | null {
  if (rows.length <= FAMILY_MANAGEMENT_PAGE_SIZE) {
    return null;
  }

  return rows[FAMILY_MANAGEMENT_PAGE_SIZE - 1]?.id ?? null;
}

function cursorArgs(cursor: string | undefined): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

export async function getFamilyManagementOverview(
  actor: ActorContext | null | undefined,
  input: unknown = {},
  dependencies: FamilyManagementQueryDependencies = {},
): Promise<FamilyManagementOverview> {
  assertFamilyAuthenticatedActor(actor);
  const parsedInput = familyManagementCursorSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);
  const now = getNow(dependencies);

  try {
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

    const patientProfile = user.roles.some(({ role }) => role === Role.PATIENT)
      ? await database.patientProfile.findUnique({
          where: { personId: user.personId },
          select: { id: true },
        })
      : null;

    const [patientInvitations, patientRelationships, caregiverInvitations, caregiverRelationships] =
      await Promise.all([
        patientProfile
          ? database.caregiverInvitation.findMany({
              where: { patientProfileId: patientProfile.id },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: FAMILY_MANAGEMENT_PAGE_SIZE + 1,
              ...cursorArgs(parsedInput.data.patientInvitationsCursor),
              select: invitationManagementSelect,
            })
          : Promise.resolve([] as InvitationRecord[]),
        patientProfile
          ? database.caregiverRelationship.findMany({
              where: { patientProfileId: patientProfile.id },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: FAMILY_MANAGEMENT_PAGE_SIZE + 1,
              ...cursorArgs(parsedInput.data.patientRelationshipsCursor),
              select: relationshipManagementSelect,
            })
          : Promise.resolve([] as RelationshipRecord[]),
        database.caregiverInvitation.findMany({
          where: { caregiverUserId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: FAMILY_MANAGEMENT_PAGE_SIZE + 1,
          ...cursorArgs(parsedInput.data.caregiverInvitationsCursor),
          select: caregiverInvitationManagementSelect,
        }),
        database.caregiverRelationship.findMany({
          where: { caregiverUserId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: FAMILY_MANAGEMENT_PAGE_SIZE + 1,
          ...cursorArgs(parsedInput.data.caregiverRelationshipsCursor),
          select: caregiverRelationshipManagementSelect,
        }),
      ]);

    const patientInvitationCursor = getNextCursor(patientInvitations);
    const patientRelationshipCursor = getNextCursor(patientRelationships);
    const caregiverInvitationCursor = getNextCursor(caregiverInvitations);
    const caregiverRelationshipCursor = getNextCursor(caregiverRelationships);

    return {
      patient: patientProfile
        ? {
            invitations: patientInvitations
              .slice(0, FAMILY_MANAGEMENT_PAGE_SIZE)
              .map((invitation) => asInvitationItem(invitation, now)),
            nextInvitationsCursor: patientInvitationCursor,
            relationships: patientRelationships
              .slice(0, FAMILY_MANAGEMENT_PAGE_SIZE)
              .map(asRelationshipItem),
            nextRelationshipsCursor: patientRelationshipCursor,
          }
        : null,
      caregiver: {
        invitations: caregiverInvitations
          .slice(0, FAMILY_MANAGEMENT_PAGE_SIZE)
          .map((invitation) => asInvitationItem(invitation, now)),
        nextInvitationsCursor: caregiverInvitationCursor,
        relationships: caregiverRelationships
          .slice(0, FAMILY_MANAGEMENT_PAGE_SIZE)
          .map(asRelationshipItem),
        nextRelationshipsCursor: caregiverRelationshipCursor,
      },
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Family relationship management could not be loaded");
  }
}

export const caregiverRelationshipQueryInternals = {
  asInvitationItem,
  asRelationshipItem,
  invitationManagementSelect,
  relationshipManagementSelect,
  caregiverInvitationManagementSelect,
  caregiverRelationshipManagementSelect,
};
