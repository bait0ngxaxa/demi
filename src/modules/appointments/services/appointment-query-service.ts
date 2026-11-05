import "server-only";

import { appointmentSource, isOneOffVisitOsm, type AppointmentSource } from "../domain/appointment-service-definitions";
import { appointmentAppointerSelect, toAppointmentAppointer, type AppointmentAppointer } from "../domain/appointment-people";

import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  Prisma,
  Profession,
  type PatientServiceCode,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { hospitalOperatorRosterWhere } from "@/modules/identity/services/hospital-authority";
import { searchEligibleOsmCandidatePage } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import { buildNameWhere } from "@/modules/patient-directory/services/patient-directory-query-service";
import { resolvePagePosition, type PageNumberPosition } from "@/shared/pagination/page-number";
import { ASSIGNEE_SEARCH_PAGE_SIZE } from "@/shared/search/assignee-search";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  APPOINTMENT_HISTORY_LIMIT,
  type AppointmentLocationValue,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
} from "../domain/appointment-definitions";
import {
  assertAppointmentPolicy,
  decideAppointmentPolicy,
  APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY,
  APPOINTMENT_MANAGE_CAPABILITY,
  APPOINTMENT_READ_CAPABILITY,
} from "../policies/appointment-policy";
import { appointmentAssigneeSearchSchema, appointmentIdSchema, appointmentRelationshipIdSchema } from "../schemas/appointment-schemas";
import {
  resolveAppointmentAccessContext,
  type AppointmentAccessDatabase,
  type AppointmentPatientSummary,
} from "./appointment-access-service";
import { loadAppointmentContactPhones } from "./appointment-contact-phone-service";
import type { AppointmentContactAudience, AppointmentContactPhones } from "../domain/appointment-contact-phones";

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

export type AppointmentAssigneeAcceptanceSummary = {
  acceptedAt: Date;
  acceptedByDisplayName: string | null;
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
  serviceCode: PatientServiceCode | null;
  source: AppointmentSource;
  isOneOffVisit: boolean;
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
  source: AppointmentSource;
  isOneOffVisit: boolean;
  canHospitalManage?: boolean;
  patient: AppointmentPatientSummary;
  canManage: boolean;
  canProxyPatientActions: boolean;
  canRecordCoordination: boolean;
  appointmentId: string;
  assignedOsmUserId: string | null;
  assignedOsmDisplayName: string | null;
  currentAssigneeAcceptance: AppointmentAssigneeAcceptanceSummary | null;
  canAcceptAssignment: boolean;
  responsibleUserId: string | null;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  currentAcknowledgement: AppointmentAcknowledgementSummary | null;
  cancellationRequests: AppointmentCancellationRequestSummary[];
  coordinationEvents: AppointmentCoordinationSummary[];
  createdByDisplayName: string;
  /** ADR-0027 (AP-5): "ผู้นัดหมาย", the creator's name and role at the appointment's Hospital. */
  appointer: AppointmentAppointer;
  type: AppointmentTypeValue;
  /** ADR-0023 (SR-D4): set for an appointment from a service request; optional for a hospital booking. */
  serviceCode: PatientServiceCode | null;
  /** ADR-0023: booked from a patient's service request. */
  fromServiceRequest: boolean;
  scheduledAt: Date;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  locationDetail: string | null;
  note: string | null;
  status: AppointmentStatusValue;
  createdAt: Date;
  updatedAt: Date;
};

export type AppointmentOsmCandidate = { userId: string; displayName: string };

export type AppointmentCreateContext = {
  homeVisitOnly?: boolean;
  patient: AppointmentPatientSummary;
  currentOsmAssignee: { userId: string; displayName: string; contactPhone: string | null } | null;
  /**
   * The form searches the Hospital's staff and อสม. on the server (searchAppointmentResponsibleMembers,
   * searchAppointmentOsmCandidates); only the people already chosen on the Appointment travel with the context.
   */
  selectedResponsible: ResponsibleHospitalMember | null;
  /** ADR-0027 (AP-2): an อสม. other than the Patient's current one; choosing one is a one-off visit. */
  selectedOsm: AppointmentOsmCandidate | null;
};

