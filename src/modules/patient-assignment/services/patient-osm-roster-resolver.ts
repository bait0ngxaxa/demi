import "server-only";

import {
  HospitalStatus,
  MembershipStatus,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { decidePatientOsmAssignmentPolicy } from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import {
  PATIENT_OSM_CAREGIVER_NAME_MAX_LENGTH,
  type PatientImportDiagnosticCode,
} from "@/modules/patient-provisioning/import/patient-import-contract";
import {
  ConflictError,
} from "@/shared/errors/application-error";

import {
  assignOsmToPatientInTransaction,
  patientOsmAssignmentTransactionInternals,
  type PatientOsmAssignmentMutationResult,
} from "./patient-osm-assignment-transaction";
import { formatPatientOsmDisplayName } from "./patient-osm-assignment-query-service";

export const MAX_ROSTER_OSM_CANDIDATES = 50;

export type PatientOsmRosterResolutionStatus =
  | "OSM_NOT_APPLICABLE"
  | "OSM_MATCHED"
  | "OSM_NOT_FOUND"
  | "OSM_AMBIGUOUS"
  | "OSM_SELF_ASSIGNMENT_FORBIDDEN"
  | "OSM_DATA_INVALID";

export type PatientOsmRosterAssignmentStatus =
  | "OSM_ASSIGNMENT_READY"
  | "OSM_ASSIGNMENT_ALREADY_EXISTS"
  | "OSM_ASSIGNMENT_CONFLICT"
  | "OSM_OWNER_REQUIRED";

export type PatientOsmRosterCandidate = {
  osmUserId: string;
  displayName: string;
};

export type PatientOsmRosterCurrentAssignment = {
  osmUserId: string;
  displayName: string;
};

export type PatientOsmRosterAssignmentPreviewInternal = {
  resolutionStatus: PatientOsmRosterResolutionStatus;
  assignmentStatus: PatientOsmRosterAssignmentStatus | null;
  sourceCaregiverName: string | null;
  normalizedSourceCaregiverName: string | null;
  currentOsmUserId: string | null;
  currentCaregiverDisplayName: string | null;
  resolvedOsmUserId: string | null;
  resolvedCandidateDisplayName: string | null;
  candidates: readonly PatientOsmRosterCandidate[];
};

export type PatientOsmRosterAssignmentChoice = {
  rowNumber: number;
  resolutionStatus: "OSM_MATCHED";
  sourceCaregiverName: string;
  normalizedSourceCaregiverName: string;
  candidateOsmUserId: string;
  currentOsmUserId: string | null;
  explicitReassignment: boolean;
};

type RosterOsmResolverDatabase =
  | Pick<PrismaClient, "user">
  | Pick<Prisma.TransactionClient, "user">;

type RosterOsmResolution = {
  status: PatientOsmRosterResolutionStatus;
  normalizedSourceCaregiverName: string | null;
  rawCandidates: readonly PatientOsmRosterCandidate[];
  candidates: readonly PatientOsmRosterCandidate[];
};

const rosterOsmCandidateSelect = {
  id: true,
  person: {
    select: {
      givenName: true,
      familyName: true,
    },
  },
} satisfies Prisma.UserSelect;

export class PatientOsmRosterResolutionConflictError extends ConflictError {
  constructor(message = "OSM roster resolution is stale or requires review") {
    super(message);
    this.name = "PatientOsmRosterResolutionConflictError";
  }
}

export class PatientOsmRosterReconciliationRequiredError extends ConflictError {
  constructor() {
    super("OSM roster assignment requires an explicit reconciliation choice");
    this.name = "PatientOsmRosterReconciliationRequiredError";
  }
}

export function normalizeRosterOsmCaregiverName(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value
    .replace(/^\uFEFF/u, "")
    .normalize("NFC")
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]+/gu, " ")
    .trim();

  return normalized || null;
}

