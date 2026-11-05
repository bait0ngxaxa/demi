import "server-only";

import { loadAssignedOsmPhone } from "./assigned-osm-phone";

import {
  HospitalStatus,
  MembershipStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hospitalOperatedByWhere } from "@/modules/identity/services/hospital-authority";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  assertPatientOsmAssignmentPolicy,
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import {
  patientOsmBulkAssignmentQuerySchema,
  patientOsmBulkCandidateQuerySchema,
  patientOsmCandidateQuerySchema,
  PATIENT_OSM_BULK_ASSIGNMENT_PAGE_SIZE,
  PATIENT_OSM_BULK_CANDIDATE_PAGE_SIZE,
  PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
} from "@/modules/patient-assignment/schemas/patient-osm-assignment-schemas";
import {
  patientDirectoryRelationshipIdSchema,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";
import {
  patientDirectorySelect,
  toDisplayName as toPersonDisplayName,
  toPatientDirectoryItem,
  type PatientDirectoryItem,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

export type PatientOsmAssignmentQueryDatabase = PrismaClient;

export type PatientOsmAssignmentCountDatabase =
  | Pick<PrismaClient, "patientOsmAssignment">
  | Pick<Prisma.TransactionClient, "patientOsmAssignment">;

export type PatientOsmAssignmentQueryDependencies = {
  database?: PatientOsmAssignmentQueryDatabase;
};

export type PatientOsmAssignmentSummary = {
  assignmentId: string;
  osmUserId: string;
  osmDisplayName: string;
  contactPhone: string | null;
  assignedAt: Date;
};

export type PatientOsmAssignmentManagementView = {
  patient: PatientDirectoryItem;
  currentAssignment: PatientOsmAssignmentSummary | null;
};

export type PatientOsmCandidate = {
  userId: string;
  displayName: string;
  contactPhone: string | null;
};

export type PatientOsmAssignmentScope = {
  hospitalId: string;
  hospitalName: string;
};

/** A 1-based page of a counted list; `page` is already clamped to `1..totalPages`. */
export type PageNumberPosition = {
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type PatientOsmBulkAssignmentView = PageNumberPosition & {
  hospital: PatientOsmAssignmentScope;
  /** One page of the Hospital's patients with no current OSM. */
  patients: PatientDirectoryItem[];
  /** Number of patients without a current OSM in the Hospital across all pages. */
  totalWithoutOsm: number;
  pageSize: number;
};

export type PatientOsmBulkCandidatePage = PageNumberPosition & {
  candidates: PatientOsmCandidate[];
};

/** The single-patient selector lists the first matches only; the owner narrows the name search. */
const SINGLE_PATIENT_OSM_CANDIDATE_LIMIT = 25;

/** Clamps a requested page to the last page (page 1 when nothing matches) so rows and count agree. */
function resolvePagePosition(requestedPage: number, total: number, pageSize: number): PageNumberPosition & { skip: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  return {
    page,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    skip: (page - 1) * pageSize,
  };
}

export async function countCurrentAssignmentsForOsmInHospital(
  database: PatientOsmAssignmentCountDatabase,
  input: { osmUserId: string; hospitalId: string },
): Promise<number> {
  // This is the raw count of open assignment rows in the exact Hospital, not the filtered displayable-patient count.
  // Workforce lifecycle operations also rely on it, so do not add Patient or OSM lifecycle/read predicates here.
  return database.patientOsmAssignment.count({
    where: {
      osmUserId: input.osmUserId,
      endedAt: null,
      patientHospitalRelationship: {
        hospitalId: input.hospitalId,
      },
    },
  });
}

const assignmentManagementSelect = {
  ...patientDirectorySelect,
  osmAssignments: {
    where: { endedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      osmUserId: true,
      createdAt: true,
      osmUser: {
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
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

type AssignmentManagementRecord = Prisma.PatientHospitalRelationshipGetPayload<{
  select: typeof assignmentManagementSelect;
}>;

function getDatabase(
  dependencies: PatientOsmAssignmentQueryDependencies,
): PatientOsmAssignmentQueryDatabase {
  return dependencies.database ?? getPrisma();
}

/** ADR-0026: Hospitals the actor operates (ACTIVE OWNER or MEMBER). */
function buildOperatorHospitalWhere(actorUserId: string): Prisma.HospitalWhereInput {
  return hospitalOperatedByWhere(actorUserId);
}

function buildPatientRelationshipForOperator(
  actorUserId: string,
  relationshipId: string,
): Prisma.PatientHospitalRelationshipWhereInput {
  return {
    id: relationshipId,
    ...activePatientHospitalRelationshipWhere,
    hospital: buildOperatorHospitalWhere(actorUserId),
    patientProfile: {
      person: {
        user: { roles: { some: { role: Role.PATIENT } } },
      },
    },
  };
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

export function formatPatientOsmDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  return toPersonDisplayName(person, "ไม่ระบุชื่อ");
}

const toDisplayName = formatPatientOsmDisplayName;

function toAssignmentManagementView(
  record: AssignmentManagementRecord,
): PatientOsmAssignmentManagementView {
  const currentAssignment = record.osmAssignments[0];

  return {
    patient: toPatientDirectoryItem(record),
    currentAssignment: currentAssignment
      ? {
          assignmentId: currentAssignment.id,
          osmUserId: currentAssignment.osmUserId,
          osmDisplayName: toDisplayName(currentAssignment.osmUser.person),
          assignedAt: currentAssignment.createdAt,
          contactPhone: null,
        }
      : null,
  };
}

export async function getPatientOsmAssignmentManagementView(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientOsmAssignmentQueryDependencies = {},
): Promise<PatientOsmAssignmentManagementView> {
  const parsedRelationshipId = patientDirectoryRelationshipIdSchema.safeParse(relationshipId);

  if (!parsedRelationshipId.success) {
    throw new NotFoundError();
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const record = await getDatabase(dependencies).patientHospitalRelationship.findFirst({
      where: buildPatientRelationshipForOperator(actor.userId, parsedRelationshipId.data),
      select: assignmentManagementSelect,
    });

    if (!record) {
      throw new NotFoundError();
    }

    assertPatientOsmAssignmentPolicy({
      actor,
      capability: "patient:assign-osm",
      targetHospitalId: record.hospital.id,
    });

    const view = toAssignmentManagementView(record);
    if (view.currentAssignment) view.currentAssignment.contactPhone = await loadAssignedOsmPhone(getDatabase(dependencies), record.id, view.currentAssignment.osmUserId);
    return view;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient assignment could not be loaded");
  }
}

type EligibleOsmCandidateFilter = { hospitalId: string; value?: string; excludeUserId?: string };

/**
 * Active OSM accounts with an active relationship to one Hospital, optionally narrowed by
 * name. The single and the bulk selector share this filter; callers authorize the
 * Hospital first.
 */
function buildEligibleOsmCandidateWhere(input: EligibleOsmCandidateFilter): Prisma.UserWhereInput {
  return {
    status: UserStatus.ACTIVE,
    roles: { some: { role: Role.OSM } },
    ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
    osmHospitalRelationships: {
      some: {
        hospitalId: input.hospitalId,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
      },
    },
    person: input.value ? buildNameWhere(input.value) : {},
  };
}

const eligibleOsmCandidateOrderBy = [
  { person: { givenName: "asc" } },
  { person: { familyName: "asc" } },
  { id: "asc" },
] satisfies Prisma.UserOrderByWithRelationInput[];

async function findEligibleOsmCandidates(
  database: PatientOsmAssignmentQueryDatabase,
  input: EligibleOsmCandidateFilter & { skip: number; take: number },
): Promise<PatientOsmCandidate[]> {
  const records = await database.user.findMany({
    where: buildEligibleOsmCandidateWhere(input),
    select: { id: true, person: { select: { givenName: true, familyName: true } }, osmHospitalRelationships: { where: { hospitalId: input.hospitalId, status: MembershipStatus.ACTIVE }, select: { contactPhone: true }, take: 1 } },
    orderBy: eligibleOsmCandidateOrderBy,
    skip: input.skip,
    take: input.take,
  });

  return records.map((record) => ({
    userId: record.id,
    displayName: toDisplayName(record.person),
    contactPhone: record.osmHospitalRelationships[0]?.contactPhone ?? null,
  }));
}

export async function listPatientOsmCandidates(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentQueryDependencies = {},
): Promise<PatientOsmCandidate[]> {
  const parsed = patientOsmCandidateQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("OSM candidate search data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies);
    const relationship = await database.patientHospitalRelationship.findFirst({
      where: buildPatientRelationshipForOperator(
        actor.userId,
        parsed.data.patientHospitalRelationshipId,
      ),
      select: { hospitalId: true, hospital: { select: { id: true } } },
    });

    if (!relationship) {
      throw new NotFoundError();
    }

    assertPatientOsmAssignmentPolicy({
      actor,
      capability: "patient:assign-osm",
      targetHospitalId: relationship.hospitalId,
    });

    return await findEligibleOsmCandidates(database, {
      hospitalId: relationship.hospitalId,
      value: parsed.data.value,
      skip: 0,
      take: SINGLE_PATIENT_OSM_CANDIDATE_LIMIT,
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("OSM candidates could not be loaded");
  }
}

export async function listPatientOsmAssignmentScopes(
  actor: ActorContext | null | undefined,
  dependencies: PatientOsmAssignmentQueryDependencies = {},
): Promise<PatientOsmAssignmentScope[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const hospitals = await getDatabase(dependencies).hospital.findMany({
      where: buildOperatorHospitalWhere(actor.userId),
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return hospitals
      .filter(({ id }) =>
        decidePatientOsmAssignmentPolicy({
          actor,
          capability: PATIENT_ASSIGN_OSM_CAPABILITY,
          targetHospitalId: id,
        }).allowed,
      )
      .map(({ id, name }) => ({ hospitalId: id, hospitalName: name }));
  } catch (error: unknown) {
    throw error instanceof ApplicationError
      ? error
      : new InfrastructureError("Patient assignment scopes could not be loaded");
  }
}

/**
 * Patients of one Hospital who have no current OSM. The page is advisory: the bulk
 * action re-authorizes the owner, the OSM and every patient.
 */
export async function getPatientOsmBulkAssignmentView(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentQueryDependencies = {},
): Promise<PatientOsmBulkAssignmentView> {
  const parsed = patientOsmBulkAssignmentQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Bulk assignment query data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: "patient:assign-osm",
    targetHospitalId: parsed.data.hospitalId,
  });

  try {
    const database = getDatabase(dependencies);
    const hospital = await database.hospital.findFirst({
      where: { id: parsed.data.hospitalId, ...buildOperatorHospitalWhere(actor.userId) },
      select: { id: true, name: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    const patientWhere: Prisma.PatientHospitalRelationshipWhereInput = {
      hospitalId: hospital.id,
      ...activePatientHospitalRelationshipWhere,
      patientProfile: {
        person: {
          user: { roles: { some: { role: Role.PATIENT } } },
          ...(parsed.data.value ? buildNameWhere(parsed.data.value) : {}),
        },
      },
      osmAssignments: { none: { endedAt: null } },
    };
    // Count first so the clamped page and its rows answer the same total.
    const totalWithoutOsm = await database.patientHospitalRelationship.count({ where: patientWhere });
    const { skip, ...position } = resolvePagePosition(
      parsed.data.page,
      totalWithoutOsm,
      PATIENT_OSM_BULK_ASSIGNMENT_PAGE_SIZE,
    );
    const records = await database.patientHospitalRelationship.findMany({
      where: patientWhere,
      select: patientDirectorySelect,
      orderBy: [
        { patientProfile: { person: { givenName: "asc" } } },
        { patientProfile: { person: { familyName: "asc" } } },
        { id: "asc" },
      ],
      skip,
      take: PATIENT_OSM_BULK_ASSIGNMENT_PAGE_SIZE,
    });

    return {
      hospital: { hospitalId: hospital.id, hospitalName: hospital.name },
      patients: records.map(toPatientDirectoryItem),
      totalWithoutOsm,
      pageSize: PATIENT_OSM_BULK_ASSIGNMENT_PAGE_SIZE,
      ...position,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Bulk patient assignment could not be loaded");
  }
}

/**
 * Server-side OSM search for the bulk selector: eligible OSMs of one owned Hospital,
 * matched by name, at most one page per request. The final submission re-validates
 * the chosen OSM, so this list is advisory.
 */
export async function listPatientOsmBulkCandidates(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientOsmAssignmentQueryDependencies = {},
): Promise<PatientOsmBulkCandidatePage> {
  const parsed = patientOsmBulkCandidateQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("OSM candidate search data is invalid");
  }

  if (!actor) {
    throw new ForbiddenError();
  }

  assertPatientOsmAssignmentPolicy({
    actor,
    capability: "patient:assign-osm",
    targetHospitalId: parsed.data.hospitalId,
  });

  try {
    const database = getDatabase(dependencies);
    const hospital = await database.hospital.findFirst({
      where: { id: parsed.data.hospitalId, ...buildOperatorHospitalWhere(actor.userId) },
      select: { id: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    const filter = { hospitalId: hospital.id, value: parsed.data.value, excludeUserId: actor.userId };
    const total = await database.user.count({ where: buildEligibleOsmCandidateWhere(filter) });
    const { skip, ...position } = resolvePagePosition(
      parsed.data.page,
      total,
      PATIENT_OSM_BULK_CANDIDATE_PAGE_SIZE,
    );
    const candidates = await findEligibleOsmCandidates(database, {
      ...filter,
      skip,
      take: PATIENT_OSM_BULK_CANDIDATE_PAGE_SIZE,
    });

    return { candidates, ...position };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("OSM candidates could not be loaded");
  }
}

export const patientOsmAssignmentQueryInternals = {
  assignmentManagementSelect,
  buildNameWhere,
  buildOperatorHospitalWhere,
  buildPatientRelationshipForOperator,
  toAssignmentManagementView,
  toDisplayName,
  candidateSearchMaxLength: PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
};
