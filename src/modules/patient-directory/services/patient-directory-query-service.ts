import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import type { PatientClassificationType } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { patientHospitalAddressSelect } from "@/modules/patient-hospital-profile/domain/patient-hospital-address";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  resolveEffectivePatientHospitalProfile,
} from "@/modules/patient-hospital-profile/domain/patient-hospital-profile-values";
import {
  buildNetworkReadableChildHospitalWhere,
  findNetworkPatientReadParent,
  listNetworkScopes,
  recordNetworkPatientRead,
} from "@/modules/hospital-service-areas/services/hospital-network-access";
import {
  assertPatientReadPolicy,
  decidePatientReadPolicy,
  decideOsmAssignedPatientReadPolicy,
  assertOsmAssignedPatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  patientDirectoryQuerySchema,
  patientDirectoryRelationshipIdSchema,
  patientAssignedDirectoryQuerySchema,
  PATIENT_DIRECTORY_PAGE_SIZE,
  type PatientDirectoryLookupType,
  type PatientDirectoryClassificationFilter,
  type PatientAssignedDirectoryQueryInput,
  type PatientDirectoryQueryInput,
  workforceOsmPatientListQuerySchema,
  type WorkforceOsmPatientListQueryInput,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";
import {
  decideWorkforcePolicy,
  WORKFORCE_CAPABILITIES,
} from "@/modules/workforce/policies/workforce-policy";

export type PatientDirectoryDatabase = PrismaClient | Prisma.TransactionClient;

export type PatientDirectoryScope = {
  hospitalId: string;
  hospitalName: string;
  /** ADR-0016: NETWORK scopes are read-only Child Hospitals of a Parent the actor reads for. */
  access: "DIRECT" | "NETWORK";
};

export type PatientDirectoryItem = {
  patientProfileId: string;
  patientHospitalRelationshipId: string;
  displayName: string;
  hospital: {
    id: string;
    name: string;
  };
  hospitalNumber: string | null;
  classification: PatientClassificationType | null;
  selfRegisteredAt: Date | null;
};

export type PatientProfileDetail = {
  dateOfBirth: Date | null;
  gender: string | null;
  phoneNumber: string | null;
  addressText: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  occupation: string | null;
  educationLevel: string | null;
};

export type PatientDirectoryDetail = PatientDirectoryItem & {
  profile: PatientProfileDetail;
  profileSource: "HOSPITAL_LOCAL" | "LEGACY_FALLBACK";
  /** ADR-0016: NETWORK detail is read-only; callers must not offer any write action. */
  access: "DIRECT" | "NETWORK";
};

export type PatientDirectorySummary = PatientDirectoryItem & {
  /** ADR-0016: NETWORK detail is read-only; callers must not offer any write action. */
  access: "DIRECT" | "NETWORK";
};

export type PatientDirectoryPage = {
  hospital: PatientDirectoryScope;
  items: PatientDirectoryItem[];
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  classificationFilter: PatientDirectoryClassificationFilter;
  selfRegistrationFilter: "ALL" | "SELF_REGISTERED";
};

/** Lets the follow-up task open the active Program, as the follow-up history CTA does. */
export type PatientAssignedDirectoryItem = PatientDirectoryItem & {
  activeProgramId: string | null;
};

export type PatientAssignedDirectoryPage = {
  items: PatientAssignedDirectoryItem[];
  lookupType: PatientDirectoryLookupType;
  value: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  classificationFilter: PatientDirectoryClassificationFilter;
  /**
   * Present when the roster is narrowed to one Hospital. `hospitalName` is null when the locator is not one
   * of the actor's active OSM Hospitals; the narrowed roster is then empty (fail closed, never unfiltered).
   */
  hospitalFilter: { hospitalId: string; hospitalName: string | null } | null;
};

export type WorkforceOsmPatientPage = {
  items: WorkforceOsmPatientItem[];
  hospital: { id: string; name: string };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type WorkforceOsmPatientItem = Pick<
  PatientDirectoryItem,
  "patientHospitalRelationshipId" | "displayName" | "hospital" | "hospitalNumber"
>;

export type PatientResponsibleOsmProjection =
  | { status: "ASSIGNED"; displayName: string; assignedAt: Date }
  | { status: "UNASSIGNED" }
  | { status: "RESTRICTED" }
  | { status: "UNAVAILABLE" };

export type PatientDirectoryQueryDependencies = {
  database?: PatientDirectoryDatabase;
};

export const patientDirectorySelect = {
  id: true,
  hospitalNumber: true,
  selfRegisteredAt: true,
  hospital: {
    select: {
      id: true,
      name: true,
    },
  },
  patientProfile: {
    select: {
      id: true,
      patientClassification: {
        select: { classification: true },
      },
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

const assignedPatientDirectorySelect = {
  ...patientDirectorySelect,
  programs: {
    where: { status: PatientProgramStatus.ACTIVE },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

const workforceOsmPatientSelect = {
  id: true,
  hospitalNumber: true,
  hospital: { select: { id: true, name: true } },
  patientProfile: {
    select: {
      person: { select: { givenName: true, familyName: true } },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

export const patientDetailSelect = {
  id: true,
  hospitalNumber: true,
  selfRegisteredAt: true,
  hospital: {
    select: {
      id: true,
      name: true,
    },
  },
  hospitalProfile: {
    select: {
      ...patientHospitalAddressSelect,
      emergencyContactRelationship: true,
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      version: true,
    },
  },
  patientProfile: {
    select: {
      id: true,
      patientClassification: {
        select: { classification: true },
      },
      dateOfBirth: true,
      gender: true,
      phoneNumber: true,
      addressText: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      occupation: true,
      educationLevel: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

export function patientResponsibleOsmSelect(hospitalId: string) {
  return {
    osmAssignments: {
      where: { endedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        osmUserId: true,
        createdAt: true,
        osmUser: {
          select: {
            status: true,
            roles: { where: { role: Role.OSM }, select: { role: true } },
            person: {
              select: { givenName: true, familyName: true },
            },
            osmHospitalRelationships: {
              where: buildCurrentOsmHospitalRelationshipWhere(hospitalId),
              orderBy: [{ id: "asc" }],
              take: 1,
              select: { status: true, hospital: { select: { status: true } } },
            },
          },
        },
      },
    },
  } satisfies Prisma.PatientHospitalRelationshipSelect;
}

type PatientResponsibleOsmAssignmentRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: ReturnType<typeof patientResponsibleOsmSelect>;
}>["osmAssignments"][number];

/** The current assignment counts only while its OSM is active, holds the role and serves the Hospital. */
export function toPatientResponsibleOsmProjection(
  currentAssignment: PatientResponsibleOsmAssignmentRecord | undefined,
): PatientResponsibleOsmProjection {
  if (!currentAssignment) {
    return { status: "UNASSIGNED" };
  }

  const hasEligibleHospitalRelationship = currentAssignment.osmUser.osmHospitalRelationships.some(
    (relationship) =>
      relationship.status === MembershipStatus.ACTIVE &&
      relationship.hospital.status === HospitalStatus.ACTIVE,
  );
  const isCurrentOsm =
    currentAssignment.osmUser.status === UserStatus.ACTIVE &&
    currentAssignment.osmUser.roles.length > 0 &&
    hasEligibleHospitalRelationship;

  if (!isCurrentOsm) {
    return { status: "UNAVAILABLE" };
  }

  return {
    status: "ASSIGNED",
    displayName: toDisplayName(currentAssignment.osmUser.person, "ไม่ระบุชื่อ"),
    assignedAt: currentAssignment.createdAt,
  };
}

function buildCurrentOsmHospitalRelationshipWhere(
  hospitalId: string,
): Prisma.OsmHospitalRelationshipWhereInput {
  return {
    hospitalId,
    status: MembershipStatus.ACTIVE,
    hospital: { status: HospitalStatus.ACTIVE },
  };
}

export type PatientDirectoryRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientDirectorySelect;
}>;

export type PatientDirectoryDetailRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof patientDetailSelect;
}>;

type PatientDirectoryRecordLike = {
  id: string;
  hospitalNumber: string | null;
  selfRegisteredAt: Date | null;
  hospital: { id: string; name: string };
  patientProfile: {
    id: string;
    person: { givenName: string | null; familyName: string | null };
    patientClassification?: { classification: PatientClassificationType } | null;
  };
};

const patientDirectoryOrderBy = [
  { patientProfile: { person: { givenName: "asc" } } },
  { patientProfile: { person: { familyName: "asc" } } },
  { id: "asc" },
] satisfies Prisma.PatientHospitalRelationshipOrderByWithRelationInput[];

function getDatabase(database?: PatientDirectoryDatabase): PatientDirectoryDatabase {
  return database ?? getPrisma();
}

function parseDirectoryQuery(input: unknown): PatientDirectoryQueryInput {
  const parsed = patientDirectoryQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Patient directory query data is invalid");
  }

  return parsed.data;
}

function assertHospitalActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.HOSPITAL)) {
    throw new ForbiddenError();
  }
}

export function buildAuthorizedHospitalWhere(
  actorUserId: string,
  membershipTypes: readonly MembershipType[] = [MembershipType.OWNER, MembershipType.MEMBER],
): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actorUserId,
        membershipType: { in: [...membershipTypes] },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

export function buildNameWhere(value: string): Prisma.PersonWhereInput {
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

function buildPatientRelationshipWhere(
  hospitalWhere: Prisma.HospitalWhereInput,
  input: PatientDirectoryQueryInput,
): Prisma.PatientHospitalRelationshipWhereInput {
  const personWhere: Prisma.PersonWhereInput = {
    user: { roles: { some: { role: Role.PATIENT } } },
    ...(input.lookupType === "NAME" && input.value ? buildNameWhere(input.value) : {}),
  };

  return {
    ...activePatientHospitalRelationshipWhere,
    hospitalId: input.targetHospitalId,
    hospital: hospitalWhere,
    patientProfile: {
      person: personWhere,
      ...(input.classification && input.classification !== "ALL"
        ? { patientClassification: { is: { classification: input.classification } } }
        : {}),
    },
    ...(input.lookupType === "HOSPITAL_NUMBER" && input.value
      ? { hospitalNumber: input.value }
      : {}),
    ...(input.selfRegistration === "SELF_REGISTERED" ? { selfRegisteredAt: { not: null } } : {}),
  };
}

export function buildOsmActiveHospitalWhere(actorUserId: string): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    osmHospitalRelationships: {
      some: {
        userId: actorUserId,
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.OSM } },
        },
      },
    },
  };
}

function buildOsmDetailAssignedPatientRelationshipWhere(
  actorUserId: string,
  input: Pick<WorkforceOsmPatientListQueryInput, "hospitalId" | "osmUserId">,
): Prisma.PatientHospitalRelationshipWhereInput {
  return {
    ...activePatientHospitalRelationshipWhere,
    hospitalId: input.hospitalId,
    hospital: buildAuthorizedHospitalWhere(actorUserId, [MembershipType.OWNER]),
    // Patient account lifecycle is separate from the care relationship; assignment roster eligibility is
    // determined by the active Patient-Hospital relationship and current, valid OSM assignment below.
    patientProfile: {
      person: {
        user: {
          roles: { some: { role: Role.PATIENT } },
        },
      },
    },
    osmAssignments: {
      some: {
        osmUserId: input.osmUserId,
        endedAt: null,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.OSM } },
          osmHospitalRelationships: {
            some: buildCurrentOsmHospitalRelationshipWhere(input.hospitalId),
          },
        },
      },
    },
  };
}