export function resolveRosterOsmCandidate(input: {
  sourceCaregiverName: string | null;
  sourceInvalid?: boolean;
  candidates: readonly PatientOsmRosterCandidate[];
  actorUserId: string;
}): RosterOsmResolution {
  const normalizedSourceCaregiverName = normalizeRosterOsmCaregiverName(
    input.sourceCaregiverName,
  );

  if (input.sourceInvalid) {
    return {
      status: "OSM_DATA_INVALID",
      normalizedSourceCaregiverName,
      rawCandidates: [],
      candidates: [],
    };
  }

  if (normalizedSourceCaregiverName === null) {
    return {
      status: "OSM_NOT_APPLICABLE",
      normalizedSourceCaregiverName: null,
      rawCandidates: [],
      candidates: [],
    };
  }

  if (normalizedSourceCaregiverName.length > PATIENT_OSM_CAREGIVER_NAME_MAX_LENGTH) {
    return {
      status: "OSM_DATA_INVALID",
      normalizedSourceCaregiverName,
      rawCandidates: [],
      candidates: [],
    };
  }

  const rawMatches = input.candidates.filter(
    (candidate) =>
      normalizeRosterOsmCaregiverName(candidate.displayName) === normalizedSourceCaregiverName,
  );
  const rawCandidates = rawMatches.slice(0, MAX_ROSTER_OSM_CANDIDATES);

  if (rawMatches.length === 0) {
    return {
      status: "OSM_NOT_FOUND",
      normalizedSourceCaregiverName,
      rawCandidates,
      candidates: [],
    };
  }

  const selectableMatches = rawMatches.filter(
    (candidate) => candidate.osmUserId !== input.actorUserId,
  );

  if (selectableMatches.length === 0) {
    return {
      status: "OSM_SELF_ASSIGNMENT_FORBIDDEN",
      normalizedSourceCaregiverName,
      rawCandidates,
      candidates: [],
    };
  }

  if (selectableMatches.length > 1) {
    return {
      status: "OSM_AMBIGUOUS",
      normalizedSourceCaregiverName,
      rawCandidates,
      candidates: selectableMatches.slice(0, MAX_ROSTER_OSM_CANDIDATES),
    };
  }

  return {
    status: "OSM_MATCHED",
    normalizedSourceCaregiverName,
    rawCandidates,
    candidates: selectableMatches,
  };
}

export async function listEligibleRosterOsmCandidates(
  database: RosterOsmResolverDatabase,
  targetHospitalId: string,
): Promise<PatientOsmRosterCandidate[]> {
  const candidates = await database.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.OSM } },
      osmHospitalRelationships: {
        some: {
          hospitalId: targetHospitalId,
          status: MembershipStatus.ACTIVE,
          hospital: { status: HospitalStatus.ACTIVE },
        },
      },
    },
    select: rosterOsmCandidateSelect,
    orderBy: [
      { person: { givenName: "asc" } },
      { person: { familyName: "asc" } },
      { id: "asc" },
    ],
  });

  return candidates.map((candidate) => ({
    osmUserId: candidate.id,
    displayName: formatPatientOsmDisplayName(candidate.person),
  }));
}

export function buildRosterOsmAssignmentPreview(input: {
  sourceCaregiverName: string | null;
  sourceDiagnostics?: readonly PatientImportDiagnosticCode[];
  currentAssignment: PatientOsmRosterCurrentAssignment | null;
  candidates: readonly PatientOsmRosterCandidate[];
  actor: ActorContext;
  targetHospitalId: string;
}): PatientOsmRosterAssignmentPreviewInternal {
  const resolution = resolveRosterOsmCandidate({
    sourceCaregiverName: input.sourceCaregiverName,
    sourceInvalid: (input.sourceDiagnostics?.length ?? 0) > 0,
    candidates: input.candidates,
    actorUserId: input.actor.userId,
  });
  const currentOsmUserId = input.currentAssignment?.osmUserId ?? null;
  const currentCaregiverDisplayName = input.currentAssignment?.displayName ?? null;
  const resolvedCandidate = resolution.status === "OSM_MATCHED"
    ? resolution.candidates[0] ?? null
    : null;
  const policyAllowsAssignment = decidePatientOsmAssignmentPolicy({
    actor: input.actor,
    capability: "patient:assign-osm",
    targetHospitalId: input.targetHospitalId,
  }).allowed;

  let assignmentStatus: PatientOsmRosterAssignmentStatus | null = null;

  if (resolvedCandidate) {
    if (currentOsmUserId === resolvedCandidate.osmUserId) {
      assignmentStatus = "OSM_ASSIGNMENT_ALREADY_EXISTS";
    } else if (!policyAllowsAssignment) {
      assignmentStatus = "OSM_OWNER_REQUIRED";
    } else if (currentOsmUserId !== null) {
      assignmentStatus = "OSM_ASSIGNMENT_CONFLICT";
    } else {
      assignmentStatus = "OSM_ASSIGNMENT_READY";
    }
  }

  return {
    resolutionStatus: resolution.status,
    assignmentStatus,
    sourceCaregiverName: resolution.normalizedSourceCaregiverName,
    normalizedSourceCaregiverName: resolution.normalizedSourceCaregiverName,
    currentOsmUserId,
    currentCaregiverDisplayName,
    resolvedOsmUserId: resolvedCandidate?.osmUserId ?? null,
    resolvedCandidateDisplayName: resolvedCandidate?.displayName ?? null,
    candidates: resolution.candidates,
  };
}

