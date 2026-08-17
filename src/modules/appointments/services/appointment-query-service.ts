import "server-only";

import {
  MembershipType,
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
  membershipType: MembershipType;
};

export type AppointmentHistoryItem = {
  appointmentId: string;
  scheduledAt: Date;
  type: AppointmentTypeValue;
  status: AppointmentStatusValue;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  responsibleDisplayName: string | null;
};

export type AppointmentHistory = {
  patient: AppointmentPatientSummary;
  items: AppointmentHistoryItem[];
  canManage: boolean;
};

export type AppointmentDetail = {
  patient: AppointmentPatientSummary;
  canManage: boolean;
  appointmentId: string;
  responsibleUserId: string | null;
  responsibleDisplayName: string | null;
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

const appointmentHistorySelect = {
  id: true,
  scheduledAt: true,
  type: true,
  status: true,
  durationMinutes: true,
  locationType: true,
  responsibleUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientAppointmentSelect;

const appointmentDetailSelect = {
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
  responsibleUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
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
} satisfies Prisma.PatientAppointmentSelect;

type AppointmentHistoryRecord = Prisma.PatientAppointmentGetPayload<{
  select: typeof appointmentHistorySelect;
}>;

type AppointmentDetailRecord = Prisma.PatientAppointmentGetPayload<{
  select: typeof appointmentDetailSelect;
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

function toHistoryItem(record: AppointmentHistoryRecord): AppointmentHistoryItem {
  return {
    appointmentId: record.id,
    scheduledAt: record.scheduledAt,
    type: record.type,
    status: record.status,
    durationMinutes: record.durationMinutes,
    locationType: record.locationType,
    responsibleDisplayName: nullableDisplayName(record.responsibleUser?.person ?? null),
  };
}

function toDetail(
  record: AppointmentDetailRecord,
  patient: AppointmentPatientSummary,
  canManage: boolean,
): AppointmentDetail {
  return {
    patient,
    canManage,
    appointmentId: record.id,
    responsibleUserId: record.responsibleUserId,
    responsibleDisplayName: nullableDisplayName(record.responsibleUser?.person ?? null),
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
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      membershipType: true,
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
    membershipType: membership.membershipType,
  }));
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
      select: appointmentHistorySelect,
    });
    const canManage = await resolveManageProjection(
      actor,
      access.patient.patientHospitalRelationshipId,
      database,
    );

    return {
      patient: access.patient,
      items: records.map(toHistoryItem),
      canManage,
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
      select: appointmentDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    const canManage = await resolveManageProjection(
      actor,
      access.patient.patientHospitalRelationshipId,
      database,
    );

    return toDetail(record, access.patient, canManage);
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
      APPOINTMENT_MANAGE_CAPABILITY,
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
      select: appointmentDetailSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    return {
      patient: access.patient,
      appointment: toDetail(record, access.patient, true),
      responsibleMembers: await getResponsibleMembers(database, access.target.hospitalId),
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
      APPOINTMENT_MANAGE_CAPABILITY,
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
  getResponsibleMembers,
  resolveManageProjection,
  nullableDisplayName,
  toDetail,
  toDisplayName,
  toHistoryItem,
};