function buildPatientDetailAccessPredicates(
  actor: ActorContext,
): Prisma.PatientHospitalRelationshipWhereInput[] {
  const predicates: Prisma.PatientHospitalRelationshipWhereInput[] = [];

  if (actor.roles.includes(Role.HOSPITAL)) {
    predicates.push({ ...activePatientHospitalRelationshipWhere, hospital: buildAuthorizedHospitalWhere(actor.userId) });
  }

  if (actor.roles.includes(Role.OSM)) {
    const osmReadDecision = decideOsmAssignedPatientReadPolicy({
      actor,
      capability: PATIENT_READ_CAPABILITY,
    });

    if (osmReadDecision.allowed) {
      predicates.push(buildOsmAssignedPatientRelationshipWhere(actor.userId));
    }
  }

  return predicates;
}

function buildPatientResponsibleOsmAccessPredicates(
  actor: ActorContext,
  hospitalId: string,
): Prisma.PatientHospitalRelationshipWhereInput[] {
  const predicates: Prisma.PatientHospitalRelationshipWhereInput[] = [];
  const patientReadDecision = decidePatientReadPolicy({
    actor,
    capability: PATIENT_READ_CAPABILITY,
    targetHospitalId: hospitalId,
  });

  if (patientReadDecision.allowed) {
    predicates.push({
      ...activePatientHospitalRelationshipWhere,
      hospital: buildAuthorizedHospitalWhere(actor.userId),
    });
  }

  if (actor.roles.includes(Role.OSM)) {
    const osmReadDecision = decideOsmAssignedPatientReadPolicy({
      actor,
      capability: PATIENT_READ_CAPABILITY,
    });

    if (osmReadDecision.allowed) {
      predicates.push({
        ...buildOsmAssignedPatientRelationshipWhere(actor.userId),
        hospitalId,
      });
    }
  }

  return predicates;
}