function buildNoopResult(
  relationship: { id: string; hospitalId: string },
  activeAssignment: { id: string; osmUserId: string },
): PatientOsmAssignmentMutationResult {
  return {
    operation: "NOOP",
    patientHospitalRelationshipId: relationship.id,
    hospitalId: relationship.hospitalId,
    assignmentId: activeAssignment.id,
    osmUserId: activeAssignment.osmUserId,
    previousOsmUserId: null,
  };
}

export async function reconcileRosterOsmAssignmentInTransaction(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  input: {
    patientHospitalRelationshipId: string;
    sourceCaregiverName: string | null;
    sourceDiagnostics?: readonly PatientImportDiagnosticCode[];
    choice: PatientOsmRosterAssignmentChoice | null;
  },
  now: Date,
): Promise<PatientOsmAssignmentMutationResult | null> {
  const relationship = await patientOsmAssignmentTransactionInternals.resolvePatientHospitalRelationship(
    transaction,
    input.patientHospitalRelationshipId,
  );

  const candidates = await listEligibleRosterOsmCandidates(transaction, relationship.hospitalId);
  const resolution = resolveRosterOsmCandidate({
    sourceCaregiverName: input.sourceCaregiverName,
    sourceInvalid: (input.sourceDiagnostics?.length ?? 0) > 0,
    candidates,
    actorUserId: actor.userId,
  });

  if (resolution.status === "OSM_NOT_APPLICABLE") {
    return null;
  }

  if (resolution.status !== "OSM_MATCHED") {
    throw new PatientOsmRosterResolutionConflictError();
  }

  const activeAssignment = await patientOsmAssignmentTransactionInternals.resolveActiveAssignment(
    transaction,
    relationship.id,
  );
  const selectedCandidateId = input.choice?.candidateOsmUserId ??
    (resolution.status === "OSM_MATCHED" ? resolution.candidates[0]?.osmUserId : undefined);
  const selectedCandidate = selectedCandidateId
    ? resolution.candidates.find(({ osmUserId }) => osmUserId === selectedCandidateId)
    : undefined;

  if (!selectedCandidate) {
    throw new PatientOsmRosterResolutionConflictError();
  }

  if (activeAssignment?.osmUserId === selectedCandidate.osmUserId) {
    const policyAllowsAssignment = decidePatientOsmAssignmentPolicy({
      actor,
      capability: "patient:assign-osm",
      targetHospitalId: relationship.hospitalId,
    }).allowed;

    if (!policyAllowsAssignment) {
      return buildNoopResult(relationship, activeAssignment);
    }

    return assignOsmToPatientInTransaction(
      transaction,
      actor,
      {
        patientHospitalRelationshipId: relationship.id,
        osmUserId: selectedCandidate.osmUserId,
      },
      now,
    );
  }

  if (!input.choice) {
    throw new PatientOsmRosterReconciliationRequiredError();
  }

  if (
    input.choice.resolutionStatus !== resolution.status ||
    input.choice.normalizedSourceCaregiverName !== resolution.normalizedSourceCaregiverName ||
    input.choice.sourceCaregiverName !== resolution.normalizedSourceCaregiverName ||
    input.choice.currentOsmUserId !== (activeAssignment?.osmUserId ?? null)
  ) {
    throw new PatientOsmRosterResolutionConflictError();
  }

  if (activeAssignment && !input.choice.explicitReassignment) {
    throw new PatientOsmRosterReconciliationRequiredError();
  }

  if (!activeAssignment && input.choice.explicitReassignment) {
    throw new PatientOsmRosterReconciliationRequiredError();
  }

  return assignOsmToPatientInTransaction(
    transaction,
    actor,
    {
      patientHospitalRelationshipId: relationship.id,
      osmUserId: selectedCandidate.osmUserId,
    },
    now,
  );
}

export const patientOsmRosterResolverInternals = {
  buildNoopResult,
  rosterOsmCandidateSelect,
};
