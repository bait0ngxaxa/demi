import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientAccessRequestResolution,
  PatientAccessRequestStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { isProviderSubject } from "@/modules/patient-activation/services/patient-activation-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  decidePatientAccessRequestPolicy,
  PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
} from "../policies/patient-access-request-policy";
import {
  patientAccessRequestIdSchema,
  patientAccessRequestReviewSchema,
  publicPatientAccessRequestSchema,
} from "../schemas/patient-access-request-schemas";

export type PatientAccessRequestDatabase = PrismaClient;

export type PatientAccessRequestDependencies = {
  database?: PatientAccessRequestDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PublicActiveHospital = {
  id: string;
  hospitalCode: string;
  name: string;
};

export type PatientIdentityReconciliation =
  | { kind: "NOT_PROVISIONED" }
  | {
      kind: "PROVISIONING_REQUIRED";
      displayName: string | null;
      personId: string | null;
    }
  | {
      kind: "READY_FOR_ACTIVATION";
      displayName: string;
      personId: string;
      userId: string;
      relationshipId: string;
    }
  | {
      kind: "ALREADY_ACTIVE";
      displayName: string;
      personId: string;
      userId: string;
      relationshipId: string;
    };

export type PatientAccessRequestListItem = {
  requestId: string;
  hospitalName: string;
  hospitalCode: string;
  status: PatientAccessRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  patientName: string | null;
  resolution: PatientAccessRequestResolution | null;
};

export type PatientAccessRequestDetail = {
  requestId: string;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  status: PatientAccessRequestStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  completedAt: Date | null;
  resolution: PatientAccessRequestResolution | null;
  patientName: string | null;
  reconciliation: PatientIdentityReconciliation | null;
};

function getDatabase(dependencies: PatientAccessRequestDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientAccessRequestDependencies): Date {
  const now = dependencies.now ? dependencies.now() : new Date();
  const copy = new Date(now.getTime());

  if (Number.isNaN(copy.getTime())) {
    throw new InfrastructureError("The request time could not be resolved");
  }

  return copy;
}

function normalizeDatabaseError(error: unknown): Error {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof InfrastructureError
  ) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new ConflictError("The Patient access request conflicts with a current request");
    }
  }

  return new InfrastructureError("Patient access requests could not be saved");
}

function getIdentityHash(nationalId: string): string {
  return hashIdentityReference({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: nationalId,
  });
}