export function buildOsmAssignedPatientRelationshipWhere(
  actorUserId: string,
  input?: PatientAssignedDirectoryQueryInput,
): Prisma.PatientHospitalRelationshipWhereInput {
  const personWhere: Prisma.PersonWhereInput = {
    user: { roles: { some: { role: Role.PATIENT } } },
    ...(input?.lookupType === "NAME" && input.value ? buildNameWhere(input.value) : {}),
  };

  return {
    ...activePatientHospitalRelationshipWhere,
    patientProfile: {
      person: personWhere,
      ...(input?.classification && input.classification !== "ALL"
        ? { patientClassification: { is: { classification: input.classification } } }
        : {}),
    },
    hospital: buildOsmActiveHospitalWhere(actorUserId),
    // The optional Hospital locator is one more AND-ed condition; it narrows and never widens the predicate.
    ...(input?.hospitalId ? { hospitalId: input.hospitalId } : {}),
    osmAssignments: {
      some: {
        osmUserId: actorUserId,
        endedAt: null,
        osmUser: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.OSM } },
        },
      },
    },
    ...(input?.lookupType === "HOSPITAL_NUMBER" && input.value
      ? { hospitalNumber: input.value }
      : {}),
  };
}

export function toDisplayName(
  person: PatientDirectoryRecord["patientProfile"]["person"],
  fallback = "ผู้ป่วย",
): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || fallback;
}

