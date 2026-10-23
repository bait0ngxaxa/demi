import "server-only";

import {
  AppointmentCancellationRequestStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Profession,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  buildNetworkReadableChildHospitalWhere,
  findNetworkPatientReadParent,
  listNetworkScopes,
  recordNetworkPatientRead,
} from "@/modules/hospital-service-areas/services/hospital-network-access";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  type AppointmentLocationValue,
  type AppointmentStatusValue,
  type AppointmentTypeValue,
} from "../domain/appointment-definitions";
import {
  WORK_APPOINTMENT_PAGE_SIZE,
  workAppointmentQuerySchema,
  type WorkAppointmentFilters,
  type WorkAppointmentQueryInput,
  type WorkAppointmentTab,
} from "../schemas/work-appointment-schemas";
import {
  decodeWorkAppointmentCursor,
  encodeWorkAppointmentCursor,
  type WorkAppointmentCursorContext,
  type WorkAppointmentCursorPosition,
} from "./work-appointment-cursor";

export type WorkAppointmentDatabase = PrismaClient | Prisma.TransactionClient;

export type WorkAppointmentQueryDependencies = {
  database?: WorkAppointmentDatabase;
  now?: () => Date;
};

export type WorkAppointmentHospitalScope = {
  hospitalId: string;
  hospitalName: string;
  access: "DIRECT" | "OSM" | "NETWORK";
  canCreate: boolean;
  canResolveRequests: boolean;
};

export type WorkAppointmentResponsibleOption = {
  userId: string;
  displayName: string;
  profession: Profession | null;
};

export type WorkAppointmentListItem = {
  appointmentId: string;
  relationshipId: string;
  scheduledAt: Date;
  durationMinutes: number | null;
  type: AppointmentTypeValue;
  locationType: AppointmentLocationValue | null;
  status: AppointmentStatusValue;
  patientDisplayName: string;
  hospitalName: string;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  pendingRequestBadges: {
    reschedule: boolean;
    cancellation: boolean;
  };
};

export type WorkAppointmentPage = {
  hospital: WorkAppointmentHospitalScope;
  hospitals: WorkAppointmentHospitalScope[];
  tab: WorkAppointmentTab;
  filters: WorkAppointmentFilters;
  items: WorkAppointmentListItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
  canCreate: boolean;
  canResolveRequests: boolean;
  responsibleOptions: WorkAppointmentResponsibleOption[];
};

type ResolvedHospitalScope = {
  hospitalId: string;
  hospitalName: string;
  directRead: boolean;
  osmRead: boolean;
  networkRead: boolean;
  osmCanCreate: boolean;
};

type StoredActor = {
  id: string;
  roles: Role[];
};

const activeDirectMembershipWhere = (actorUserId: string): Prisma.HospitalMembershipWhereInput => ({
  userId: actorUserId,
  status: MembershipStatus.ACTIVE,
  membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
  user: {
    is: {
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.HOSPITAL } },
    },
  },
});

function getDatabase(database?: WorkAppointmentDatabase): WorkAppointmentDatabase {
  return database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const parts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.join(" ") || "ไม่ระบุชื่อ";
}

function ensureActor(actor: ActorContext | null | undefined): ActorContext {
  if (!actor) throw new ForbiddenError();
  return actor;
}

