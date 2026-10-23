import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientServiceCode,
  PatientServiceRequestStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { assignOsmToPatientInTransaction } from "@/modules/patient-assignment/services/patient-osm-assignment-transaction";
import { getAppointmentLineNotificationRollout } from "@/modules/appointments/domain/appointment-line-notifications";
import { createPatientOsmAssignmentLineNotificationIntent } from "@/modules/appointments/services/appointment-line-notification-outbox-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  PATIENT_SERVICE_REQUEST_CAPABILITIES,
  decidePatientServiceRequestPolicy,
} from "../policies/patient-service-request-policy";
import {
  hospitalServiceRequestListSchema,
  hospitalServiceRequestReviewInputSchema,
  hospitalServiceRequestReviewSchema,
  patientServiceRequestCreateSchema,
  patientServiceRequestIdSchema,
  type HospitalServiceRequestListInput,
} from "../schemas/patient-service-request-schemas";

export type PatientServiceRequestDatabase = PrismaClient;

export type PatientServiceRequestDependencies = {
  database?: PatientServiceRequestDatabase;
  now?: () => Date;
  transactionRetries?: number;
};

export type PatientServiceRequestStatusView = {
  requestId: string;
  serviceCode: PatientServiceCode;
  status: PatientServiceRequestStatus;
  preferredOsmName: string | null;
  createdAt: Date;
};

export type PatientServiceRelationshipView = {
  relationshipId: string;
  hospitalName: string;
  hospitalActive: boolean;
  /** Phase F: care with this Hospital ended; request history only, no new requests. */
  careEnded: boolean;
  offerings: readonly { offeringId: string; code: PatientServiceCode }[];
  osmChoices: readonly { relationshipId: string; displayName: string }[];
  requests: readonly PatientServiceRequestStatusView[];
};

export type HospitalPatientServiceRequestView = {
  requestId: string;
  appointmentId: string | null;
  relationshipId: string;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  patientName: string;
  serviceCode: PatientServiceCode;
  status: PatientServiceRequestStatus;
  preferredOsmUserId: string | null;
  preferredOsmName: string | null;
  currentOsmUserId: string | null;
  currentOsmName: string | null;
  osmChoices: readonly { userId: string; displayName: string }[];
  createdAt: Date;
};

export type HospitalPatientServiceRequestPage = {
  requests: readonly HospitalPatientServiceRequestView[];
  group: HospitalServiceRequestListInput["group"];
  after: HospitalServiceRequestListInput["after"];
  nextCursor: HospitalServiceRequestListInput["after"] | null;
};

const HOSPITAL_REQUEST_PAGE_SIZE = 20;

function getDatabase(dependencies: PatientServiceRequestDependencies): PrismaClient {
  return dependencies.database ?? getPrisma();
}

function getNow(dependencies: PatientServiceRequestDependencies): Date {
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
      return new ConflictError("The Patient service request conflicts with a current request");
    }
  }

  return new InfrastructureError("Patient service requests could not be saved");
}

function assertPolicy(
  actor: ActorContext | null | undefined,
  capability: (typeof PATIENT_SERVICE_REQUEST_CAPABILITIES)[keyof typeof PATIENT_SERVICE_REQUEST_CAPABILITIES],
  hospitalId?: string,
): void {
  const decision = decidePatientServiceRequestPolicy({ actor, capability, hospitalId });

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}

