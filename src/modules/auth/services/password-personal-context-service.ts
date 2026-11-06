import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference, identityKeyHashesMatch } from "@/modules/identity/services/identity-service";
import { InfrastructureError } from "@/shared/errors/application-error";

import {
  assertPasswordNotPersonal,
  type PasswordPersonalContext,
} from "../domain/password-personal-info";

export type PasswordPersonalContextDatabase = Pick<PrismaClient, "user"> | Prisma.TransactionClient;

/** Bounded: a person has few memberships or Hospital relationships; the newest ones carry the current values. */
const PERSONAL_RECORD_LIMIT = 50;

const passwordPersonalContextSelect = {
  person: {
    select: {
      identityKeyHash: true,
      patientProfile: {
        select: {
          dateOfBirth: true,
          phoneNumber: true,
          hospitalRelationships: {
            select: { hospitalNumber: true },
            orderBy: { createdAt: "desc" },
            take: PERSONAL_RECORD_LIMIT,
          },
        },
      },
    },
  },
  memberships: { select: { contactPhone: true }, orderBy: { createdAt: "desc" }, take: PERSONAL_RECORD_LIMIT },
  osmHospitalRelationships: { select: { contactPhone: true }, orderBy: { createdAt: "desc" }, take: PERSONAL_RECORD_LIMIT },
} satisfies Prisma.UserSelect;

/** Compares a 13-digit candidate with the stored keyed hash, so the National ID never needs to be stored in clear. */
function nationalIdMatcher(identityKeyHash: string): (candidate: string) => boolean {
  return (candidate) => identityKeyHashesMatch(
    identityKeyHash,
    hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: candidate }),
  );
}

/**
 * The personal data DEMI holds for `userId` (ADR-0030): National ID (as its keyed hash), patient phone and birthdate,
 * HNs, and workforce/OSM contact phones. `supplied` adds a National ID typed in the same request.
 */
export async function loadPasswordPersonalContext(
  database: PasswordPersonalContextDatabase,
  userId: string,
  supplied: { nationalIds?: readonly string[] } = {},
): Promise<PasswordPersonalContext> {
  let user: Prisma.UserGetPayload<{ select: typeof passwordPersonalContextSelect }> | null;
  try {
    user = await database.user.findUnique({ where: { id: userId }, select: passwordPersonalContextSelect });
  } catch {
    throw new InfrastructureError("Password personal information could not be checked");
  }

  const profile = user?.person.patientProfile ?? null;
  return {
    nationalIds: supplied.nationalIds ?? [],
    ...(user ? { matchesNationalId: nationalIdMatcher(user.person.identityKeyHash) } : {}),
    phoneNumbers: [
      profile?.phoneNumber,
      ...(user?.memberships.map(({ contactPhone }) => contactPhone) ?? []),
      ...(user?.osmHospitalRelationships.map(({ contactPhone }) => contactPhone) ?? []),
    ],
    hospitalNumbers: profile?.hospitalRelationships.map(({ hospitalNumber }) => hospitalNumber) ?? [],
    birthDates: [profile?.dateOfBirth],
  };
}

/** Throws PasswordPolicyRejectedError("PASSWORD_PERSONAL_INFO") when the password contains the User's own data. */
export async function assertUserPasswordNotPersonal(
  database: PasswordPersonalContextDatabase,
  userId: string,
  password: string,
  supplied: { nationalIds?: readonly string[] } = {},
): Promise<void> {
  assertPasswordNotPersonal(password, await loadPasswordPersonalContext(database, userId, supplied));
}