export function toPatientDirectoryItem(record: PatientDirectoryRecordLike): PatientDirectoryItem {
  return {
    patientProfileId: record.patientProfile.id,
    patientHospitalRelationshipId: record.id,
    displayName: toDisplayName(record.patientProfile.person),
    hospital: record.hospital,
    hospitalNumber: record.hospitalNumber,
    classification: record.patientProfile.patientClassification?.classification ?? null,
    selfRegisteredAt: record.selfRegisteredAt,
  };
}

function toWorkforceOsmPatientItem(
  record: Prisma.PatientHospitalRelationshipGetPayload<{ select: typeof workforceOsmPatientSelect }>,
): WorkforceOsmPatientItem {
  return {
    patientHospitalRelationshipId: record.id,
    displayName: toDisplayName(record.patientProfile.person),
    hospital: record.hospital,
    hospitalNumber: record.hospitalNumber,
  };
}

export function toPatientDirectoryDetail(
  record: PatientDirectoryDetailRecord,
): Omit<PatientDirectoryDetail, "access"> {
  const effectiveProfile = resolveEffectivePatientHospitalProfile({
    legacy: {
      gender: record.patientProfile.gender,
      phoneNumber: record.patientProfile.phoneNumber,
      addressText: record.patientProfile.addressText,
      emergencyContactName: record.patientProfile.emergencyContactName,
      emergencyContactPhone: record.patientProfile.emergencyContactPhone,
      occupation: record.patientProfile.occupation,
      educationLevel: record.patientProfile.educationLevel,
    },
    local: record.hospitalProfile,
  });

  return {
    ...toPatientDirectoryItem(record),
    profileSource: effectiveProfile.source,
    profile: {
      dateOfBirth: record.patientProfile.dateOfBirth,
      ...effectiveProfile.values,
      emergencyContactRelationship: effectiveProfile.emergencyContactRelationship,
    },
  };
}