async function assertPersistedPatient(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
): Promise<{ personId: string }> {
  const user = await transaction.user.findUnique({
    where: { id: actor.userId },
    select: {
      personId: true,
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    user.personId !== actor.personId ||
    !user.roles.some(({ role }) => role === Role.PATIENT)
  ) {
    throw new ForbiddenError();
  }

  const profile = await transaction.patientProfile.findUnique({
    where: { personId: user.personId },
    select: { id: true },
  });

  if (!profile) {
    throw new ForbiddenError();
  }

  return { personId: user.personId };
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
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
      hospital: { status: HospitalStatus.ACTIVE },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ForbiddenError();
  }
}

function fullName(givenName: string | null, familyName: string | null): string {
  const name = [givenName, familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return name || "ไม่ระบุชื่อ";
}

function getPatientRelationshipsSelect(requestedByUserId: string) {
  return {
    id: true,
    hospitalId: true,
    endedAt: true,
    hospital: {
      select: {
        id: true,
        name: true,
        status: true,
        serviceOfferings: {
          where: { enabled: true },
          select: { id: true, code: true },
          orderBy: { code: "asc" },
        },
        osmHospitalRelationships: {
          where: {
            status: MembershipStatus.ACTIVE,
            user: {
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.OSM } },
            },
          },
          select: {
            id: true,
            user: {
              select: {
                id: true,
                person: { select: { givenName: true, familyName: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    },
    serviceRequests: {
      where: { requestedByUserId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        offering: { select: { code: true } },
        preferredOsm: {
          select: { person: { select: { givenName: true, familyName: true } } },
        },
      },
    },
  } satisfies Prisma.PatientHospitalRelationshipSelect;
}

export async function listOwnPatientServiceRequests(
  actor: ActorContext | null | undefined,
  dependencies: PatientServiceRequestDependencies = {},
): Promise<readonly PatientServiceRelationshipView[]> {
  assertPolicy(actor, PATIENT_SERVICE_REQUEST_CAPABILITIES.readSelf);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies);
    const user = await database.user.findUnique({
      where: { id: actor.userId },
      select: {
        personId: true,
        status: true,
        roles: { select: { role: true } },
      },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.personId !== actor.personId ||
      !user.roles.some(({ role }) => role === Role.PATIENT)
    ) {
      throw new ForbiddenError();
    }

    const relationships = await database.patientHospitalRelationship.findMany({
      where: { patientProfile: { personId: user.personId } },
      select: getPatientRelationshipsSelect(actor.userId),
      orderBy: { hospital: { name: "asc" } },
    });

    return relationships.map((relationship) => {
      const hospitalActive = relationship.hospital.status === HospitalStatus.ACTIVE;
      const careEnded = relationship.endedAt !== null;
      const acceptsRequests = hospitalActive && !careEnded;
      const osmChoices = acceptsRequests
        ? relationship.hospital.osmHospitalRelationships.map(({ id, user: osm }) => ({
            relationshipId: id,
            displayName: fullName(osm.person.givenName, osm.person.familyName),
          }))
        : [];

      return {
        relationshipId: relationship.id,
        hospitalName: relationship.hospital.name,
        hospitalActive,
        careEnded,
        offerings: acceptsRequests
          ? relationship.hospital.serviceOfferings.map(({ id, code }) => ({
              offeringId: id,
              code,
            }))
          : [],
        osmChoices,
        requests: relationship.serviceRequests.map((request) => ({
          requestId: request.id,
          serviceCode: request.offering.code,
          status: request.status,
          preferredOsmName: request.preferredOsm
            ? fullName(
                request.preferredOsm.person.givenName,
                request.preferredOsm.person.familyName,
              )
            : null,
          createdAt: request.createdAt,
        })),
      };
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function createPatientServiceRequest(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientServiceRequestDependencies = {},
): Promise<{ requestId: string; status: PatientServiceRequestStatus }> {
  const parsed = patientServiceRequestCreateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient service request input is invalid");
  }

  assertPolicy(actor, PATIENT_SERVICE_REQUEST_CAPABILITIES.create);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        const patient = await assertPersistedPatient(transaction, actor);
        const relationship = await transaction.patientHospitalRelationship.findFirst({
          where: {
            id: parsed.data.relationshipId,
            ...activePatientHospitalRelationshipWhere,
            patientProfile: { personId: patient.personId },
          },
          select: {
            id: true,
            hospitalId: true,
            hospital: { select: { status: true } },
          },
        });

        if (!relationship || relationship.hospital.status !== HospitalStatus.ACTIVE) {
          throw new NotFoundError();
        }

        const offering = await transaction.hospitalServiceOffering.findUnique({
          where: { id: parsed.data.offeringId },
          select: { id: true, hospitalId: true, code: true, enabled: true },
        });

        if (
          !offering ||
          offering.hospitalId !== relationship.hospitalId ||
          !offering.enabled
        ) {
          throw new ValidationError("The requested service is not currently available");
        }

        const preferredOsmRelationshipId = parsed.data.preferredOsmRelationshipId ?? null;
        let preferredOsmUserId: string | null = null;

        if (preferredOsmRelationshipId) {
          const osmRelationship = await transaction.osmHospitalRelationship.findFirst({
            where: {
              id: preferredOsmRelationshipId,
              hospitalId: relationship.hospitalId,
              status: MembershipStatus.ACTIVE,
              hospital: { status: HospitalStatus.ACTIVE },
              user: {
                status: UserStatus.ACTIVE,
                roles: { some: { role: Role.OSM } },
              },
            },
            select: { userId: true },
          });

          if (!osmRelationship) {
            throw new ValidationError("The preferred OSM is not available for this Hospital");
          }

          preferredOsmUserId = osmRelationship.userId;
        }

        const request = await transaction.patientServiceRequest.create({
          data: {
            patientHospitalRelationshipId: relationship.id,
            hospitalId: relationship.hospitalId,
            offeringId: offering.id,
            requestedByUserId: actor.userId,
            preferredOsmUserId,
          },
          select: { id: true, status: true },
        });

        return { requestId: request.id, status: request.status };
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function withdrawOwnPatientServiceRequest(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientServiceRequestDependencies = {},
): Promise<void> {
  const parsed = patientServiceRequestIdSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient service request reference is invalid");
  }

  assertPolicy(actor, PATIENT_SERVICE_REQUEST_CAPABILITIES.withdrawSelf);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        const patient = await assertPersistedPatient(transaction, actor);
        const request = await transaction.patientServiceRequest.findFirst({
          where: {
            id: parsed.data.requestId,
            requestedByUserId: actor.userId,
            relationship: { ...activePatientHospitalRelationshipWhere, patientProfile: { personId: patient.personId } },
          },
          select: { id: true, status: true },
        });

        if (!request) {
          throw new NotFoundError();
        }

        if (
          request.status !== PatientServiceRequestStatus.PENDING &&
          request.status !== PatientServiceRequestStatus.APPROVED
        ) {
          throw new ConflictError("This Patient service request can no longer be withdrawn");
        }

        const now = getNow(dependencies);
        const withdrawn = await transaction.patientServiceRequest.updateMany({
          where: {
            id: request.id,
            requestedByUserId: actor.userId,
            status: request.status,
          },
          data: {
            status: PatientServiceRequestStatus.WITHDRAWN,
            withdrawnByUserId: actor.userId,
            withdrawnAt: now,
          },
        });

        if (withdrawn.count !== 1) {
          throw new ConflictError("This Patient service request changed concurrently");
        }
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function reviewPatientServiceRequest(
  actor: ActorContext | null | undefined,
  input: unknown,
  decision: "APPROVE" | "REJECT",
  dependencies: PatientServiceRequestDependencies = {},
): Promise<PatientServiceRequestStatus> {
  const reviewInput = hospitalServiceRequestReviewInputSchema.safeParse(input);
  const parsed = reviewInput.success
    ? hospitalServiceRequestReviewSchema.safeParse({ ...reviewInput.data, decision })
    : reviewInput;

  if (!parsed.success) {
    throw new ValidationError("Patient service request reference is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction) => {
        const request = await transaction.patientServiceRequest.findUnique({
          where: { id: parsed.data.requestId, relationship: { is: activePatientHospitalRelationshipWhere } },
          select: {
            id: true,
            hospitalId: true,
            patientHospitalRelationshipId: true,
            preferredOsmUserId: true,
            status: true,
            offering: { select: { code: true } },
            relationship: {
              select: {
                osmAssignments: {
                  where: { endedAt: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { id: true, osmUserId: true },
                },
              },
            },
          },
        });

        if (!request) {
          throw new NotFoundError();
        }

        assertPolicy(actor, PATIENT_SERVICE_REQUEST_CAPABILITIES.review, request.hospitalId);
        await assertPersistedHospitalReviewer(transaction, actor.userId, request.hospitalId);

        const expectedStatus = PatientServiceRequestStatus.PENDING;
        const nextStatus = parsed.data.decision === "APPROVE"
          ? PatientServiceRequestStatus.APPROVED
          : PatientServiceRequestStatus.REJECTED;

        if (request.status !== expectedStatus) {
          throw new ConflictError("This Patient service request is not in a reviewable state");
        }

        const selectedOsmUserId = parsed.data.osmUserId ?? null;
        const currentAssignment = request.relationship.osmAssignments[0] ?? null;
        if (
          parsed.data.decision === "APPROVE" &&
          currentAssignment &&
          currentAssignment.osmUserId !== selectedOsmUserId &&
          parsed.data.confirmReassignment !== true
        ) {
          throw new ConflictError("Confirm the OSM change before approving this request");
        }

        const now = getNow(dependencies);
        const changed = await transaction.patientServiceRequest.updateMany({
          where: { id: request.id, status: expectedStatus },
          data: { status: nextStatus, reviewedByUserId: actor.userId, reviewedAt: now },
        });

        if (changed.count !== 1) {
          throw new ConflictError("This Patient service request changed concurrently");
        }

        if (parsed.data.decision === "APPROVE" && selectedOsmUserId) {
          const assignment = await assignOsmToPatientInTransaction(
            transaction,
            actor,
            { patientHospitalRelationshipId: request.patientHospitalRelationshipId, osmUserId: selectedOsmUserId },
            now,
          );
          if (assignment.operation !== "NOOP" && assignment.assignmentId) {
            await createPatientOsmAssignmentLineNotificationIntent(transaction, {
              assignmentId: assignment.assignmentId,
              patientHospitalRelationshipId: request.patientHospitalRelationshipId,
              osmUserId: selectedOsmUserId,
              sourceUpdatedAt: now,
            }, getAppointmentLineNotificationRollout(), now);
          }
        }

        await recordAuditEvent(
          {
            actorUserId: actor.userId,
            action: parsed.data.decision === "APPROVE"
              ? "PATIENT_SERVICE_REQUEST_APPROVED"
              : "PATIENT_SERVICE_REQUEST_REJECTED",
            resourceType: "PatientServiceRequest",
            resourceId: request.id,
            metadata: {
              hospitalId: request.hospitalId,
              serviceCode: request.offering.code,
              status: nextStatus,
              ...(parsed.data.decision === "APPROVE" ? { osmAssigned: true } : {}),
            },
          },
          transaction,
        );

        return nextStatus;
      },
      dependencies.transactionRetries,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export async function listHospitalPatientServiceRequests(
  actor: ActorContext | null | undefined,
  dependencies: PatientServiceRequestDependencies = {},
  input: unknown = {},
): Promise<HospitalPatientServiceRequestPage> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const parsed = hospitalServiceRequestListSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Hospital request list parameters are invalid");
  }
  const { group, after } = parsed.data;

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
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
      select: { hospitalId: true },
    });
    const hospitalIds = memberships.map(({ hospitalId }) => hospitalId);

    if (hospitalIds.length === 0) {
      throw new ForbiddenError();
    }

    const requests = await database.patientServiceRequest.findMany({
      where: {
        hospitalId: { in: hospitalIds },
        relationship: { is: activePatientHospitalRelationshipWhere },
        status: group === "HISTORY"
          ? { in: [PatientServiceRequestStatus.STARTED, PatientServiceRequestStatus.REJECTED, PatientServiceRequestStatus.WITHDRAWN] }
          : group,
        ...(after ? { OR: [
          { createdAt: { lt: new Date(after.createdAt) } },
          { createdAt: new Date(after.createdAt), id: { lt: after.requestId } },
        ] } : {}),
      },
      select: {
        id: true,
        hospitalId: true,
        preferredOsmUserId: true,
        status: true,
        createdAt: true,
        offering: { select: { code: true } },
        appointments: { select: { id: true } },
        relationship: {
          select: {
            id: true,
            osmAssignments: {
              where: { endedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                osmUserId: true,
                osmUser: { select: { person: { select: { givenName: true, familyName: true } } } },
              },
            },
            patientProfile: {
              select: {
                person: { select: { givenName: true, familyName: true } },
              },
            },
            hospital: {
              select: {
                hospitalCode: true,
                name: true,
                osmHospitalRelationships: {
                  where: {
                    status: MembershipStatus.ACTIVE,
                    user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.OSM } } },
                  },
                  orderBy: { user: { person: { givenName: "asc" } } },
                  select: {
                    userId: true,
                    user: { select: { person: { select: { givenName: true, familyName: true } } } },
                  },
                },
              },
            },
          },
        },
        preferredOsm: {
          select: { person: { select: { givenName: true, familyName: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HOSPITAL_REQUEST_PAGE_SIZE + 1,
    });

    const visible = requests.slice(0, HOSPITAL_REQUEST_PAGE_SIZE);
    const last = visible.at(-1);
    return {
      group,
      after,
      nextCursor: requests.length > HOSPITAL_REQUEST_PAGE_SIZE && last
        ? { createdAt: last.createdAt.toISOString(), requestId: last.id }
        : null,
      requests: visible.map((request) => ({
        requestId: request.id,
        appointmentId: request.appointments[0]?.id ?? null,
        relationshipId: request.relationship.id,
        hospitalId: request.hospitalId,
        hospitalName: request.relationship.hospital.name,
        hospitalCode: request.relationship.hospital.hospitalCode,
        patientName: fullName(
          request.relationship.patientProfile.person.givenName,
          request.relationship.patientProfile.person.familyName,
        ),
        serviceCode: request.offering.code,
        status: request.status,
        preferredOsmName: request.preferredOsm
          ? fullName(
              request.preferredOsm.person.givenName,
              request.preferredOsm.person.familyName,
            )
          : null,
        preferredOsmUserId: request.preferredOsmUserId,
        currentOsmUserId: request.relationship.osmAssignments[0]?.osmUserId ?? null,
        currentOsmName: request.relationship.osmAssignments[0]
          ? fullName(
              request.relationship.osmAssignments[0].osmUser.person.givenName,
              request.relationship.osmAssignments[0].osmUser.person.familyName,
            )
          : null,
        osmChoices: request.relationship.hospital.osmHospitalRelationships.map((osm) => ({
          userId: osm.userId,
          displayName: fullName(osm.user.person.givenName, osm.user.person.familyName),
        })),
        createdAt: request.createdAt,
      })),
    };
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

export const patientServiceRequestInternals = {
  assertPersistedPatient,
  assertPersistedHospitalReviewer,
  normalizeDatabaseError,
  fullName,
};