async function resolveWorkScopes(
  actor: ActorContext,
  database: WorkAppointmentDatabase,
): Promise<ResolvedHospitalScope[]> {
  const storedActor = await database.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (!storedActor || storedActor.status !== UserStatus.ACTIVE) {
    throw new ForbiddenError();
  }

  const persistedActor: StoredActor = {
    id: storedActor.id,
    roles: storedActor.roles.map(({ role }) => role),
  };
  const hasHospitalRole = persistedActor.roles.includes(Role.HOSPITAL);
  const hasOsmRole = persistedActor.roles.includes(Role.OSM);
  const scopes = new Map<string, ResolvedHospitalScope>();
  const order: string[] = [];

  function getOrAdd(hospital: { id: string; name: string }): ResolvedHospitalScope {
    const existing = scopes.get(hospital.id);
    if (existing) return existing;

    const created: ResolvedHospitalScope = {
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      directRead: false,
      osmRead: false,
      networkRead: false,
      osmCanCreate: false,
    };
    scopes.set(hospital.id, created);
    order.push(hospital.id);
    return created;
  }

  if (hasHospitalRole) {
    const directHospitals = await database.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        memberships: { some: activeDirectMembershipWhere(persistedActor.id) },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });

    for (const hospital of directHospitals) {
      getOrAdd(hospital).directRead = true;
    }
  }

  if (hasOsmRole) {
    const osmHospitals = await database.hospital.findMany({
      where: {
        status: HospitalStatus.ACTIVE,
        osmHospitalRelationships: {
          some: {
            userId: persistedActor.id,
            status: MembershipStatus.ACTIVE,
            user: {
              is: {
                status: UserStatus.ACTIVE,
                roles: { some: { role: Role.OSM } },
              },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        patientRelationships: {
          where: {
            ...activePatientHospitalRelationshipWhere,
            patientProfile: {
              is: {
                person: {
                  is: {
                    user: { is: { roles: { some: { role: Role.PATIENT } } } },
                  },
                },
              },
            },
            osmAssignments: {
              some: {
                osmUserId: persistedActor.id,
                endedAt: null,
              },
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    for (const hospital of osmHospitals) {
      const scope = getOrAdd(hospital);
      scope.osmRead = true;
      scope.osmCanCreate = hospital.patientRelationships.length > 0;
    }
  }

  if (hasHospitalRole) {
    const networkScopes = await listNetworkScopes(database, persistedActor.id, "PATIENT_READ");
    for (const network of networkScopes) {
      for (const child of network.children) {
        getOrAdd(child).networkRead = true;
      }
    }
  }

  return order.map((hospitalId) => scopes.get(hospitalId)).filter(
    (scope): scope is ResolvedHospitalScope => scope !== undefined,
  );
}

function toPublicScope(scope: ResolvedHospitalScope): WorkAppointmentHospitalScope {
  const access = scope.directRead
    ? "DIRECT"
    : scope.osmRead
      ? "OSM"
      : "NETWORK";

  return {
    hospitalId: scope.hospitalId,
    hospitalName: scope.hospitalName,
    access,
    canCreate: scope.directRead || scope.osmCanCreate,
    canResolveRequests: scope.directRead,
  };
}

export async function listWorkAppointmentScopes(
  actorInput: ActorContext | null | undefined,
  dependencies: WorkAppointmentQueryDependencies = {},
): Promise<WorkAppointmentHospitalScope[]> {
  const actor = ensureActor(actorInput);

  try {
    const database = getDatabase(dependencies.database);
    const scopes = await resolveWorkScopes(actor, database);
    if (scopes.length === 0) throw new ForbiddenError();
    return scopes.map(toPublicScope);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Appointment work scopes could not be loaded");
  }
}

function activeOsmAssignmentWhere(
  actorUserId: string,
  hospitalId: string,
): Prisma.PatientOsmAssignmentWhereInput {
  return {
    osmUserId: actorUserId,
    endedAt: null,
    osmUser: {
      is: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.OSM } },
        osmHospitalRelationships: {
          some: {
            hospitalId,
            status: MembershipStatus.ACTIVE,
            hospital: { is: { status: HospitalStatus.ACTIVE } },
          },
        },
      },
    },
  };
}

function appointmentRelationshipReadWhere(
  actorUserId: string,
  scope: ResolvedHospitalScope,
): Prisma.PatientHospitalRelationshipWhereInput {
  const readPaths: Prisma.PatientHospitalRelationshipWhereInput[] = [];

  if (scope.directRead) {
    readPaths.push({
      hospital: { is: { memberships: { some: activeDirectMembershipWhere(actorUserId) } } },
    });
  }

  if (scope.osmRead) {
    readPaths.push({
      osmAssignments: { some: activeOsmAssignmentWhere(actorUserId, scope.hospitalId) },
    });
  }

  if (scope.networkRead) {
    readPaths.push({
      hospital: {
        is: {
          id: scope.hospitalId,
          ...buildNetworkReadableChildHospitalWhere(actorUserId),
        },
      },
    });
  }

  return {
    ...activePatientHospitalRelationshipWhere,
    hospitalId: scope.hospitalId,
    hospital: { is: { status: HospitalStatus.ACTIVE } },
    patientProfile: {
      is: {
        person: {
          is: {
            user: { is: { roles: { some: { role: Role.PATIENT } } } },
          },
        },
      },
    },
    OR: readPaths,
  };
}

function bangkokDayStart(value: string): Date {
  return new Date(value + "T00:00:00.000+07:00");
}

function bangkokDayAfter(value: string): Date {
  return new Date(bangkokDayStart(value).getTime() + 24 * 60 * 60 * 1000);
}

function buildAppointmentWhere(
  actorUserId: string,
  scope: ResolvedHospitalScope,
  filters: WorkAppointmentFilters,
): Prisma.PatientAppointmentWhereInput {
  const scheduledAt: Prisma.DateTimeFilter<"PatientAppointment"> = {};
  if (filters.dateFrom) scheduledAt.gte = bangkokDayStart(filters.dateFrom);
  if (filters.dateTo) scheduledAt.lt = bangkokDayAfter(filters.dateTo);

  return {
    patientHospitalRelationship: {
      is: appointmentRelationshipReadWhere(actorUserId, scope),
    },
    ...(Object.keys(scheduledAt).length === 0 ? {} : { scheduledAt }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.type === undefined ? {} : { type: filters.type }),
    ...(filters.locationType === undefined ? {} : { locationType: filters.locationType }),
    ...(filters.responsibleUserId === undefined
      ? {}
      : { responsibleUserId: filters.responsibleUserId }),
  };
}

function workAppointmentSelect(hospitalId: string, actorUserId: string) {
  return {
    id: true,
    responsibleUserId: true,
    patientHospitalRelationshipId: true,
    scheduledAt: true,
    durationMinutes: true,
    type: true,
    locationType: true,
    status: true,
    responsibleUser: {
      select: {
        person: { select: { givenName: true, familyName: true } },
        memberships: { where: { hospitalId }, select: { profession: true } },
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
    patientHospitalRelationship: {
      select: {
        hospital: { select: { name: true } },
        patientProfile: {
          select: {
            person: { select: { givenName: true, familyName: true } },
          },
        },
        osmAssignments: {
          where: {
            ...activeOsmAssignmentWhere(actorUserId, hospitalId),
          },
          select: { id: true },
          take: 1,
        },
      },
    },
    rescheduleRequests: {
      where: { status: AppointmentCancellationRequestStatus.PENDING },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: 1,
    },
    cancellationRequests: {
      where: { status: AppointmentCancellationRequestStatus.PENDING },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: 1,
    },
  } satisfies Prisma.PatientAppointmentSelect;
}

type WorkAppointmentRecord = Prisma.PatientAppointmentGetPayload<{
  select: ReturnType<typeof workAppointmentSelect>;
}>;

function toWorkAppointmentItem(record: WorkAppointmentRecord): WorkAppointmentListItem {
  return {
    appointmentId: record.id,
    relationshipId: record.patientHospitalRelationshipId,
    scheduledAt: record.scheduledAt,
    durationMinutes: record.durationMinutes,
    type: record.type,
    locationType: record.locationType,
    status: record.status,
    patientDisplayName: toDisplayName(record.patientHospitalRelationship.patientProfile.person),
    hospitalName: record.patientHospitalRelationship.hospital.name,
    responsibleDisplayName: record.responsibleUser
      ? toDisplayName(record.responsibleUser.person)
      : null,
    responsibleProfession: record.responsibleUser?.memberships[0]?.profession ?? null,
    osmAtCreationDisplayName: record.osmAssignmentAtCreation
      ? toDisplayName(record.osmAssignmentAtCreation.osmUser.person)
      : null,
    pendingRequestBadges: {
      reschedule: record.rescheduleRequests.length > 0,
      cancellation: record.cancellationRequests.length > 0,
    },
  };
}

function appointmentCursorWhere(
  position: WorkAppointmentCursorPosition,
  ascending: boolean,
): Prisma.PatientAppointmentWhereInput {
  return ascending
    ? {
        OR: [
          { scheduledAt: { gt: position.sortAt } },
          { scheduledAt: position.sortAt, id: { gt: position.appointmentId } },
        ],
      }
    : {
        OR: [
          { scheduledAt: { lt: position.sortAt } },
          { scheduledAt: position.sortAt, id: { lt: position.appointmentId } },
        ],
      };
}

function pendingRequestCursorWhere(
  position: WorkAppointmentCursorPosition,
): Prisma.PatientAppointmentRescheduleRequestWhereInput {
  const notAfterBoundary = [
    { submittedAt: { lt: position.sortAt } },
    { submittedAt: position.sortAt, appointmentId: { lte: position.appointmentId } },
  ];

  return {
    AND: [
      {
        OR: [
          { submittedAt: { gt: position.sortAt } },
          { submittedAt: position.sortAt, appointmentId: { gt: position.appointmentId } },
        ],
      },
      {
        NOT: {
          appointment: {
            is: {
              OR: [
                {
                  rescheduleRequests: {
                    some: {
                      status: AppointmentCancellationRequestStatus.PENDING,
                      OR: notAfterBoundary,
                    },
                  },
                },
                {
                  cancellationRequests: {
                    some: {
                      status: AppointmentCancellationRequestStatus.PENDING,
                      OR: notAfterBoundary,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  };
}

function pendingCancellationRequestCursorWhere(
  position: WorkAppointmentCursorPosition,
): Prisma.PatientAppointmentCancellationRequestWhereInput {
  const notAfterBoundary = [
    { submittedAt: { lt: position.sortAt } },
    { submittedAt: position.sortAt, appointmentId: { lte: position.appointmentId } },
  ];

  return {
    AND: [
      {
        OR: [
          { submittedAt: { gt: position.sortAt } },
          { submittedAt: position.sortAt, appointmentId: { gt: position.appointmentId } },
        ],
      },
      {
        NOT: {
          appointment: {
            is: {
              OR: [
                {
                  rescheduleRequests: {
                    some: {
                      status: AppointmentCancellationRequestStatus.PENDING,
                      OR: notAfterBoundary,
                    },
                  },
                },
                {
                  cancellationRequests: {
                    some: {
                      status: AppointmentCancellationRequestStatus.PENDING,
                      OR: notAfterBoundary,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  };
}

function toPublicHospitalScope(scope: ResolvedHospitalScope): WorkAppointmentHospitalScope {
  return toPublicScope(scope);
}

async function listResponsibleOptions(
  database: WorkAppointmentDatabase,
  hospitalId: string,
): Promise<WorkAppointmentResponsibleOption[]> {
  const memberships = await database.hospitalMembership.findMany({
    where: {
      hospitalId,
      status: MembershipStatus.ACTIVE,
      user: { is: { status: UserStatus.ACTIVE } },
      profession: { in: [Profession.DOCTOR, Profession.NURSE] },
    },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: {
      userId: true,
      profession: true,
      user: {
        select: {
          person: { select: { givenName: true, familyName: true } },
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

function visibleResponsibleOptions(
  records: readonly WorkAppointmentRecord[],
): WorkAppointmentResponsibleOption[] {
  const options = new Map<string, WorkAppointmentResponsibleOption>();
  for (const record of records) {
    if (!record.responsibleUserId || !record.responsibleUser) continue;
    options.set(record.responsibleUserId, {
      userId: record.responsibleUserId,
      displayName: toDisplayName(record.responsibleUser.person),
      profession: record.responsibleUser.memberships[0]?.profession ?? null,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "th") || left.userId.localeCompare(right.userId),
  );
}

function parseQuery(input: unknown): WorkAppointmentQueryInput {
  const parsed = workAppointmentQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Work appointment query is invalid");
  }
  return parsed.data;
}

function buildCursorContext(
  actorId: string,
  scope: ResolvedHospitalScope,
  tab: WorkAppointmentTab,
  filters: WorkAppointmentFilters,
): WorkAppointmentCursorContext {
  return { actorId, hospitalId: scope.hospitalId, tab, filters };
}

async function auditNetworkRead(
  database: WorkAppointmentDatabase,
  actorUserId: string,
  scope: ResolvedHospitalScope,
  records: WorkAppointmentRecord[],
): Promise<void> {
  if (!scope.networkRead || scope.directRead) return;

  const parent = await findNetworkPatientReadParent(database, actorUserId, scope.hospitalId);
  if (!parent) throw new ForbiddenError();

  const uniqueRelationships = new Map<string, string>();
  for (const record of records) {
    const relationshipId = record.patientHospitalRelationshipId;
    const hasDirectOsmRead = scope.osmRead &&
      record.patientHospitalRelationship.osmAssignments.length > 0;
    if (!hasDirectOsmRead) uniqueRelationships.set(relationshipId, relationshipId);
  }

  if (uniqueRelationships.size === 0 && records.length === 0) {
    await recordNetworkPatientRead(database, {
      actorUserId,
      parentHospitalId: parent.id,
      childHospitalId: scope.hospitalId,
      resourceType: "Hospital",
      resourceId: scope.hospitalId,
      scope: "appointment-list",
    });
    return;
  }

  for (const relationshipId of uniqueRelationships.keys()) {
    await recordNetworkPatientRead(database, {
      actorUserId,
      parentHospitalId: parent.id,
      childHospitalId: scope.hospitalId,
      resourceType: "PatientHospitalRelationship",
      resourceId: relationshipId,
      scope: "appointment",
    });
  }
}

export async function listWorkAppointments(
  actorInput: ActorContext | null | undefined,
  input: unknown,
  dependencies: WorkAppointmentQueryDependencies = {},
): Promise<WorkAppointmentPage> {
  const actor = ensureActor(actorInput);
  const parsed = parseQuery(input);
  const { hospitalId, tab, cursor, ...filters } = parsed;

  try {
    const database = getDatabase(dependencies.database);
    const scopes = await resolveWorkScopes(actor, database);
    if (scopes.length === 0) throw new ForbiddenError();

    const resolvedScope =
      scopes.find(({ hospitalId: candidate }) => candidate === hospitalId) ?? scopes[0];
    if (!resolvedScope) throw new ForbiddenError();
    if (tab === "PENDING_REQUESTS" && !resolvedScope.directRead) {
      throw new ForbiddenError();
    }

    const cursorContext = buildCursorContext(actor.userId, resolvedScope, tab, filters);
    const position = decodeWorkAppointmentCursor(cursor, cursorContext);
    const now = dependencies.now?.() ?? new Date();
    const baseWhere = buildAppointmentWhere(actor.userId, resolvedScope, filters);

    let records: WorkAppointmentRecord[] = [];
    let nextCursor: string | null = null;

    if (tab === "PENDING_REQUESTS") {
      const appointmentScope = {
        status: AppointmentCancellationRequestStatus.PENDING,
        appointment: { is: baseWhere },
      };
      const [reschedules, cancellations] = await Promise.all([
        database.patientAppointmentRescheduleRequest.findMany({
          where: {
            ...appointmentScope,
            ...(position ? pendingRequestCursorWhere(position) : {}),
          },
          orderBy: [{ submittedAt: "asc" }, { appointmentId: "asc" }, { id: "asc" }],
          take: WORK_APPOINTMENT_PAGE_SIZE + 1,
          select: {
            submittedAt: true,
            appointmentId: true,
            appointment: { select: workAppointmentSelect(resolvedScope.hospitalId, actor.userId) },
          },
        }),
        database.patientAppointmentCancellationRequest.findMany({
          where: {
            ...appointmentScope,
            ...(position ? pendingCancellationRequestCursorWhere(position) : {}),
          },
          orderBy: [{ submittedAt: "asc" }, { appointmentId: "asc" }, { id: "asc" }],
          take: WORK_APPOINTMENT_PAGE_SIZE + 1,
          select: {
            submittedAt: true,
            appointmentId: true,
            appointment: { select: workAppointmentSelect(resolvedScope.hospitalId, actor.userId) },
          },
        }),
      ]);

      const pendingByAppointment = new Map<
        string,
        { submittedAt: Date; record: WorkAppointmentRecord }
      >();
      for (const candidate of [...reschedules, ...cancellations]) {
        const current = pendingByAppointment.get(candidate.appointmentId);
        if (!current || candidate.submittedAt.getTime() < current.submittedAt.getTime()) {
          pendingByAppointment.set(candidate.appointmentId, {
            submittedAt: candidate.submittedAt,
            record: candidate.appointment,
          });
        }
      }

      const pendingRows = [...pendingByAppointment.entries()]
        .map(([appointmentId, value]) => ({ appointmentId, ...value }))
        .sort((left, right) =>
          left.submittedAt.getTime() - right.submittedAt.getTime() ||
          left.appointmentId.localeCompare(right.appointmentId),
        );
      const pageRows = pendingRows.slice(0, WORK_APPOINTMENT_PAGE_SIZE);
      records = pageRows.map(({ record }) => record);
      if (pendingRows.length > WORK_APPOINTMENT_PAGE_SIZE && pageRows.length > 0) {
        const last = pageRows[pageRows.length - 1];
        if (last) {
          nextCursor = encodeWorkAppointmentCursor(
            { sortAt: last.submittedAt, appointmentId: last.appointmentId },
            cursorContext,
          );
        }
      }
    } else {
      const ascending = tab === "UPCOMING";
      const tabWhere: Prisma.PatientAppointmentWhereInput =
        tab === "UPCOMING"
          ? {
              AND: [
                baseWhere,
                { status: "SCHEDULED" },
                { scheduledAt: { gte: now } },
              ],
            }
          : {
              AND: [
                baseWhere,
                {
                  OR: [
                    { status: { not: "SCHEDULED" } },
                    { scheduledAt: { lt: now } },
                  ],
                },
              ],
            };
      const where = position
        ? { AND: [tabWhere, appointmentCursorWhere(position, ascending)] }
        : tabWhere;
      const rows = await database.patientAppointment.findMany({
        where,
        orderBy: [{ scheduledAt: ascending ? "asc" : "desc" }, { id: ascending ? "asc" : "desc" }],
        take: WORK_APPOINTMENT_PAGE_SIZE + 1,
        select: workAppointmentSelect(resolvedScope.hospitalId, actor.userId),
      });
      const pageRows = rows.slice(0, WORK_APPOINTMENT_PAGE_SIZE);
      records = pageRows;
      if (rows.length > WORK_APPOINTMENT_PAGE_SIZE && pageRows.length > 0) {
        const last = pageRows[pageRows.length - 1];
        if (last) {
          nextCursor = encodeWorkAppointmentCursor(
            { sortAt: last.scheduledAt, appointmentId: last.id },
            cursorContext,
          );
        }
      }
    }

    await auditNetworkRead(database, actor.userId, resolvedScope, records);
    const responsibleOptions = resolvedScope.directRead
      ? await listResponsibleOptions(database, resolvedScope.hospitalId)
      : visibleResponsibleOptions(records);

    const publicScope = toPublicHospitalScope(resolvedScope);
    return {
      hospital: publicScope,
      hospitals: scopes.map(toPublicHospitalScope),
      tab,
      filters,
      items: records.map(toWorkAppointmentItem),
      nextCursor,
      hasNextPage: nextCursor !== null,
      canCreate: publicScope.canCreate,
      canResolveRequests: publicScope.canResolveRequests,
      responsibleOptions,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Work appointments could not be loaded");
  }
}

export const workAppointmentQueryInternals = {
  activeDirectMembershipWhere,
  activeOsmAssignmentWhere,
  appointmentRelationshipReadWhere,
  bangkokDayAfter,
  bangkokDayStart,
  buildAppointmentWhere,
  resolveWorkScopes,
  toDisplayName,
  toWorkAppointmentItem,
};
