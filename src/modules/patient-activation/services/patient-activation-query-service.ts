import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  hashIdentityReference,
} from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  assertPatientActivationActorInDatabase,
  assertPatientActivationActorIdentityInDatabase,
  isProviderSubject,
} from "./patient-activation-service";
import {
  decidePatientActivationIssuePolicy,
  PATIENT_ACTIVATION_ISSUE_CAPABILITY,
  hasPatientActivationHospitalScope,
} from "../policies/patient-activation-policy";
import {
  patientActivationLookupSchema,
  type PatientActivationLookupInput,
} from "../schemas/patient-activation-schemas";

export type PatientActivationQueryDatabase =
  | PrismaClient
  | Prisma.TransactionClient;

export type PatientActivationScope = {
  hospitalId: string;
  hospitalCode: string;
  hospitalName: string;
};

export type PatientActivationStatus =
  | "NOT_ISSUED"
  | "ISSUED"
  | "IN_PROGRESS"
  | "EXPIRED"
  | "ACTIVE"
  | "RECONCILIATION_REQUIRED";

export const PATIENT_ACTIVATION_LOOKUP_LIMIT = 25;

export type PatientActivationCandidate = {
  userId: string;
  patientProfileId: string;
  hospitalId: string;
  displayName: string;
  hospitalNumber: string | null;
  accountStatus: UserStatus;
  activationStatus: PatientActivationStatus;
  activationExpiresAt: Date | null;
  activationMayBeIssued: boolean;
};

type CandidateActivation = {
  expiresAt: Date;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  reconciliationRequiredAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
};

type CandidateUser = {
  id: string;
  status: UserStatus;
  authSubject: string | null;
  roles: { role: Role }[];
  person: {
    givenName: string | null;
    familyName: string | null;
  };
};

function getDatabase(
  database?: PatientActivationQueryDatabase,
): PatientActivationQueryDatabase {
  return database ?? getPrisma();
}

function getNow(now?: () => Date): Date {
  return now ? new Date(now().getTime()) : new Date();
}

function assertLookupPolicy(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
): void {
  const decision = decidePatientActivationIssuePolicy({
    actor,
    capability: PATIENT_ACTIVATION_ISSUE_CAPABILITY,
    targetHospitalId,
  });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

function projectActivationStatus(
  user: Pick<CandidateUser, "status" | "authSubject" | "roles">,
  activations: readonly CandidateActivation[],
  now: Date,
): {
  activationStatus: PatientActivationStatus;
  activationExpiresAt: Date | null;
  activationMayBeIssued: boolean;
} {
  const validMappedAuth =
    user.status === UserStatus.ACTIVE &&
    user.authSubject !== null &&
    isProviderSubject(user.authSubject);

  if (validMappedAuth) {
    return {
      activationStatus: "ACTIVE",
      activationExpiresAt: null,
      activationMayBeIssued: false,
    };
  }

  if (
    user.status !== UserStatus.PROVISIONED ||
    user.authSubject !== null ||
    !user.roles.some(({ role }) => role === Role.PATIENT)
  ) {
    return {
      activationStatus: "RECONCILIATION_REQUIRED",
      activationExpiresAt: null,
      activationMayBeIssued: false,
    };
  }

  const unresolved = activations.find(
    (activation) =>
      activation.reconciliationRequiredAt !== null &&
      activation.usedAt === null &&
      activation.revokedAt === null,
  );

  if (unresolved) {
    return {
      activationStatus: "RECONCILIATION_REQUIRED",
      activationExpiresAt: unresolved.expiresAt,
      activationMayBeIssued: false,
    };
  }

  const current = activations.find(
    (activation) =>
      activation.usedAt === null &&
      activation.revokedAt === null &&
      activation.expiresAt > now,
  );

  if (current) {
    const inProgress =
      current.claimedAt !== null &&
      current.claimExpiresAt !== null &&
      current.claimExpiresAt > now;

    return {
      activationStatus: inProgress ? "IN_PROGRESS" : "ISSUED",
      activationExpiresAt: current.expiresAt,
      activationMayBeIssued: !inProgress,
    };
  }

  const latest = activations[0];

  return {
    activationStatus:
      latest && latest.expiresAt <= now ? "EXPIRED" : "NOT_ISSUED",
    activationExpiresAt: latest?.expiresAt ?? null,
    activationMayBeIssued: true,
  };
}

function toDisplayName(user: CandidateUser): string {
  return [user.person.givenName, user.person.familyName]
    .filter((value): value is string => Boolean(value))
    .join(" ") || "ผู้ป่วย";
}

function buildNameWhere(value: string): Prisma.PersonWhereInput {
  const terms = value.split(/\s+/u).filter(Boolean);

  return {
    AND: terms.map((term) => ({
      OR: [
        { givenName: { contains: term, mode: "insensitive" } },
        { familyName: { contains: term, mode: "insensitive" } },
      ],
    })),
  };
}

export async function listPatientActivationScopes(
  actor: ActorContext | null | undefined,
  database?: PatientActivationQueryDatabase,
): Promise<PatientActivationScope[]> {
  if (!actor || !actor.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }

  const db = getDatabase(database);

  try {
    await assertPatientActivationActorIdentityInDatabase(db, actor.userId);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient activation actor could not be verified");
  }

  try {
    const scopes = await db.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        memberships: {
          some: {
            userId: actor.userId,
            membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true, hospitalCode: true, name: true },
      orderBy: { name: "asc" },
    });

    return scopes.map((scope) => ({
      hospitalId: scope.id,
      hospitalCode: scope.hospitalCode,
      hospitalName: scope.name,
    }));
  } catch {
    throw new InfrastructureError("Patient activation Hospitals could not be loaded");
  }
}