function displayName(givenName: string | null, familyName: string | null): string | null {
  const name = [givenName, familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || null;
}

function assertReviewPolicy(
  actor: ActorContext | null | undefined,
  hospitalId: string,
): void {
  const decision = decidePatientAccessRequestPolicy({
    actor,
    capability: PATIENT_ACCESS_REQUEST_REVIEW_CAPABILITY,
    hospitalId,
  });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

async function assertPersistedHospitalReviewer(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  hospitalId: string,
): Promise<void> {
  const user = await transaction.user.findUnique({
    where: { id: actorUserId },
    select: { status: true, roles: { select: { role: true } } },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    !user.roles.some(({ role }) => role === Role.HOSPITAL) ||
    user.roles.some(({ role }) => role === Role.ADMIN)
  ) {
    throw new ForbiddenError();
  }

  const membership = await transaction.hospitalMembership.findFirst({
    where: {
      userId: actorUserId,
      hospitalId,
      membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ForbiddenError();
  }
}

async function reconcilePatientIdentity(
  transaction: Prisma.TransactionClient,
  identityKeyHash: string,
  hospitalId: string,
): Promise<PatientIdentityReconciliation> {
  const identity = await transaction.person.findUnique({
    where: { identityKeyHash },
    select: {
      id: true,
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
      patientProfile: {
        select: {
          hospitalRelationships: {
            where: { hospitalId },
            select: { id: true, hospital: { select: { status: true } } },
          },
        },
      },
    },
  });

  if (!identity) {
    return { kind: "NOT_PROVISIONED" };
  }

  const name = displayName(identity.givenName, identity.familyName);
  const user = identity.user;
  const patientProfile = identity.patientProfile;
  const relationship = patientProfile?.hospitalRelationships[0];
  const hasPatientRole = user?.roles.some(({ role }) => role === Role.PATIENT) ?? false;
  const hasExactActiveRelationship =
    relationship?.hospital.status === HospitalStatus.ACTIVE;

  if (
    user &&
    patientProfile &&
    hasPatientRole &&
    relationship &&
    hasExactActiveRelationship &&
    user.status === UserStatus.ACTIVE &&
    user.authSubject &&
    isProviderSubject(user.authSubject)
  ) {
    return {
      kind: "ALREADY_ACTIVE",
      displayName: name ?? "ไม่ระบุชื่อ",
      personId: identity.id,
      userId: user.id,
      relationshipId: relationship.id,
    };
  }

  if (
    user &&
    patientProfile &&
    hasPatientRole &&
    relationship &&
    hasExactActiveRelationship &&
    user.status === UserStatus.PROVISIONED &&
    user.authSubject === null
  ) {
    return {
      kind: "READY_FOR_ACTIVATION",
      displayName: name ?? "ไม่ระบุชื่อ",
      personId: identity.id,
      userId: user.id,
      relationshipId: relationship.id,
    };
  }

  return {
    kind: "PROVISIONING_REQUIRED",
    displayName: name,
    personId: identity.id,
  };
}

export async function listPublicActiveHospitals(
  dependencies: PatientAccessRequestDependencies = {},
): Promise<readonly PublicActiveHospital[]> {
  try {
    return await getDatabase(dependencies).hospital.findMany({
      where: { status: HospitalStatus.ACTIVE },
      select: { id: true, hospitalCode: true, name: true },
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }],
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function submitPublicPatientAccessRequest(
  input: unknown,
  dependencies: PatientAccessRequestDependencies = {},
): Promise<void> {
  const parsed = publicPatientAccessRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient access request input is invalid");
  }

  const identityKeyHash = getIdentityHash(parsed.data.nationalId);
  const database = getDatabase(dependencies);

  try {
    await runSerializableTransaction(
      database,
      async (transaction) => {
        const hospital = await transaction.hospital.findFirst({
          where: { id: parsed.data.hospitalId, status: HospitalStatus.ACTIVE },
          select: { id: true },
        });

        if (!hospital) {
          throw new ValidationError("The selected Hospital is not available");
        }

        await transaction.patientAccessRequest.create({
          data: { hospitalId: hospital.id, identityKeyHash },
          select: { id: true },
        });
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await database.patientAccessRequest.findFirst({
        where: {
          hospitalId: parsed.data.hospitalId,
          identityKeyHash,
          status: {
            in: [
              PatientAccessRequestStatus.PENDING,
              PatientAccessRequestStatus.APPROVED,
              PatientAccessRequestStatus.ACTIVATION_ISSUED,
            ],
          },
        },
        select: { id: true },
      });

      if (existing) {
        return;
      }
    }

    throw normalizeDatabaseError(error);
  }
}

export async function listHospitalPatientAccessRequests(
  actor: ActorContext | null | undefined,
  dependencies: PatientAccessRequestDependencies = {},
): Promise<readonly PatientAccessRequestListItem[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const database = getDatabase(dependencies);

  try {
    const user = await database.user.findUnique({
      where: { id: actor.userId },
      select: { status: true, roles: { select: { role: true } } },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.roles.some(({ role }) => role === Role.HOSPITAL) ||
      user.roles.some(({ role }) => role === Role.ADMIN)
    ) {
      throw new ForbiddenError();
    }

    const memberships = await database.hospitalMembership.findMany({
      where: {
        userId: actor.userId,
        membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
      select: { hospitalId: true },
    });
    const hospitalIds = memberships.map(({ hospitalId }) => hospitalId);

    if (hospitalIds.length === 0) {
      throw new ForbiddenError();
    }

    const requests = await database.patientAccessRequest.findMany({
      where: { hospitalId: { in: hospitalIds } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        resolution: true,
        hospital: { select: { name: true, hospitalCode: true } },
        resolvedPerson: {
          select: { givenName: true, familyName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((request) => ({
      requestId: request.id,
      hospitalName: request.hospital.name,
      hospitalCode: request.hospital.hospitalCode,
      status: request.status,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt,
      patientName:
        request.status === PatientAccessRequestStatus.PENDING || !request.resolvedPerson
          ? null
          : displayName(
              request.resolvedPerson.givenName,
              request.resolvedPerson.familyName,
            ),
      resolution: request.resolution,
    }));
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function getHospitalPatientAccessRequestDetail(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientAccessRequestDependencies = {},
): Promise<PatientAccessRequestDetail> {
  const parsed = patientAccessRequestIdSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient access request reference is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies);
    const request = await database.patientAccessRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: {
        id: true,
        hospitalId: true,
        identityKeyHash: true,
        status: true,
        reviewedAt: true,
        completedAt: true,
        resolution: true,
        createdAt: true,
        hospital: { select: { name: true, hospitalCode: true } },
        resolvedPerson: { select: { givenName: true, familyName: true } },
      },
    });

    if (!request) {
      throw new NotFoundError();
    }

    assertReviewPolicy(actor, request.hospitalId);

    let reconciliation: PatientIdentityReconciliation | null = null;
    let patientName =
      request.status === PatientAccessRequestStatus.PENDING || !request.resolvedPerson
        ? null
        : displayName(
            request.resolvedPerson.givenName,
            request.resolvedPerson.familyName,
          );

    if (
      request.status === PatientAccessRequestStatus.APPROVED ||
      request.status === PatientAccessRequestStatus.ACTIVATION_ISSUED
    ) {
      reconciliation = await database.$transaction(async (transaction) => {
        await assertPersistedHospitalReviewer(
          transaction,
          actor.userId,
          request.hospitalId,
        );
        return reconcilePatientIdentity(
          transaction,
          request.identityKeyHash,
          request.hospitalId,
        );
      });
      patientName =
        reconciliation.kind === "NOT_PROVISIONED"
          ? patientName
          : reconciliation.kind === "PROVISIONING_REQUIRED"
            ? reconciliation.displayName
          : reconciliation.displayName;
    } else {
      await database.$transaction((transaction) =>
        assertPersistedHospitalReviewer(transaction, actor.userId, request.hospitalId),
      );
    }

    return {
      requestId: request.id,
      hospitalId: request.hospitalId,
      hospitalName: request.hospital.name,
      hospitalCode: request.hospital.hospitalCode,
      status: request.status,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt,
      completedAt: request.completedAt,
      resolution: request.resolution,
      patientName,
      reconciliation,
    };
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function reviewPatientAccessRequest(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientAccessRequestDependencies = {},
): Promise<{
  status: PatientAccessRequestStatus;
  resolution: PatientAccessRequestResolution | null;
}> {
  const parsed = patientAccessRequestReviewSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient access request review input is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  const verifiedIdentityHash =
    parsed.data.decision === "APPROVE" && parsed.data.nationalId
      ? getIdentityHash(parsed.data.nationalId)
      : null;

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        const request = await transaction.patientAccessRequest.findUnique({
          where: { id: parsed.data.requestId },
          select: {
            id: true,
            hospitalId: true,
            identityKeyHash: true,
            status: true,
          },
        });

        if (!request) {
          throw new NotFoundError();
        }

        assertReviewPolicy(actor, request.hospitalId);
        await assertPersistedHospitalReviewer(transaction, actor.userId, request.hospitalId);

        if (request.status !== PatientAccessRequestStatus.PENDING) {
          throw new ConflictError("This Patient access request has already been reviewed");
        }

        const now = getNow(dependencies);

        if (parsed.data.decision === "REJECT") {
          const changed = await transaction.patientAccessRequest.updateMany({
            where: { id: request.id, status: PatientAccessRequestStatus.PENDING },
            data: {
              status: PatientAccessRequestStatus.REJECTED,
              reviewedByUserId: actor.userId,
              reviewedAt: now,
            },
          });

          if (changed.count !== 1) {
            throw new ConflictError("This Patient access request changed concurrently");
          }

          await recordAuditEvent(
            {
              actorUserId: actor.userId,
              action: "PATIENT_ACCESS_REQUEST_REJECTED",
              resourceType: "PatientAccessRequest",
              resourceId: request.id,
              metadata: { hospitalId: request.hospitalId, status: PatientAccessRequestStatus.REJECTED },
            },
            transaction,
          );

          return { status: PatientAccessRequestStatus.REJECTED, resolution: null };
        }

        if (!verifiedIdentityHash || verifiedIdentityHash !== request.identityKeyHash) {
          throw new ConflictError("The assisted identity verification did not match this request");
        }

        const reconciliation = await reconcilePatientIdentity(
          transaction,
          request.identityKeyHash,
          request.hospitalId,
        );
        const isAlreadyActive = reconciliation.kind === "ALREADY_ACTIVE";
        const nextStatus = isAlreadyActive
          ? PatientAccessRequestStatus.COMPLETED
          : PatientAccessRequestStatus.APPROVED;
        const resolution = isAlreadyActive
          ? PatientAccessRequestResolution.ALREADY_ACTIVE
          : null;
        const resolvedPersonId =
          reconciliation.kind === "NOT_PROVISIONED" ? null : reconciliation.personId;
        const resolvedUserId =
          reconciliation.kind === "READY_FOR_ACTIVATION" ||
          reconciliation.kind === "ALREADY_ACTIVE"
            ? reconciliation.userId
            : null;
        const resolvedRelationshipId =
          reconciliation.kind === "READY_FOR_ACTIVATION" ||
          reconciliation.kind === "ALREADY_ACTIVE"
            ? reconciliation.relationshipId
            : null;
        const changed = await transaction.patientAccessRequest.updateMany({
          where: { id: request.id, status: PatientAccessRequestStatus.PENDING },
          data: {
            status: nextStatus,
            resolution,
            reviewedByUserId: actor.userId,
            reviewedAt: now,
            resolvedPersonId,
            resolvedUserId,
            resolvedRelationshipId,
            completedAt: isAlreadyActive ? now : null,
          },
        });

        if (changed.count !== 1) {
          throw new ConflictError("This Patient access request changed concurrently");
        }

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "PATIENT_ACCESS_REQUEST_APPROVED",
            resourceType: "PatientAccessRequest",
            resourceId: request.id,
            metadata: {
              hospitalId: request.hospitalId,
              status: nextStatus,
              outcome: isAlreadyActive ? "ALREADY_ACTIVE" : "APPROVED",
            },
          },
          transaction,
        );

        if (isAlreadyActive) {
          await recordAuditEvent(
            {
              actorUserId: actor.userId,
              action: "PATIENT_ACCESS_REQUEST_COMPLETED",
              resourceType: "PatientAccessRequest",
              resourceId: request.id,
              metadata: {
                hospitalId: request.hospitalId,
                resolution: PatientAccessRequestResolution.ALREADY_ACTIVE,
              },
            },
            transaction,
          );
        }

        return { status: nextStatus, resolution };
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function withdrawPatientAccessRequestByHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientAccessRequestDependencies = {},
): Promise<void> {
  const parsed = patientAccessRequestIdSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient access request reference is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        const request = await transaction.patientAccessRequest.findUnique({
          where: { id: parsed.data.requestId },
          select: { id: true, hospitalId: true, status: true },
        });

        if (!request) {
          throw new NotFoundError();
        }

        assertReviewPolicy(actor, request.hospitalId);
        await assertPersistedHospitalReviewer(transaction, actor.userId, request.hospitalId);

        if (
          request.status !== PatientAccessRequestStatus.PENDING &&
          request.status !== PatientAccessRequestStatus.APPROVED
        ) {
          throw new ConflictError("This Patient access request can no longer be withdrawn");
        }

        const changed = await transaction.patientAccessRequest.updateMany({
          where: { id: request.id, status: request.status },
          data: {
            status: PatientAccessRequestStatus.WITHDRAWN,
            reviewedByUserId: actor.userId,
            reviewedAt: getNow(dependencies),
          },
        });

        if (changed.count !== 1) {
          throw new ConflictError("This Patient access request changed concurrently");
        }

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: "PATIENT_ACCESS_REQUEST_WITHDRAWN",
            resourceType: "PatientAccessRequest",
            resourceId: request.id,
            metadata: { hospitalId: request.hospitalId, status: PatientAccessRequestStatus.WITHDRAWN },
          },
          transaction,
        );
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientAccessRequestInternals = {
  assertReviewPolicy,
  assertPersistedHospitalReviewer,
  getIdentityHash,
  normalizeDatabaseError,
  reconcilePatientIdentity,
};
