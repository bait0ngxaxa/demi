import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  WorkforceActivationOperationState,
  type Prisma,
} from "@prisma/client";
import { hasConflictingWorkforceRelationships } from "@/modules/identity/services/workforce-relationship-compatibility";
import { ConflictError } from "@/shared/errors/application-error";

import {
  SELF_REGISTRATION_ELIGIBILITY_WINDOW_MS,
  selfRegistrationRelationshipsSchema,
  type SelfRegistrationRelationship,
} from "../domain/self-registration-schemas";

const selfRegistrationUserSelect = {
  id: true,
  status: true,
  authSubject: true,
  roles: { select: { role: true } },
  memberships: {
    select: {
      id: true,
      hospitalId: true,
      membershipType: true,
      status: true,
      createdAt: true,
      selfRegisteredAt: true,
      hospital: { select: { status: true, selfRegistrationEnabled: true } },
    },
  },
  osmHospitalRelationships: {
    select: {
      id: true,
      hospitalId: true,
      status: true,
      createdAt: true,
      selfRegisteredAt: true,
      hospital: { select: { status: true, selfRegistrationEnabled: true } },
    },
  },
  person: {
    select: {
      patientProfile: {
        select: {
          id: true,
          hospitalRelationships: {
            select: {
              id: true,
              hospitalId: true,
              createdAt: true,
              endedAt: true,
              selfRegisteredAt: true,
              hospital: { select: { status: true, selfRegistrationEnabled: true } },
            },
          },
        },
      },
    },
  },
  workforceActivations: {
    select: {
      id: true,
      claimedAt: true,
      usedAt: true,
      reconciliationRequiredAt: true,
      operationState: true,
    },
  },
  patientActivations: {
    select: { id: true, claimedAt: true, usedAt: true, reconciliationRequiredAt: true },
  },
  accountRecoveries: {
    select: { claimedAt: true, completedAt: true, reconciliationRequiredAt: true },
  },
} satisfies Prisma.UserSelect;

type SelfRegistrationUser = Prisma.UserGetPayload<{ select: typeof selfRegistrationUserSelect }>;

export type SelfRegistrationEligibility =
  | { outcome: "NOT_FOUND" }
  | { outcome: "ALREADY_ACTIVE" }
  | {
      outcome: "ELIGIBLE";
      userId: string;
      identityKeyHash: string;
      givenName: string | null;
      familyName: string | null;
      relationships: SelfRegistrationRelationship[];
    };

function isRecent(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return age >= 0 && age <= SELF_REGISTRATION_ELIGIBILITY_WINDOW_MS;
}

type SelfRegistrationEligibilityOptions = {
  expectedAuthSubject?: string;
  ignoreActivation?: { kind: "WORKFORCE" | "PATIENT"; id: string };
};

function hasUnresolvedFirstCredentialOperation(
  user: SelfRegistrationUser,
  options: SelfRegistrationEligibilityOptions = {},
): boolean {
  return user.workforceActivations.some(
    ({ id, claimedAt, usedAt, reconciliationRequiredAt, operationState }) =>
      !(options.ignoreActivation?.kind === "WORKFORCE" && options.ignoreActivation.id === id) &&
      (claimedAt !== null ||
        usedAt !== null ||
        reconciliationRequiredAt !== null ||
        operationState !== WorkforceActivationOperationState.NOT_STARTED),
  ) || user.patientActivations.some(
    ({ id, claimedAt, usedAt, reconciliationRequiredAt }) =>
      !(options.ignoreActivation?.kind === "PATIENT" && options.ignoreActivation.id === id) &&
      (claimedAt !== null || usedAt !== null || reconciliationRequiredAt !== null),
  ) || user.accountRecoveries.some(
    ({ claimedAt, completedAt, reconciliationRequiredAt }) =>
      reconciliationRequiredAt !== null || (claimedAt !== null && completedAt === null),
  );
}

function eligibleRelationships(user: SelfRegistrationUser, now: Date): SelfRegistrationRelationship[] {
  const relationships: SelfRegistrationRelationship[] = [];
  const hasHospitalRole = user.roles.some(({ role }) => role === Role.HOSPITAL);
  const hasOsmRole = user.roles.some(({ role }) => role === Role.OSM);
  const hasPatientRole = user.roles.some(({ role }) => role === Role.PATIENT);

  for (const membership of user.memberships) {
    if (
      membership.membershipType === MembershipType.MEMBER &&
      membership.status === MembershipStatus.PROVISIONED &&
      membership.selfRegisteredAt === null &&
      hasHospitalRole &&
      membership.hospital.status === HospitalStatus.ACTIVE &&
      membership.hospital.selfRegistrationEnabled &&
      isRecent(membership.createdAt, now)
    ) {
      relationships.push({ kind: "HOSPITAL_MEMBER", id: membership.id, hospitalId: membership.hospitalId });
    }
  }

  for (const relationship of user.osmHospitalRelationships) {
    if (
      relationship.status === MembershipStatus.PROVISIONED &&
      relationship.selfRegisteredAt === null &&
      hasOsmRole &&
      relationship.hospital.status === HospitalStatus.ACTIVE &&
      relationship.hospital.selfRegistrationEnabled &&
      isRecent(relationship.createdAt, now)
    ) {
      relationships.push({ kind: "OSM", id: relationship.id, hospitalId: relationship.hospitalId });
    }
  }

  const patientProfile = user.person.patientProfile;
  if (patientProfile && hasPatientRole) {
    for (const relationship of patientProfile.hospitalRelationships) {
      if (
        relationship.endedAt === null &&
        relationship.selfRegisteredAt === null &&
        relationship.hospital.status === HospitalStatus.ACTIVE &&
        relationship.hospital.selfRegistrationEnabled &&
        isRecent(relationship.createdAt, now)
      ) {
        relationships.push({ kind: "PATIENT", id: relationship.id, hospitalId: relationship.hospitalId });
      }
    }
  }

  return relationships.sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
  );
}

