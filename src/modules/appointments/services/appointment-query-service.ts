import "server-only";

import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  Prisma,
  Profession,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import {
  APPOINTMENT_HISTORY_LIMIT,
  type AppointmentLocationValue,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
} from "../domain/appointment-definitions";
import {
  APPOINTMENT_CREATE_CAPABILITY,
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
} from "../policies/appointment-policy";
import { appointmentIdSchema, appointmentRelationshipIdSchema } from "../schemas/appointment-schemas";
import {
  resolveAppointmentAccessContext,
  type AppointmentAccessDatabase,
  type AppointmentPatientSummary,
} from "./appointment-access-service";

export type AppointmentQueryDatabase = PrismaClient | Prisma.TransactionClient;

export type AppointmentQueryDependencies = {
  database?: AppointmentQueryDatabase;
};

export type ResponsibleHospitalMember = {
  userId: string;
  displayName: string;
  profession: Profession | null;
};

export type AppointmentAcknowledgementSummary = {
  source: AppointmentInteractionSource;
  acknowledgedAt: Date;
  recordedByDisplayName: string | null;
};

export type AppointmentCancellationRequestSummary = {
  requestId: string;
  source: AppointmentInteractionSource;
  status: AppointmentCancellationRequestStatus;
  submittedAt: Date;
  resolvedAt: Date | null;
  submittedByDisplayName: string | null;
  resolvedByDisplayName: string | null;
};

export type AppointmentCoordinationSummary = {
  recordedAt: Date;
  recordedByDisplayName: string | null;
};

export type AppointmentHistoryItem = {
  appointmentId: string;
  scheduledAt: Date;
  type: AppointmentTypeValue;
  status: AppointmentStatusValue;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  currentAcknowledgement: AppointmentAcknowledgementSummary | null;
  cancellationRequests: AppointmentCancellationRequestSummary[];
  coordinationEvents: AppointmentCoordinationSummary[];
};

export type AppointmentHistory = {
  patient: AppointmentPatientSummary;
  items: AppointmentHistoryItem[];
  canManage: boolean;
  canCreate: boolean;
};

export type AppointmentDetail = {
  patient: AppointmentPatientSummary;
  canManage: boolean;
  canProxyPatientActions: boolean;
  canRecordCoordination: boolean;
  appointmentId: string;
  responsibleUserId: string | null;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  currentAcknowledgement: AppointmentAcknowledgementSummary | null;
  cancellationRequests: AppointmentCancellationRequestSummary[];
  coordinationEvents: AppointmentCoordinationSummary[];
  createdByDisplayName: string;
  type: AppointmentTypeValue;
  scheduledAt: Date;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  locationDetail: string | null;
  note: string | null;
  status: AppointmentStatusValue;
  createdAt: Date;
  updatedAt: Date;
};

export type AppointmentCreateContext = {
  patient: AppointmentPatientSummary;
  responsibleMembers: ResponsibleHospitalMember[];
};

export type AppointmentRescheduleContext = AppointmentCreateContext & {
  appointment: AppointmentDetail;
};

function responsibleUserSelect(hospitalId: string) {
  return {
    person: {
      select: {
        givenName: true,
        familyName: true,
      },
    },
    memberships: {
      where: { hospitalId },
      select: { profession: true },
    },
  } satisfies Prisma.UserSelect;
}