async function resolveAuthorizedHospital(
  database: PatientDirectoryDatabase,
  hospitalWhere: Prisma.HospitalWhereInput,
  hospitalId: string,
  access: PatientDirectoryScope["access"],
): Promise<PatientDirectoryScope> {
  const hospital = await database.hospital.findFirst({
    where: {
      id: hospitalId,
      ...hospitalWhere,
    },
    select: { id: true, name: true },
  });

  if (!hospital) {
    throw new ForbiddenError();
  }

  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    access,
  };
}

export async function listPatientDirectoryScopes(
  actor: ActorContext | null | undefined,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientDirectoryScope[]> {
  assertHospitalActor(actor);

  try {
    const database = getDatabase(dependencies.database);
    const scopes = await database.hospital.findMany({
      where: buildAuthorizedHospitalWhere(actor.userId),
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const direct: PatientDirectoryScope[] = scopes.map((scope) => ({
      hospitalId: scope.id,
      hospitalName: scope.name,
      access: "DIRECT",
    }));
    // ADR-0016: Children of networks the actor reads for, after direct scopes and never duplicating them.
    const directIds = new Set(direct.map(({ hospitalId }) => hospitalId));
    const network = (await listNetworkScopes(database, actor.userId, "PATIENT_READ"))
      .flatMap(({ children }) => children)
      .filter(({ id }) => !directIds.has(id))
      .map(({ id, name }): PatientDirectoryScope => ({ hospitalId: id, hospitalName: name, access: "NETWORK" }));

    return [...direct, ...network];
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient directory Hospitals could not be loaded");
  }
}

export async function findPatientDirectory(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientDirectoryPage> {
  const parsed = parseDirectoryQuery(input);
  const decision = decidePatientReadPolicy({
    actor,
    capability: PATIENT_READ_CAPABILITY,
    targetHospitalId: parsed.targetHospitalId,
  });

  if (!actor || (!decision.allowed && decision.reason !== "active_direct_hospital_scope_required")) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies.database);
    let access: PatientDirectoryScope["access"] = "DIRECT";
    let hospitalWhere = buildAuthorizedHospitalWhere(actor.userId);
    if (!decision.allowed) {
      // ADR-0016: read-only list of an active network Child, proven in SQL and audited per read.
      const parent = await findNetworkPatientReadParent(database, actor.userId, parsed.targetHospitalId);
      if (!parent) throw new ForbiddenError();
      await recordNetworkPatientRead(database, {
        actorUserId: actor.userId,
        parentHospitalId: parent.id,
        childHospitalId: parsed.targetHospitalId,
        resourceType: "Hospital",
        resourceId: parsed.targetHospitalId,
        scope: "patient-directory",
      });
      access = "NETWORK";
      hospitalWhere = buildNetworkReadableChildHospitalWhere(actor.userId);
    }
    const hospital = await resolveAuthorizedHospital(
      database,
      hospitalWhere,
      parsed.targetHospitalId,
      access,
    );
    const where = buildPatientRelationshipWhere(hospitalWhere, parsed);
    const total = await database.patientHospitalRelationship.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PATIENT_DIRECTORY_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const relationships = await database.patientHospitalRelationship.findMany({
      where,
      orderBy: patientDirectoryOrderBy,
      skip: (page - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
      take: PATIENT_DIRECTORY_PAGE_SIZE,
      select: patientDirectorySelect,
    });

    return {
      hospital,
      items: relationships.map(toPatientDirectoryItem),
      lookupType: parsed.lookupType,
      value: parsed.value ?? "",
      page,
      pageSize: PATIENT_DIRECTORY_PAGE_SIZE,
      total,
      totalPages,
      classificationFilter: parsed.classification ?? "ALL",
      selfRegistrationFilter: parsed.selfRegistration ?? "ALL",
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Patient directory could not be loaded");
  }
}

export function getPatientDirectoryDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies?: PatientDirectoryQueryDependencies,
): Promise<PatientDirectoryDetail>;
export function getPatientDirectoryDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientDirectoryQueryDependencies,
  options: { includeProfile: false },
): Promise<PatientDirectorySummary>;
export function getPatientDirectoryDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientDirectoryQueryDependencies,
  options: { includeProfile: boolean },
): Promise<PatientDirectoryDetail | PatientDirectorySummary>;
export async function getPatientDirectoryDetail(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
  options: { includeProfile?: boolean } = {},
): Promise<PatientDirectoryDetail | PatientDirectorySummary> {
  const parsedRelationshipId = patientDirectoryRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  const accessPredicates = buildPatientDetailAccessPredicates(actor);

  if (accessPredicates.length === 0) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies.database);
    const relationshipWhere = {
      id: parsedRelationshipId.data,
      OR: accessPredicates,
    } satisfies Prisma.PatientHospitalRelationshipWhereInput;
    const directRelationship = options.includeProfile === false
      ? await database.patientHospitalRelationship.findFirst({
        where: relationshipWhere,
        select: patientDirectorySelect,
      }).then((record) => record ? { ...toPatientDirectoryItem(record), access: "DIRECT" as const } : null)
      : await database.patientHospitalRelationship.findFirst({
        where: relationshipWhere,
        select: patientDetailSelect,
      }).then((record) => record ? { ...toPatientDirectoryDetail(record), access: "DIRECT" as const } : null);

    if (directRelationship) {
      return directRelationship;
    }

    if (!actor.roles.includes(Role.HOSPITAL)) {
      throw new NotFoundError();
    }

    // ADR-0016: read-only detail of an active network Child's Patient, audited with the granting Parent.
    const networkRelationshipWhere = {
      id: parsedRelationshipId.data,
      ...activePatientHospitalRelationshipWhere,
      hospital: buildNetworkReadableChildHospitalWhere(actor.userId),
    } satisfies Prisma.PatientHospitalRelationshipWhereInput;
    const networkRelationship = options.includeProfile === false
      ? await database.patientHospitalRelationship.findFirst({
        where: networkRelationshipWhere,
        select: patientDirectorySelect,
      }).then((record) => record ? { ...toPatientDirectoryItem(record), access: "NETWORK" as const } : null)
      : await database.patientHospitalRelationship.findFirst({
        where: networkRelationshipWhere,
        select: patientDetailSelect,
      }).then((record) => record ? { ...toPatientDirectoryDetail(record), access: "NETWORK" as const } : null);
    const parent = networkRelationship
      ? await findNetworkPatientReadParent(database, actor.userId, networkRelationship.hospital.id)
      : null;

    if (!networkRelationship || !parent) {
      throw new NotFoundError();
    }

    await recordNetworkPatientRead(database, {
      actorUserId: actor.userId,
      parentHospitalId: parent.id,
      childHospitalId: networkRelationship.hospital.id,
      resourceType: "PatientHospitalRelationship",
      resourceId: networkRelationship.patientHospitalRelationshipId,
      scope: "patient-detail",
    });
    return networkRelationship;
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient detail could not be loaded");
  }
}