function isOwnerOrAdmin(user: SelfRegistrationUser): boolean {
  return user.roles.some(({ role }) => role === Role.ADMIN) ||
    user.memberships.some(({ membershipType, status }) =>
      membershipType === MembershipType.OWNER &&
      (status === MembershipStatus.ACTIVE || status === MembershipStatus.PROVISIONED),
    );
}

function readEligibility(
  user: SelfRegistrationUser | null,
  identityKeyHash: string | null,
  names: { givenName: string | null; familyName: string | null },
  now: Date,
  options: SelfRegistrationEligibilityOptions = {},
): SelfRegistrationEligibility {
  if (!user || !identityKeyHash || isOwnerOrAdmin(user)) return { outcome: "NOT_FOUND" };
  if (user.roles.length === 1 && user.roles[0]?.role === Role.CAREGIVER) {
    return { outcome: "NOT_FOUND" };
  }
  if (user.status === UserStatus.ACTIVE && user.authSubject !== null) {
    return { outcome: "ALREADY_ACTIVE" };
  }
  const authSubjectIsExpected = options.expectedAuthSubject !== undefined &&
    user.authSubject === options.expectedAuthSubject;
  if (
    user.status !== UserStatus.PROVISIONED ||
    (user.authSubject !== null && !authSubjectIsExpected) ||
    hasUnresolvedFirstCredentialOperation(user, options)
  ) {
    return { outcome: "NOT_FOUND" };
  }

  if (hasConflictingWorkforceRelationships(user.memberships, user.osmHospitalRelationships)) return { outcome: "NOT_FOUND" };

  const relationships = eligibleRelationships(user, now);
  if (relationships.length === 0) return { outcome: "NOT_FOUND" };
  return {
    outcome: "ELIGIBLE",
    userId: user.id,
    identityKeyHash,
    givenName: names.givenName,
    familyName: names.familyName,
    relationships,
  };
}

export async function evaluateSelfRegistrationByIdentityHash(
  transaction: Prisma.TransactionClient,
  identityKeyHash: string,
  now: Date,
): Promise<SelfRegistrationEligibility> {
  const person = await transaction.person.findUnique({
    where: { identityKeyHash },
    select: {
      identityKeyHash: true,
      givenName: true,
      familyName: true,
      user: { select: selfRegistrationUserSelect },
    },
  });
  return readEligibility(person?.user ?? null, person?.identityKeyHash ?? null, person ?? { givenName: null, familyName: null }, now);
}

export async function evaluateSelfRegistrationByUserId(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
  options: SelfRegistrationEligibilityOptions = {},
): Promise<SelfRegistrationEligibility> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: {
      ...selfRegistrationUserSelect,
      person: {
        select: {
          ...selfRegistrationUserSelect.person.select,
          identityKeyHash: true,
          givenName: true,
          familyName: true,
        },
      },
    },
  });
  return readEligibility(
    user,
    user?.person.identityKeyHash ?? null,
    { givenName: user?.person.givenName ?? null, familyName: user?.person.familyName ?? null },
    now,
    options,
  );
}

export function selfRegistrationRelationshipsMatch(
  current: readonly SelfRegistrationRelationship[],
  boundValue: unknown,
): boolean {
  const parsed = selfRegistrationRelationshipsSchema.safeParse(boundValue);
  if (!parsed.success || parsed.data.length !== current.length) return false;
  const currentKeys = new Set(current.map(({ kind, id, hospitalId }) => `${kind}:${id}:${hospitalId}`));
  const boundKeys = new Set(parsed.data.map(({ kind, id, hospitalId }) => `${kind}:${id}:${hospitalId}`));
  return boundKeys.size === parsed.data.length && currentKeys.size === current.length &&
    parsed.data.every(({ kind, id, hospitalId }) => currentKeys.has(`${kind}:${id}:${hospitalId}`));
}

export async function assertCurrentSelfRegistrationEligibility(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    relationships: unknown;
    now: Date;
    expectedAuthSubject?: string;
    ignoreActivation?: SelfRegistrationEligibilityOptions["ignoreActivation"];
  },
): Promise<Extract<SelfRegistrationEligibility, { outcome: "ELIGIBLE" }>> {
  const result = await evaluateSelfRegistrationByUserId(transaction, input.userId, input.now, {
    expectedAuthSubject: input.expectedAuthSubject,
    ignoreActivation: input.ignoreActivation,
  });
  if (result.outcome !== "ELIGIBLE" || !selfRegistrationRelationshipsMatch(result.relationships, input.relationships)) {
    throw new ConflictError("Self-registration eligibility changed");
  }
  return result;
}

export const selfRegistrationEligibilityInternals = {
  eligibleRelationships,
  hasUnresolvedFirstCredentialOperation,
  isRecent,
  readEligibility,
  selfRegistrationRelationshipsMatch,
};
