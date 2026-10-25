import "server-only";

import { loadAssignedOsmPhone } from "./assigned-osm-phone";

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
  PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS,
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

export type PatientOsmBulkAssignmentView = {
  hospital: PatientOsmAssignmentScope;
  /** Patients of the Hospital with no current OSM, capped at the bulk batch size. */
  patients: PatientDirectoryItem[];
  /** Number of patients without a current OSM in the Hospital (may exceed `patients`). */
  totalWithoutOsm: number;
};

export type PatientOsmBulkCandidatePage = {
  candidates: PatientOsmCandidate[];
  /** More eligible OSMs match than are listed; the owner narrows the name search. */
  hasMore: boolean;
  /** Pass back as `cursor` to read the next page; null on the last page. */
  nextCursor: string | null;
};

const OSM_CANDIDATE_PAGE_SIZE = 25;

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

function buildOwnerHospitalWhere(actorUserId: string): Prisma.HospitalWhereInput {
  return {
    status: HospitalStatus.ACTIVE,
    memberships: {
      some: {
        userId: actorUserId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.HOSPITAL } },
        },
      },
    },
  };
}

function buildPatientRelationshipForOwner(
  actorUserId: string,
  relationshipId: string,
): Prisma.PatientHospitalRelationshipWhereInput {
  return {
    id: relationshipId,
    ...activePatientHospitalRelationshipWhere,
    hospital: buildOwnerHospitalWhere(actorUserId),
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
      where: buildPatientRelationshipForOwner(actor.userId, parsedRelationshipId.data),
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

/**
 * Active OSM accounts with an active relationship to one Hospital, optionally narrowed by
 * name. The single and the bulk selector share this filter; callers authorize the
 * Hospital first.
 */
async function findEligibleOsmCandidates(
  database: PatientOsmAssignmentQueryDatabase,
  input: { hospitalId: string; value?: string; excludeUserId?: string; cursor?: string },
): Promise<PatientOsmBulkCandidatePage> {
  const where: Prisma.UserWhereInput = {
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

  if (input.cursor) {
    // A cursor is only valid inside the same hospital / search / eligibility filter.
    const cursorRecord = await database.user.findFirst({
      where: { AND: [where, { id: input.cursor }] },
      select: { id: true },
    });

    if (!cursorRecord) {
      throw new ValidationError("OSM candidate cursor is invalid");
    }
  }

  const records = await database.user.findMany({
    where,
    select: { id: true, person: { select: { givenName: true, familyName: true } }, osmHospitalRelationships: { where: { hospitalId: input.hospitalId, status: MembershipStatus.ACTIVE }, select: { contactPhone: true }, take: 1 } },
    orderBy: [{ person: { givenName: "asc" } }, { person: { familyName: "asc" } }, { id: "asc" }],
    take: OSM_CANDIDATE_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const page = records.slice(0, OSM_CANDIDATE_PAGE_SIZE);
  const hasMore = records.length > OSM_CANDIDATE_PAGE_SIZE;

  return {
    candidates: page.map((record) => ({
      userId: record.id,
      displayName: toDisplayName(record.person),
      contactPhone: record.osmHospitalRelationships[0]?.contactPhone ?? null,
    })),
    hasMore,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
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
      where: buildPatientRelationshipForOwner(
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

    return (
      await findEligibleOsmCandidates(database, {
        hospitalId: relationship.hospitalId,
        value: parsed.data.value,
      })
    ).candidates;
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
      where: buildOwnerHospitalWhere(actor.userId),
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
      where: { id: parsed.data.hospitalId, ...buildOwnerHospitalWhere(actor.userId) },
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
    const [records, totalWithoutOsm] = await Promise.all([
      database.patientHospitalRelationship.findMany({
        where: patientWhere,
        select: patientDirectorySelect,
        orderBy: [
          { patientProfile: { person: { givenName: "asc" } } },
          { patientProfile: { person: { familyName: "asc" } } },
          { id: "asc" },
        ],
        take: PATIENT_OSM_BULK_ASSIGNMENT_MAX_PATIENTS,
      }),
      database.patientHospitalRelationship.count({ where: patientWhere }),
    ]);

    return {
      hospital: { hospitalId: hospital.id, hospitalName: hospital.name },
      patients: records.map(toPatientDirectoryItem),
      totalWithoutOsm,
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
      where: { id: parsed.data.hospitalId, ...buildOwnerHospitalWhere(actor.userId) },
      select: { id: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    return await findEligibleOsmCandidates(database, {
      hospitalId: hospital.id,
      value: parsed.data.value,
      excludeUserId: actor.userId,
      cursor: parsed.data.cursor,
    });
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
  buildOwnerHospitalWhere,
  buildPatientRelationshipForOwner,
  toAssignmentManagementView,
  toDisplayName,
  candidateSearchMaxLength: PATIENT_OSM_CANDIDATE_SEARCH_MAX_LENGTH,
};