function appointmentHistorySelect(hospitalId: string) {
  return {
  id: true,
  updatedAt: true,
  scheduledAt: true,
  type: true,
  status: true,
  durationMinutes: true,
  locationType: true,
  responsibleUser: { select: responsibleUserSelect(hospitalId) },
  osmAssignmentAtCreation: {
    select: {
      osmUser: {
        select: {
          person: { select: { givenName: true, familyName: true } },
        },
      },
    },
  },
  acknowledgements: {
    orderBy: [{ sourceAppointmentUpdatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      sourceAppointmentUpdatedAt: true,
      source: true,
      acknowledgedAt: true,
      recordedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  cancellationRequests: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      source: true,
      status: true,
      submittedAt: true,
      resolvedAt: true,
      submittedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
      resolvedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  coordinationEvents: {
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      recordedAt: true,
      recordedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  } satisfies Prisma.PatientAppointmentSelect;
}

function appointmentDetailSelect(hospitalId: string) {
  return {
  id: true,
  responsibleUserId: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  locationDetail: true,
  note: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  responsibleUser: { select: responsibleUserSelect(hospitalId) },
  createdByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
  osmAssignmentAtCreation: {
    select: {
      osmUser: {
        select: {
          person: { select: { givenName: true, familyName: true } },
        },
      },
    },
  },
  acknowledgements: {
    orderBy: [{ sourceAppointmentUpdatedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      sourceAppointmentUpdatedAt: true,
      source: true,
      acknowledgedAt: true,
      recordedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  cancellationRequests: {
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      source: true,
      status: true,
      submittedAt: true,
      resolvedAt: true,
      submittedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
      resolvedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  coordinationEvents: {
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      recordedAt: true,
      recordedByUser: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  } satisfies Prisma.PatientAppointmentSelect;
}

type AppointmentHistoryRecord = Prisma.PatientAppointmentGetPayload<{
  select: ReturnType<typeof appointmentHistorySelect>;
}>;

type AppointmentDetailRecord = Prisma.PatientAppointmentGetPayload<{
  select: ReturnType<typeof appointmentDetailSelect>;
}>;

function getDatabase(dependencies: AppointmentQueryDependencies): AppointmentQueryDatabase {
  return dependencies.database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ไม่ระบุชื่อ";
}

function nullableDisplayName(
  person: { givenName: string | null; familyName: string | null } | null,
): string | null {
  return person ? toDisplayName(person) : null;
}

function toCurrentAcknowledgement(record: {
  updatedAt: Date;
  acknowledgements: Array<{
    sourceAppointmentUpdatedAt: Date;
    source: AppointmentInteractionSource;
    acknowledgedAt: Date;
    recordedByUser: { person: { givenName: string | null; familyName: string | null } };
  }>;
}): AppointmentAcknowledgementSummary | null {
  const acknowledgement = record.acknowledgements.find(
    (item) => item.sourceAppointmentUpdatedAt.getTime() === record.updatedAt.getTime(),
  );

  return acknowledgement
    ? {
        source: acknowledgement.source,
        acknowledgedAt: acknowledgement.acknowledgedAt,
        recordedByDisplayName: nullableDisplayName(acknowledgement.recordedByUser.person),
      }
    : null;
}

function toCancellationRequests(
  records: Array<{
    id: string;
    source: AppointmentInteractionSource;
    status: AppointmentCancellationRequestStatus;
    submittedAt: Date;
    resolvedAt: Date | null;
    submittedByUser: { person: { givenName: string | null; familyName: string | null } };
    resolvedByUser: { person: { givenName: string | null; familyName: string | null } } | null;
  }>,
): AppointmentCancellationRequestSummary[] {
  return records.map((request) => ({
    requestId: request.id,
    source: request.source,
    status: request.status,
    submittedAt: request.submittedAt,
    resolvedAt: request.resolvedAt,
    submittedByDisplayName: nullableDisplayName(request.submittedByUser.person),
    resolvedByDisplayName: nullableDisplayName(request.resolvedByUser?.person ?? null),
  }));
}

function toCoordinationEvents(
  records: Array<{
    recordedAt: Date;
    recordedByUser: { person: { givenName: string | null; familyName: string | null } };
  }>,
): AppointmentCoordinationSummary[] {
  return records.map((event) => ({
    recordedAt: event.recordedAt,
    recordedByDisplayName: nullableDisplayName(event.recordedByUser.person),
  }));
}

function toHistoryItem(record: AppointmentHistoryRecord): AppointmentHistoryItem {
  return {
    appointmentId: record.id,
    scheduledAt: record.scheduledAt,
    type: record.type,
    status: record.status,
    durationMinutes: record.durationMinutes,
    locationType: record.locationType,
    responsibleDisplayName: nullableDisplayName(record.responsibleUser?.person ?? null),
    responsibleProfession: record.responsibleUser?.memberships[0]?.profession ?? null,
    osmAtCreationDisplayName: nullableDisplayName(
      record.osmAssignmentAtCreation?.osmUser.person ?? null,
    ),
    currentAcknowledgement: toCurrentAcknowledgement(record),
    cancellationRequests: toCancellationRequests(record.cancellationRequests),
    coordinationEvents: toCoordinationEvents(record.coordinationEvents),
  };
}

function toDetail(
  record: AppointmentDetailRecord,
  patient: AppointmentPatientSummary,
  canManage: boolean,
  canProxyPatientActions: boolean,
): AppointmentDetail {
  return {
    patient,
    canManage,
    canProxyPatientActions,
    canRecordCoordination: canProxyPatientActions,
    appointmentId: record.id,
    responsibleUserId: record.responsibleUserId,
    responsibleDisplayName: nullableDisplayName(record.responsibleUser?.person ?? null),
    responsibleProfession: record.responsibleUser?.memberships[0]?.profession ?? null,
    osmAtCreationDisplayName: nullableDisplayName(
      record.osmAssignmentAtCreation?.osmUser.person ?? null,
    ),
    currentAcknowledgement: toCurrentAcknowledgement(record),
    cancellationRequests: toCancellationRequests(record.cancellationRequests),
    coordinationEvents: toCoordinationEvents(record.coordinationEvents),
    createdByDisplayName: toDisplayName(record.createdByUser.person),
    type: record.type,
    scheduledAt: record.scheduledAt,
    durationMinutes: record.durationMinutes,
    locationType: record.locationType,
    locationDetail: record.locationDetail,
    note: record.note,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function resolveManageProjection(
  actor: ActorContext | null | undefined,
  relationshipId: string,
  database: AppointmentAccessDatabase,
): Promise<boolean> {
  try {
    await resolveAppointmentAccessContext(
      actor,
      relationshipId,
      APPOINTMENT_MANAGE_CAPABILITY,
      database,
    );
    return true;
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return false;
    }

    throw error;
  }
}

async function getResponsibleMembers(
  database: AppointmentAccessDatabase,
  hospitalId: string,
): Promise<ResponsibleHospitalMember[]> {
  const memberships = await database.hospitalMembership.findMany({
    where: {
      hospitalId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      profession: { in: [Profession.DOCTOR, Profession.NURSE] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      profession: true,
      user: {
        select: {
          person: {
            select: {
              givenName: true,
              familyName: true,
            },
          },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    displayName: toDisplayName(membership.user.person),
    profession: membership.profession,
  }));
}

async function getRescheduleResponsibleMembers(
  database: AppointmentAccessDatabase,
  hospitalId: string,
  currentResponsibleUserId: string | null,
  currentResponsiblePerson: { givenName: string | null; familyName: string | null } | null,
  currentResponsibleProfession: Profession | null,
): Promise<ResponsibleHospitalMember[]> {
  const members = await getResponsibleMembers(database, hospitalId);

  if (
    currentResponsibleUserId &&
    !members.some((member) => member.userId === currentResponsibleUserId)
  ) {
    members.push({
      userId: currentResponsibleUserId,
      displayName: currentResponsiblePerson
        ? toDisplayName(currentResponsiblePerson)
        : "ผู้รับผิดชอบเดิม",
      profession: currentResponsibleProfession,
    });
  }

  return members;
}

export async function getAppointmentHistory(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentHistory> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveAppointmentAccessContext(
      actor,
      relationshipId,
      APPOINTMENT_READ_CAPABILITY,
      database,
    );
    const records = await database.patientAppointment.findMany({
      where: { patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take: APPOINTMENT_HISTORY_LIMIT,
      select: appointmentHistorySelect(access.target.hospitalId),
    });
    return {
      patient: access.patient,
      items: records.map(toHistoryItem),
      canManage: access.scopes.directHospital,
      canCreate: access.scopes.directHospital || access.scopes.exactOsmAssignment,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment history could not be loaded");
  }
}

export async function getAppointmentDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  appointmentId: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentDetail> {
  const parsedRelationshipId = appointmentRelationshipIdSchema.safeParse(relationshipId);
  const parsedAppointmentId = appointmentIdSchema.safeParse(appointmentId);

  if (!parsedRelationshipId.success || !parsedAppointmentId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveAppointmentAccessContext(
      actor,
      parsedRelationshipId.data,
      APPOINTMENT_READ_CAPABILITY,
      database,
    );
    const record = await database.patientAppointment.findFirst({
      where: {
        id: parsedAppointmentId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: appointmentDetailSelect(access.target.hospitalId),
    });

    if (!record) {
      throw new NotFoundError();
    }

    return toDetail(record, access.patient, access.scopes.directHospital, access.scopes.exactOsmAssignment);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment detail could not be loaded");
  }
}

export async function getAppointmentCreateContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentCreateContext> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveAppointmentAccessContext(
      actor,
      relationshipId,
      APPOINTMENT_CREATE_CAPABILITY,
      database,
    );

    return {
      patient: access.patient,
      responsibleMembers: await getResponsibleMembers(database, access.target.hospitalId),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment setup could not be loaded");
  }
}

export async function getAppointmentRescheduleContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  appointmentId: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentRescheduleContext> {
  const parsedRelationshipId = appointmentRelationshipIdSchema.safeParse(relationshipId);
  const parsedAppointmentId = appointmentIdSchema.safeParse(appointmentId);

  if (!parsedRelationshipId.success || !parsedAppointmentId.success) {
    throw new NotFoundError();
  }

  try {
    const database = getDatabase(dependencies);
    const access = await resolveAppointmentAccessContext(
      actor,
      parsedRelationshipId.data,
      APPOINTMENT_MANAGE_CAPABILITY,
      database,
    );
    const record = await database.patientAppointment.findFirst({
      where: {
        id: parsedAppointmentId.data,
        patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
      },
      select: appointmentDetailSelect(access.target.hospitalId),
    });

    if (!record) {
      throw new NotFoundError();
    }

    return {
      patient: access.patient,
      appointment: toDetail(record, access.patient, true, false),
      responsibleMembers: await getRescheduleResponsibleMembers(
        database,
        access.target.hospitalId,
        record.responsibleUserId,
        record.responsibleUser?.person ?? null,
        record.responsibleUser?.memberships[0]?.profession ?? null,
      ),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment reschedule setup could not be loaded");
  }
}

export async function listResponsibleHospitalMembers(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<ResponsibleHospitalMember[]> {
  try {
    const database = getDatabase(dependencies);
    const access = await resolveAppointmentAccessContext(
      actor,
      relationshipId,
      APPOINTMENT_CREATE_CAPABILITY,
      database,
    );

    return getResponsibleMembers(database, access.target.hospitalId);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Responsible Hospital members could not be loaded");
  }
}

export const appointmentQueryInternals = {
  appointmentDetailSelect,
  appointmentHistorySelect,
  responsibleUserSelect,
  getResponsibleMembers,
  resolveManageProjection,
  nullableDisplayName,
  toDetail,
  toDisplayName,
  toHistoryItem,
};