export async function findPatientActivationCandidates(
  actor: ActorContext | null | undefined,
  input: PatientActivationLookupInput,
  dependencies: {
    database?: PatientActivationQueryDatabase;
    now?: () => Date;
  } = {},
): Promise<PatientActivationCandidate[]> {
  const parsed = patientActivationLookupSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient activation lookup data is invalid");
  }

  assertLookupPolicy(actor, parsed.data.targetHospitalId);

  if (!actor) {
    throw new ForbiddenError();
  }

  const db = getDatabase(dependencies.database);
  try {
    await assertPatientActivationActorInDatabase(
      db,
      actor.userId,
      parsed.data.targetHospitalId,
    );
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient activation actor could not be verified");
  }

  if (!hasPatientActivationHospitalScope(actor, parsed.data.targetHospitalId)) {
    throw new ForbiddenError();
  }

  const lookupValue = parsed.data.value;
  const relationshipWhere: Prisma.PatientHospitalRelationshipWhereInput =
    parsed.data.lookupType === "NATIONAL_ID"
      ? {
          hospitalId: parsed.data.targetHospitalId,
          patientProfile: {
            person: {
              identityKeyHash: hashIdentityReference({
                namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
                value: lookupValue,
              }),
            },
          },
        }
      : parsed.data.lookupType === "NAME"
        ? {
            hospitalId: parsed.data.targetHospitalId,
            patientProfile: { person: buildNameWhere(lookupValue) },
          }
        : {
            hospitalId: parsed.data.targetHospitalId,
            hospitalNumber: lookupValue,
          };

  try {
    const relationships = await db.patientHospitalRelationship.findMany({
      where: relationshipWhere,
      take: PATIENT_ACTIVATION_LOOKUP_LIMIT + 1,
      select: {
        hospitalNumber: true,
        patientProfile: {
          select: {
            id: true,
            person: {
              select: {
                givenName: true,
                familyName: true,
                user: {
                  select: {
                    id: true,
                    status: true,
                    authSubject: true,
                    roles: { select: { role: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    if (relationships.length > PATIENT_ACTIVATION_LOOKUP_LIMIT) {
      throw new ConflictError("Patient activation lookup returned too many matches");
    }

    const candidates = relationships.flatMap((relationship) => {
      const user = relationship.patientProfile.person.user;

      if (!user || !user.roles.some(({ role }) => role === Role.PATIENT)) {
        return [];
      }

      return [
        {
          relationship,
          user,
        },
      ];
    });

    if (candidates.length === 0) {
      return [];
    }

    const userIds = candidates.map(({ user }) => user.id);
    const activations = await db.patientActivation.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        userId: true,
        expiresAt: true,
        claimedAt: true,
        claimExpiresAt: true,
        reconciliationRequiredAt: true,
        usedAt: true,
        revokedAt: true,
      },
    });
    const activationsByUser = new Map<string, CandidateActivation[]>();

    for (const activation of activations) {
      const current = activationsByUser.get(activation.userId) ?? [];
      current.push(activation);
      activationsByUser.set(activation.userId, current);
    }

    const now = getNow(dependencies.now);

    return candidates.map(({ relationship, user }) => {
      const projection = projectActivationStatus(
        user,
        activationsByUser.get(user.id) ?? [],
        now,
      );

      return {
        userId: user.id,
        patientProfileId: relationship.patientProfile.id,
        hospitalId: parsed.data.targetHospitalId,
        displayName: toDisplayName({
          id: user.id,
          status: user.status,
          authSubject: user.authSubject,
          roles: user.roles,
          person: relationship.patientProfile.person,
        }),
        hospitalNumber: relationship.hospitalNumber,
        accountStatus: user.status,
        ...projection,
      };
    });
  } catch (error: unknown) {
    if (
      error instanceof ConflictError ||
      error instanceof ValidationError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }

    throw new InfrastructureError("Patient activation candidates could not be loaded");
  }
}

export const patientActivationQueryInternals = {
  buildNameWhere,
  projectActivationStatus,
};