export async function getPatientResponsibleOsm(
  actor: ActorContext | null | undefined,
  input: { patientHospitalRelationshipId: unknown; hospitalId: unknown },
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientResponsibleOsmProjection> {
  const relationshipId = patientDirectoryRelationshipIdSchema.safeParse(input.patientHospitalRelationshipId);
  const hospitalId = patientDirectoryRelationshipIdSchema.safeParse(input.hospitalId);

  if (!relationshipId.success || !hospitalId.success) {
    throw new NotFoundError();
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  const accessPredicates = buildPatientResponsibleOsmAccessPredicates(actor, hospitalId.data);
  if (accessPredicates.length === 0) {
    return { status: "RESTRICTED" };
  }

  try {
    const relationship = await getDatabase(dependencies.database).patientHospitalRelationship.findFirst({
      where: {
        id: relationshipId.data,
        hospitalId: hospitalId.data,
        OR: accessPredicates,
      },
      select: patientResponsibleOsmSelect(hospitalId.data),
    });

    if (!relationship) {
      throw new NotFoundError();
    }

    return toPatientResponsibleOsmProjection(relationship.osmAssignments[0]);
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new InfrastructureError("Patient responsible OSM could not be loaded");
  }
}

function parseWorkforceOsmPatientListQuery(input: unknown): WorkforceOsmPatientListQueryInput {
  const parsed = workforceOsmPatientListQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Workforce OSM Patient list query data is invalid");
  }

  return parsed.data;
}

export async function findPatientsAssignedToOsmInHospital(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<WorkforceOsmPatientPage> {
  const parsed = parseWorkforceOsmPatientListQuery(input);
  const workforceDecision = decideWorkforcePolicy({
    actor,
    capability: WORKFORCE_CAPABILITIES.osmRead,
    targetHospitalId: parsed.hospitalId,
  });

  if (!workforceDecision.allowed) {
    throw new ForbiddenError();
  }

  assertPatientReadPolicy({
    actor,
    capability: PATIENT_READ_CAPABILITY,
    targetHospitalId: parsed.hospitalId,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies.database);
    const hospital = await resolveAuthorizedHospital(
      database,
      buildAuthorizedHospitalWhere(actor.userId, [MembershipType.OWNER]),
      parsed.hospitalId,
      "DIRECT",
    );
    const where = buildOsmDetailAssignedPatientRelationshipWhere(actor.userId, parsed);
    const total = await database.patientHospitalRelationship.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PATIENT_DIRECTORY_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const relationships = await database.patientHospitalRelationship.findMany({
      where,
      orderBy: patientDirectoryOrderBy,
      skip: (page - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
      take: PATIENT_DIRECTORY_PAGE_SIZE,
      select: workforceOsmPatientSelect,
    });

    return {
      items: relationships.map(toWorkforceOsmPatientItem),
      hospital: { id: hospital.hospitalId, name: hospital.hospitalName },
      page,
      pageSize: PATIENT_DIRECTORY_PAGE_SIZE,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Workforce OSM Patients could not be loaded");
  }
}

function parseAssignedDirectoryQuery(input: unknown): PatientAssignedDirectoryQueryInput {
  const parsed = patientAssignedDirectoryQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Assigned Patient directory query data is invalid");
  }

  return parsed.data;
}

export async function findAssignedPatientDirectory(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientDirectoryQueryDependencies = {},
): Promise<PatientAssignedDirectoryPage> {
  const parsed = parseAssignedDirectoryQuery(input);
  assertOsmAssignedPatientReadPolicy({
    actor,
    capability: PATIENT_READ_CAPABILITY,
  });

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies.database);
    const where = buildOsmAssignedPatientRelationshipWhere(actor.userId, parsed);
    const filteredHospital = parsed.hospitalId
      ? await database.hospital.findFirst({
        where: { id: parsed.hospitalId, ...buildOsmActiveHospitalWhere(actor.userId) },
        select: { name: true },
      })
      : null;
    const total = await database.patientHospitalRelationship.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PATIENT_DIRECTORY_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const relationships = await database.patientHospitalRelationship.findMany({
      where,
      orderBy: patientDirectoryOrderBy,
      skip: (page - 1) * PATIENT_DIRECTORY_PAGE_SIZE,
      take: PATIENT_DIRECTORY_PAGE_SIZE,
      select: assignedPatientDirectorySelect,
    });

    return {
      items: relationships.map((record) => ({
        ...toPatientDirectoryItem(record),
        activeProgramId: record.programs[0]?.id ?? null,
      })),
      lookupType: parsed.lookupType,
      value: parsed.value ?? "",
      page,
      pageSize: PATIENT_DIRECTORY_PAGE_SIZE,
      total,
      totalPages,
      classificationFilter: parsed.classification ?? "ALL",
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
      hospitalFilter: parsed.hospitalId
        ? { hospitalId: parsed.hospitalId, hospitalName: filteredHospital?.name ?? null }
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Assigned Patient directory could not be loaded");
  }
}

export const patientDirectoryInternals = {
  buildAuthorizedHospitalWhere,
  buildNameWhere,
  buildPatientRelationshipWhere,
  buildOsmAssignedPatientRelationshipWhere,
  buildOsmDetailAssignedPatientRelationshipWhere,
  buildPatientDetailAccessPredicates,
  assignedPatientDirectorySelect,
  patientResponsibleOsmSelect,
  patientDirectoryOrderBy,
  patientDirectorySelect,
  workforceOsmPatientSelect,
  patientDetailSelect,
  parseAssignedDirectoryQuery,
  parseDirectoryQuery,
  toPatientDirectoryDetail,
  toPatientDirectoryItem,
};