/** One page of the appointment form's assignee search. */
export type AppointmentAssigneePage<T> = PageNumberPosition & { items: T[] };

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
  serviceCode: true,
  sourceServiceRequestId: true,
  assignedOsmUserId: true,
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
  createdByUserId: true,
  id: true,
  assignedOsmUserId: true,
  responsibleUserId: true,
  type: true,
  serviceCode: true,
  sourceServiceRequestId: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  locationDetail: true,
  note: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  responsibleUser: { select: responsibleUserSelect(hospitalId) },
  createdByUser: { select: appointmentAppointerSelect(hospitalId) },
  assignedOsmUser: {
    select: { person: { select: { givenName: true, familyName: true } } },
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
  assigneeAcceptances: {
    orderBy: [{ sourceAppointmentUpdatedAt: "desc" }, { acceptedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      sourceAppointmentUpdatedAt: true,
      acceptedAt: true,
      acceptedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  },
  rescheduleRequests: {
    where: { status: "PENDING" },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: 5,
    select: { sourceAppointmentUpdatedAt: true, status: true },
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

function appointmentContactAudienceForScope(scopes: {
  patientSelf: boolean;
  directHospital: boolean;
  exactOsmAssignment: boolean;
  networkRead: boolean;
  visitOsm: boolean;
}): AppointmentContactAudience {
  if (scopes.patientSelf) return "PATIENT_SELF";
  if (scopes.directHospital) return "HOSPITAL_STAFF";
  // ADR-0023 (SR-B): the visiting อสม. sees the contacts the appointment shows its อสม.
  if (scopes.exactOsmAssignment || scopes.visitOsm) return "ASSIGNED_OSM_OR_HOSPITAL_STAFF";
  if (scopes.networkRead) return "NETWORK_READ";
  return "NONE";
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

function toCurrentAssigneeAcceptance(record: {
  updatedAt: Date;
  assigneeAcceptances: Array<{
    sourceAppointmentUpdatedAt: Date;
    acceptedAt: Date;
    acceptedBy: { person: { givenName: string | null; familyName: string | null } };
  }>;
}): AppointmentAssigneeAcceptanceSummary | null {
  const acceptance = record.assigneeAcceptances.find(
    (item) => item.sourceAppointmentUpdatedAt.getTime() === record.updatedAt.getTime(),
  );
  return acceptance
    ? { acceptedAt: acceptance.acceptedAt, acceptedByDisplayName: nullableDisplayName(acceptance.acceptedBy.person) }
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

function toHistoryItem(
  record: AppointmentHistoryRecord,
  currentOsmUserId: string | null = null,
  showOneOffVisit = false,
): AppointmentHistoryItem {
  return {
    serviceCode: record.serviceCode,
    source: appointmentSource(record.sourceServiceRequestId),
    isOneOffVisit: showOneOffVisit && isOneOffVisitOsm({
      appointmentOsmUserId: record.assignedOsmUserId,
      assignedOsmUserId: currentOsmUserId,
    }),
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
  canHospitalManage: boolean = canManage,
  canAcceptAssignment = false,
  isOneOffVisit = false,
): AppointmentDetail {
  return {
    patient,
    canManage,
    canHospitalManage,
    canProxyPatientActions,
    canRecordCoordination: canProxyPatientActions,
    appointmentId: record.id,
    assignedOsmUserId: record.assignedOsmUserId,
    assignedOsmDisplayName: nullableDisplayName(record.assignedOsmUser?.person ?? null),
    currentAssigneeAcceptance: toCurrentAssigneeAcceptance(record),
    canAcceptAssignment,
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
    appointer: toAppointmentAppointer(record.createdByUser, toDisplayName),
    type: record.type,
    serviceCode: record.serviceCode,
    source: appointmentSource(record.sourceServiceRequestId),
    isOneOffVisit,
    fromServiceRequest: record.sourceServiceRequestId !== null,
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

function responsibleMemberWhere(hospitalId: string, value: string | undefined): Prisma.HospitalMembershipWhereInput {
  // ADR-0027 (AP-1): every operator of the Hospital, whatever the profession.
  const roster = hospitalOperatorRosterWhere(hospitalId);
  return value ? { AND: [roster, { user: { is: { person: buildNameWhere(value) } } }] } : roster;
}

/** One counted page of the Hospital's operators by name. The caller has authorized the Hospital. */
async function searchResponsibleMembers(
  database: AppointmentAccessDatabase,
  input: { hospitalId: string; value?: string; page: number },
): Promise<AppointmentAssigneePage<ResponsibleHospitalMember>> {
  const where = responsibleMemberWhere(input.hospitalId, input.value);
  const total = await database.hospitalMembership.count({ where });
  const { skip, ...position } = resolvePagePosition(input.page, total, ASSIGNEE_SEARCH_PAGE_SIZE);
  const memberships = total === 0 ? [] : await database.hospitalMembership.findMany({
    where,
    orderBy: [{ user: { person: { givenName: "asc" } } }, { user: { person: { familyName: "asc" } } }, { userId: "asc" }],
    skip,
    take: ASSIGNEE_SEARCH_PAGE_SIZE,
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

  return {
    ...position,
    items: memberships.map((membership) => ({
      userId: membership.userId,
      displayName: toDisplayName(membership.user.person),
      profession: membership.profession,
    })),
  };
}

/** ADR-0027 (AP-2): one page of the ACTIVE อสม. of the ACTIVE Hospital other than the patient's current one, by name. */
async function searchOsmCandidates(
  database: AppointmentAccessDatabase,
  input: { hospitalId: string; currentOsmUserId: string | null; value?: string; page: number },
): Promise<AppointmentAssigneePage<AppointmentOsmCandidate>> {
  const { candidates, ...position } = await searchEligibleOsmCandidatePage(database, {
    hospitalId: input.hospitalId,
    value: input.value,
    excludeUserIds: input.currentOsmUserId ? [input.currentOsmUserId] : [],
    page: input.page,
    pageSize: ASSIGNEE_SEARCH_PAGE_SIZE,
  });
  return { ...position, items: candidates.map(({ userId, displayName }) => ({ userId, displayName })) };
}

/** The responsible person already on the Appointment stays chosen even after they left the Hospital. */
function keptResponsible(
  userId: string | null,
  person: { givenName: string | null; familyName: string | null } | null,
  profession: Profession | null,
): ResponsibleHospitalMember | null {
  return userId
    ? { userId, displayName: person ? toDisplayName(person) : "ผู้รับผิดชอบเดิม", profession }
    : null;
}

/** A one-off อสม. already on the Appointment stays chosen whatever the search shows. */
function keptOsm(
  keptOsmUserId: string | null,
  keptPerson: { givenName: string | null; familyName: string | null } | null,
): AppointmentOsmCandidate | null {
  return keptOsmUserId ? { userId: keptOsmUserId, displayName: keptPerson ? toDisplayName(keptPerson) : "อสม. เดิม" } : null;
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
      items: records.map((record) => toHistoryItem(record, access.target.patientCurrentOsmUserId ?? null, access.scopes.directHospital || access.scopes.networkRead)),
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
): Promise<AppointmentDetail & { contactPhones: AppointmentContactPhones }> {
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
      undefined,
      { appointmentId: parsedAppointmentId.data },
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

    const currentAcceptance = toCurrentAssigneeAcceptance(record);
    const isOsmOfAppointment = (access.scopes.exactOsmAssignment &&
      access.target.patientCurrentOsmUserId === record.assignedOsmUserId) || access.scopes.visitOsm;
    const hasOpenRescheduleRequest = record.rescheduleRequests.some(
      (request) => request.sourceAppointmentUpdatedAt.getTime() === record.updatedAt.getTime(),
    );
    const canAcceptAssignment = Boolean(
      isOsmOfAppointment &&
      record.assignedOsmUserId === access.authoritativeActor.userId &&
      record.status === "SCHEDULED" &&
      record.scheduledAt.getTime() > Date.now() &&
      !currentAcceptance &&
      !hasOpenRescheduleRequest,
    );

    const contactPhones = await loadAppointmentContactPhones(
      database,
      access.patient.patientHospitalRelationshipId,
      appointmentContactAudienceForScope(access.scopes),
    );

    const showOneOffVisit = (access.scopes.directHospital || access.scopes.networkRead || access.scopes.visitOsm) && isOneOffVisitOsm({
      appointmentOsmUserId: record.assignedOsmUserId,
      assignedOsmUserId: access.target.patientCurrentOsmUserId ?? null,
    });
    return { ...toDetail(record, access.patient, decideAppointmentPolicy({ actor: access.authoritativeActor, capability: APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY,
      target: { ...access.target, ...record, appointmentAssignedOsmUserId: record.assignedOsmUserId, operation: "EDIT" } }).allowed, access.scopes.exactOsmAssignment || access.scopes.visitOsm, access.scopes.directHospital, canAcceptAssignment, showOneOffVisit), contactPhones };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment detail could not be loaded");
  }
}

async function resolveCurrentOsmAssignee(
  database: AppointmentQueryDatabase,
  input: { osmUserId: string | null; hospitalId: string; includePhone: boolean },
): Promise<{ userId: string; displayName: string; contactPhone: string | null } | null> {
  if (!input.osmUserId) return null;
  const osm = await database.user.findFirst({
    where: {
      id: input.osmUserId,
      status: "ACTIVE",
      roles: { some: { role: "OSM" } },
      osmHospitalRelationships: {
        some: { hospitalId: input.hospitalId, status: "ACTIVE", hospital: { status: "ACTIVE" } },
      },
    },
    select: { id: true, person: { select: { givenName: true, familyName: true } }, osmHospitalRelationships: { where: { hospitalId: input.hospitalId, status: "ACTIVE" }, take: 1, select: { contactPhone: true } } },
  });
  return osm ? { userId: osm.id, displayName: toDisplayName(osm.person), contactPhone: input.includePhone ? osm.osmHospitalRelationships[0]?.contactPhone ?? null : null } : null;
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
      APPOINTMENT_READ_CAPABILITY,
      database,
    );

    return {
      homeVisitOnly: !access.scopes.directHospital,
      patient: access.patient,
      selectedResponsible: null,
      selectedOsm: null,
      currentOsmAssignee: await resolveCurrentOsmAssignee(database, {
        includePhone: access.scopes.directHospital,
        osmUserId: access.target.patientCurrentOsmUserId,
        hospitalId: access.target.hospitalId,
      }),
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

    assertAppointmentPolicy({ actor: access.authoritativeActor, capability: APPOINTMENT_HOME_VISIT_MANAGE_CAPABILITY,
      target: { ...access.target, ...record, appointmentAssignedOsmUserId: record.assignedOsmUserId, operation: "EDIT" } });
    return {
      homeVisitOnly: !access.scopes.directHospital,
      patient: access.patient,
      appointment: toDetail(record, access.patient, true, false, access.scopes.directHospital),
      currentOsmAssignee: await resolveCurrentOsmAssignee(database, {
        includePhone: access.scopes.directHospital,
        osmUserId: access.target.patientCurrentOsmUserId,
        hospitalId: access.target.hospitalId,
      }),
      selectedOsm: access.scopes.directHospital
        ? keptOsm(
          record.assignedOsmUserId === access.target.patientCurrentOsmUserId ? null : record.assignedOsmUserId,
          record.assignedOsmUser?.person ?? null,
        )
        : null,
      selectedResponsible: access.scopes.directHospital ? keptResponsible(
        record.responsibleUserId,
        record.responsibleUser?.person ?? null,
        record.responsibleUser?.memberships[0]?.profession ?? null,
      ) : null,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Appointment reschedule setup could not be loaded");
  }
}

type AppointmentAssigneeSearch = { relationshipId: string; value?: string; page: number };

/** Direct Hospital staff of the Patient's Hospital only; the Hospital comes from the relationship, never the client. */
async function resolveAssigneeSearchScope(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: AppointmentQueryDatabase,
): Promise<{ hospitalId: string; currentOsmUserId: string | null; search: AppointmentAssigneeSearch }> {
  const parsed = appointmentAssigneeSearchSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Appointment assignee search is invalid");
  }

  const access = await resolveAppointmentAccessContext(actor, parsed.data.relationshipId, APPOINTMENT_READ_CAPABILITY, database);
  if (!access.scopes.directHospital) {
    throw new ForbiddenError();
  }

  return {
    hospitalId: access.target.hospitalId,
    currentOsmUserId: access.target.patientCurrentOsmUserId ?? null,
    search: parsed.data,
  };
}

/** ADR-0027 (AP-1): one page of the Patient's Hospital operators, by name, for the appointment form. */
export async function searchAppointmentResponsibleMembers(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentAssigneePage<ResponsibleHospitalMember>> {
  try {
    const database = getDatabase(dependencies);
    const scope = await resolveAssigneeSearchScope(actor, input, database);
    return await searchResponsibleMembers(database, { hospitalId: scope.hospitalId, value: scope.search.value, page: scope.search.page });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Responsible Hospital members could not be loaded");
  }
}

/** ADR-0027 (AP-2): one page of the Hospital's other ACTIVE อสม., by name, for the appointment form. */
export async function searchAppointmentOsmCandidates(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: AppointmentQueryDependencies = {},
): Promise<AppointmentAssigneePage<AppointmentOsmCandidate>> {
  try {
    const database = getDatabase(dependencies);
    const scope = await resolveAssigneeSearchScope(actor, input, database);
    return await searchOsmCandidates(database, {
      hospitalId: scope.hospitalId,
      currentOsmUserId: scope.currentOsmUserId,
      value: scope.search.value,
      page: scope.search.page,
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("OSM candidates could not be loaded");
  }
}

export const appointmentQueryInternals = {
  appointmentDetailSelect,
  appointmentHistorySelect,
  responsibleUserSelect,
  searchOsmCandidates,
  searchResponsibleMembers,
  resolveManageProjection,
  nullableDisplayName,
  toDetail,
  toDisplayName,
  toHistoryItem,
};
