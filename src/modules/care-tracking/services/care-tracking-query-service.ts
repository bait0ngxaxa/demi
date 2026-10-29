import "server-only";

import {
  HospitalStatus,
  MembershipType,
  PatientProgramStatus,
  Prisma,
  Role,
  type AppointmentType,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  buildNetworkReadableChildHospitalWhere,
  findNetworkChild,
  recordNetworkPatientRead,
} from "@/modules/hospital-service-areas/services/hospital-network-access";
import {
  decidePatientBaselinePolicy,
  PATIENT_BASELINE_CREATE_CAPABILITY,
} from "@/modules/patient-baseline/policies/patient-baseline-policy";
import {
  decideOsmAssignedPatientReadPolicy,
  decidePatientReadPolicy,
  PATIENT_READ_CAPABILITY,
} from "@/modules/patient-directory/policies/patient-directory-policy";
import {
  buildAuthorizedHospitalWhere,
  buildNameWhere,
  buildOsmActiveHospitalWhere,
  buildOsmAssignedPatientRelationshipWhere,
  patientResponsibleOsmSelect,
  toDisplayName,
  toPatientResponsibleOsmProjection,
} from "@/modules/patient-directory/services/patient-directory-query-service";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import {
  decidePatientProgramPolicy,
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
} from "@/modules/patient-program/policies/patient-program-policy";
import { roundTitle } from "@/modules/patient-program-rounds/domain/round-catalog";
import {
  computeRoundStatus,
  roundPlan,
  type RoundState,
  type RoundStepState,
} from "@/modules/patient-program-rounds/domain/round-steps";
import {
  buildProgramRoundFacts,
  buildProgramRoundsOverview,
  programRoundSelect,
  type ProgramRoundRecord,
  type RoundReadOptions,
} from "@/modules/patient-program-rounds/services/round-query-service";
import {
  ForbiddenError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import { resolvePatientCareNextStep, type PatientCareNextStep } from "../domain/care-next-step";
import {
  CARE_SIGNALS,
  CARE_STAGE_LABELS,
  CARE_STAGES,
  deriveCareSignals,
  deriveCareStage,
  ENDED_CARE_STAGES,
  hasAnyCareSignal,
  type CareSignal,
  type CareSignals,
  type CareStage,
} from "../domain/care-stage";
import {
  CARE_TRACKING_PAGE_SIZE,
  careTrackingQuerySchema,
  type CareTrackingQueryInput,
} from "../schemas/care-tracking-schemas";

export type CareTrackingDatabase = PrismaClient | Prisma.TransactionClient;

export type CareTrackingQueryDependencies = {
  database?: CareTrackingDatabase;
  now?: () => Date;
};

export type CareTrackingCurrentRound = {
  roundNumber: number;
  title: string;
  doneItems: number;
  plannedItems: number;
  /** The round's plan for the timeline; recorder names are hidden for a network read. */
  steps: readonly RoundStepState[];
};

export type CareTrackingRoundStripEntry = {
  roundNumber: number;
  state: RoundState;
};

export type CareTrackingItem = {
  relationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  /** Null when unassigned, unavailable or for a network read (the patient page restricts it the same way). */
  assignedOsmDisplayName: string | null;
  stage: CareStage;
  stageLabel: string;
  signals: CareSignals;
  lastActivityAt: Date | null;
  nextAppointment: { scheduledAt: Date; type: AppointmentType } | null;
  nextStep: PatientCareNextStep;
  /** The active Program's open round; null otherwise. */
  currentRound: CareTrackingCurrentRound | null;
  /** Every opened round of the active Program; empty without one. */
  roundStrip: readonly CareTrackingRoundStripEntry[];
};

export type CareTrackingSummary = {
  /** Patients in scope after the search and the ended filter, before the stage/signal filters. */
  total: number;
  stages: Readonly<Record<CareStage, number>>;
  signals: Readonly<Record<CareSignal, number>>;
};

export type CareTrackingPage = {
  hospital: { id: string; name: string; access: "DIRECT" | "NETWORK" };
  summary: CareTrackingSummary;
  items: CareTrackingItem[];
  page: number;
  pageSize: number;
  /** Patients matching every filter. */
  total: number;
  totalPages: number;
};

type CareTrackingScope = {
  hospital: { id: string; name: string };
  access: "DIRECT" | "NETWORK";
  where: Prisma.PatientHospitalRelationshipWhereInput;
};

/** Per-relationship facts computed by the coarse statement. */
type CoarseRow = {
  relationshipId: string;
  baselineRecorded: boolean;
  activeProgramId: string | null;
  openedRounds: number;
  completedRounds: number;
  currentOpenRound: number | null;
  finalAssessmentRecorded: boolean;
  completedProgramExists: boolean;
  lastActivityAt: Date | null;
  nextAppointmentAt: Date | null;
  nextAppointmentType: AppointmentType | null;
  hasOverdueAppointment: boolean;
};

type TrackedPatient = {
  relationshipId: string;
  givenName: string;
  familyName: string;
  displayName: string;
  hospitalNumber: string | null;
  careEnded: boolean;
  coarse: CoarseRow;
  stage: CareStage;
  signals: CareSignals;
};

const NETWORK_READ: RoundReadOptions = { recorderNames: false };
const STAFF_READ: RoundReadOptions = { recorderNames: true };

const patientRoleWhere = {
  patientProfile: { person: { user: { roles: { some: { role: Role.PATIENT } } } } },
} satisfies Prisma.PatientHospitalRelationshipWhereInput;

const scopeRelationshipSelect = {
  id: true,
  hospitalNumber: true,
  endedAt: true,
  patientProfile: { select: { person: { select: { givenName: true, familyName: true } } } },
} satisfies Prisma.PatientHospitalRelationshipSelect;

function getDatabase(dependencies: CareTrackingQueryDependencies): CareTrackingDatabase {
  return dependencies.database ?? getPrisma();
}

function parseQuery(input: unknown): CareTrackingQueryInput {
  const parsed = careTrackingQuerySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Care tracking query data is invalid");
  }

  return parsed.data;
}

/** The directory's lookup rules in one box: every name term, or the exact HN. */
function buildSearchWhere(search: string | undefined): Prisma.PatientHospitalRelationshipWhereInput {
  return search
    ? { OR: [{ hospitalNumber: search }, { patientProfile: { person: buildNameWhere(search) } }] }
    : {};
}

/**
 * Scope from the existing read builders only: direct OWNER/MEMBER, an assigned OSM, or one network Child read
 * through an exact Parent (ADR-0016, audited). Ended care relationships are added only when the database proves
 * the actor is the Hospital's OWNER (Phase F ก-18, like the report cohort INCLUDE_ENDED).
 */
async function resolveScope(
  database: CareTrackingDatabase,
  actor: ActorContext,
  input: CareTrackingQueryInput,
): Promise<CareTrackingScope> {
  if (input.childHospitalId) {
    if (!actor.roles.includes(Role.HOSPITAL)) {
      throw new ForbiddenError();
    }

    const area = await findNetworkChild(database, actor.userId, input.hospitalId, input.childHospitalId, "PATIENT_READ");
    if (!area) {
      throw new ForbiddenError();
    }

    await recordNetworkPatientRead(database, {
      actorUserId: actor.userId,
      parentHospitalId: area.parent.id,
      childHospitalId: area.child.id,
      resourceType: "Hospital",
      resourceId: area.child.id,
      scope: "care-tracking",
    });

    return {
      hospital: { id: area.child.id, name: area.child.name },
      access: "NETWORK",
      where: {
        ...activePatientHospitalRelationshipWhere,
        ...patientRoleWhere,
        hospitalId: area.child.id,
        hospital: buildNetworkReadableChildHospitalWhere(actor.userId),
      },
    };
  }

  if (decidePatientReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY, targetHospitalId: input.hospitalId }).allowed) {
    const hospitalWhere = buildAuthorizedHospitalWhere(actor.userId);
    const hospital = await database.hospital.findFirst({
      where: { id: input.hospitalId, ...hospitalWhere },
      select: { id: true, name: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    return {
      hospital,
      access: "DIRECT",
      where: {
        ...patientRoleWhere,
        hospitalId: hospital.id,
        hospital: hospitalWhere,
        ...(input.includeEnded
          ? { OR: [activePatientHospitalRelationshipWhere, { hospital: buildAuthorizedHospitalWhere(actor.userId, [MembershipType.OWNER]) }] }
          : activePatientHospitalRelationshipWhere),
      },
    };
  }

  if (decideOsmAssignedPatientReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY }).allowed) {
    const hospital = await database.hospital.findFirst({
      where: { id: input.hospitalId, ...buildOsmActiveHospitalWhere(actor.userId) },
      select: { id: true, name: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    return {
      hospital,
      access: "DIRECT",
      where: { ...buildOsmAssignedPatientRelationshipWhere(actor.userId), hospitalId: hospital.id },
    };
  }

  throw new ForbiddenError();
}

/**
 * One statement for every relationship in scope. "Last care activity" is the latest of:
 * PatientBaseline.recordedOn, PatientProgram.startedAt, PatientProgramRound.openedAt,
 * PatientProgramRoundCompletion.completedAt, PatientProgramRoundVitals.recordedAt, PatientFollowup.recordedAt,
 * PatientProgramRoundActivity.performedAt and PatientFinalAssessment.recordedAt, over all of the relationship's
 * Programs. Columns without a time zone hold UTC (Prisma), so they are read AT TIME ZONE 'UTC'.
 */
function buildCoarseStatement(relationshipIds: readonly string[], now: Date): Prisma.Sql {
  return Prisma.sql`
    WITH scope AS (
      SELECT relationship."id"
      FROM "PatientHospitalRelationship" AS relationship
      WHERE relationship."id" = ANY(${[...relationshipIds]}::uuid[])
    ),
    program AS (
      SELECT patient_program."id", patient_program."patientHospitalRelationshipId", patient_program."status", patient_program."startedAt"
      FROM "PatientProgram" AS patient_program
      JOIN scope ON scope."id" = patient_program."patientHospitalRelationshipId"
    ),
    round_stats AS (
      SELECT opened_round."patientProgramId",
        COUNT(*)::int AS "openedRounds",
        COUNT(completion."id")::int AS "completedRounds",
        MIN(opened_round."roundNumber") FILTER (WHERE completion."id" IS NULL) AS "currentOpenRound"
      FROM "PatientProgramRound" AS opened_round
      JOIN program ON program."id" = opened_round."patientProgramId" AND program."status" = 'ACTIVE'
      LEFT JOIN "PatientProgramRoundCompletion" AS completion
        ON completion."patientProgramId" = opened_round."patientProgramId"
        AND completion."roundNumber" = opened_round."roundNumber"
      GROUP BY opened_round."patientProgramId"
    ),
    activity AS (
      SELECT source."relationshipId", MAX(source."at") AS "lastActivityAt"
      FROM (
        SELECT baseline."patientHospitalRelationshipId" AS "relationshipId", (baseline."recordedOn"::timestamp AT TIME ZONE 'UTC') AS "at"
        FROM "PatientBaseline" AS baseline
        JOIN scope ON scope."id" = baseline."patientHospitalRelationshipId"
        UNION ALL
        SELECT program."patientHospitalRelationshipId", program."startedAt" FROM program
        UNION ALL
        SELECT program."patientHospitalRelationshipId", opened_round."openedAt"
        FROM "PatientProgramRound" AS opened_round
        JOIN program ON program."id" = opened_round."patientProgramId"
        UNION ALL
        SELECT program."patientHospitalRelationshipId", completion."completedAt"
        FROM "PatientProgramRoundCompletion" AS completion
        JOIN program ON program."id" = completion."patientProgramId"
        UNION ALL
        SELECT program."patientHospitalRelationshipId", vitals."recordedAt"
        FROM "PatientProgramRoundVitals" AS vitals
        JOIN program ON program."id" = vitals."patientProgramId"
        UNION ALL
        SELECT followup."patientHospitalRelationshipId", (followup."recordedAt" AT TIME ZONE 'UTC')
        FROM "PatientFollowup" AS followup
        JOIN scope ON scope."id" = followup."patientHospitalRelationshipId"
        UNION ALL
        SELECT program."patientHospitalRelationshipId", round_activity."performedAt"
        FROM "PatientProgramRoundActivity" AS round_activity
        JOIN program ON program."id" = round_activity."patientProgramId"
        UNION ALL
        SELECT program."patientHospitalRelationshipId", final_assessment."recordedAt"
        FROM "PatientFinalAssessment" AS final_assessment
        JOIN program ON program."id" = final_assessment."patientProgramId"
      ) AS source
      GROUP BY source."relationshipId"
    ),
    next_appointment AS (
      SELECT DISTINCT ON (appointment."patientHospitalRelationshipId")
        appointment."patientHospitalRelationshipId" AS "relationshipId", appointment."scheduledAt", appointment."type"
      FROM "PatientAppointment" AS appointment
      JOIN scope ON scope."id" = appointment."patientHospitalRelationshipId"
      WHERE appointment."status" = 'SCHEDULED' AND appointment."scheduledAt" >= ${now}::timestamptz
      ORDER BY appointment."patientHospitalRelationshipId", appointment."scheduledAt", appointment."id"
    ),
    overdue AS (
      SELECT DISTINCT appointment."patientHospitalRelationshipId" AS "relationshipId"
      FROM "PatientAppointment" AS appointment
      JOIN scope ON scope."id" = appointment."patientHospitalRelationshipId"
      WHERE appointment."status" = 'SCHEDULED' AND appointment."scheduledAt" < ${now}::timestamptz
    )
    SELECT
      scope."id"::text AS "relationshipId",
      EXISTS (
        SELECT 1 FROM "PatientBaseline" AS baseline WHERE baseline."patientHospitalRelationshipId" = scope."id"
      ) AS "baselineRecorded",
      active_program."id"::text AS "activeProgramId",
      COALESCE(round_stats."openedRounds", 0) AS "openedRounds",
      COALESCE(round_stats."completedRounds", 0) AS "completedRounds",
      round_stats."currentOpenRound",
      (final_assessment."id" IS NOT NULL) AS "finalAssessmentRecorded",
      EXISTS (
        SELECT 1 FROM program AS completed_program
        WHERE completed_program."patientHospitalRelationshipId" = scope."id" AND completed_program."status" = 'COMPLETED'
      ) AS "completedProgramExists",
      activity."lastActivityAt",
      next_appointment."scheduledAt" AS "nextAppointmentAt",
      next_appointment."type"::text AS "nextAppointmentType",
      (overdue."relationshipId" IS NOT NULL) AS "hasOverdueAppointment"
    FROM scope
    LEFT JOIN program AS active_program
      ON active_program."patientHospitalRelationshipId" = scope."id" AND active_program."status" = 'ACTIVE'
    LEFT JOIN round_stats ON round_stats."patientProgramId" = active_program."id"
    LEFT JOIN "PatientFinalAssessment" AS final_assessment ON final_assessment."patientProgramId" = active_program."id"
    LEFT JOIN activity ON activity."relationshipId" = scope."id"
    LEFT JOIN next_appointment ON next_appointment."relationshipId" = scope."id"
    LEFT JOIN overdue ON overdue."relationshipId" = scope."id"
  `;
}

async function loadCoarseRows(
  database: CareTrackingDatabase,
  relationshipIds: readonly string[],
  now: Date,
): Promise<CoarseRow[]> {
  return database.$queryRaw<CoarseRow[]>(buildCoarseStatement(relationshipIds, now));
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function summarize(patients: readonly TrackedPatient[]): CareTrackingSummary {
  const stages = emptyCounts(CARE_STAGES);
  const signals = emptyCounts(CARE_SIGNALS);

  for (const patient of patients) {
    stages[patient.stage] += 1;
    for (const signal of CARE_SIGNALS) {
      if (patient.signals[signal]) {
        signals[signal] += 1;
      }
    }
  }

  return { total: patients.length, stages, signals };
}

const nameCollator = new Intl.Collator("th");

function compareOptionalDates(left: Date | null, right: Date | null, nulls: "first" | "last"): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return (left === null) === (nulls === "first") ? -1 : 1;
  }

  return left.getTime() - right.getTime();
}

/** Any signal first, then next appointment (soonest, none last), then last activity (oldest, none first), then name. */
function compareTrackedPatients(left: TrackedPatient, right: TrackedPatient): number {
  return (
    Number(hasAnyCareSignal(right.signals)) - Number(hasAnyCareSignal(left.signals)) ||
    compareOptionalDates(left.coarse.nextAppointmentAt, right.coarse.nextAppointmentAt, "last") ||
    compareOptionalDates(left.coarse.lastActivityAt, right.coarse.lastActivityAt, "first") ||
    nameCollator.compare(left.givenName, right.givenName) ||
    nameCollator.compare(left.familyName, right.familyName) ||
    (left.relationshipId < right.relationshipId ? -1 : left.relationshipId > right.relationshipId ? 1 : 0)
  );
}

function matchesFilters(patient: TrackedPatient, input: CareTrackingQueryInput): boolean {
  const stageMatches = !input.stages?.length || input.stages.includes(patient.stage);
  const signalMatches = !input.signals?.length || input.signals.some((signal) => patient.signals[signal]);

  return stageMatches && signalMatches;
}

function buildRoundView(
  program: ProgramRoundRecord,
  currentOpenRound: number | null,
  options: RoundReadOptions,
): { currentRound: CareTrackingCurrentRound | null; roundStrip: CareTrackingRoundStripEntry[] } {
  const facts = buildProgramRoundFacts(program, options);
  const openedRounds = Object.keys(facts.rounds).map(Number).sort((left, right) => left - right);
  const roundStrip = openedRounds.map((roundNumber) => ({
    roundNumber,
    state: computeRoundStatus(facts, roundNumber, roundPlan(facts, roundNumber)).state,
  }));

  if (currentOpenRound === null) {
    return { currentRound: null, roundStrip };
  }

  const status = computeRoundStatus(facts, currentOpenRound, roundPlan(facts, currentOpenRound));

  return {
    currentRound: {
      roundNumber: currentOpenRound,
      title: roundTitle(currentOpenRound),
      doneItems: status.steps.filter((step) => step.status === "DONE").length,
      plannedItems: status.steps.length,
      steps: status.steps,
    },
    roundStrip,
  };
}

/** Fine level for the page only: one batched load of assignments and active Program rounds. */
async function loadPageItems(
  database: CareTrackingDatabase,
  actor: ActorContext,
  scope: CareTrackingScope,
  patients: readonly TrackedPatient[],
): Promise<CareTrackingItem[]> {
  if (patients.length === 0) {
    return [];
  }

  const relationshipIds = patients.map((patient) => patient.relationshipId);
  const [assignments, programs] = await Promise.all([
    database.patientHospitalRelationship.findMany({
      where: { id: { in: relationshipIds } },
      select: { id: true, ...patientResponsibleOsmSelect(scope.hospital.id) },
    }),
    database.patientProgram.findMany({
      where: { patientHospitalRelationshipId: { in: relationshipIds }, status: PatientProgramStatus.ACTIVE },
      select: programRoundSelect,
    }),
  ]);
  const assignmentById = new Map(assignments.map((record) => [record.id, record.osmAssignments[0]]));
  const programByRelationshipId = new Map(programs.map((program) => [program.patientHospitalRelationshipId, program]));
  const options = scope.access === "NETWORK" ? NETWORK_READ : STAFF_READ;

  return patients.map((patient): CareTrackingItem => {
    const assignment = assignmentById.get(patient.relationshipId);
    const program = programByRelationshipId.get(patient.relationshipId) ?? null;
    const responsibleOsm = toPatientResponsibleOsmProjection(assignment);
    const target = {
      hospitalId: scope.hospital.id,
      hospitalStatus: HospitalStatus.ACTIVE,
      assignedOsmUserId: assignment?.osmUserId ?? null,
    };
    // CTA hints only; every write re-checks its own policy. Ended care and network reads never write.
    const writable = scope.access === "DIRECT" && !patient.careEnded;
    const canManage = writable && decidePatientProgramPolicy({ actor, capability: PATIENT_PROGRAM_MANAGE_CAPABILITY, target }).allowed;
    const canCreateBaseline = writable && !patient.coarse.baselineRecorded &&
      decidePatientBaselinePolicy({ actor, capability: PATIENT_BASELINE_CREATE_CAPABILITY, target }).allowed;
    const rounds = program ? buildRoundView(program, patient.coarse.currentOpenRound, options) : null;

    return {
      relationshipId: patient.relationshipId,
      displayName: patient.displayName,
      hospitalNumber: patient.hospitalNumber,
      assignedOsmDisplayName:
        scope.access === "DIRECT" && responsibleOsm.status === "ASSIGNED" ? responsibleOsm.displayName : null,
      stage: patient.stage,
      stageLabel: CARE_STAGE_LABELS[patient.stage],
      signals: patient.signals,
      lastActivityAt: patient.coarse.lastActivityAt,
      nextAppointment:
        patient.coarse.nextAppointmentAt && patient.coarse.nextAppointmentType
          ? { scheduledAt: patient.coarse.nextAppointmentAt, type: patient.coarse.nextAppointmentType }
          : null,
      nextStep: resolvePatientCareNextStep({
        access: scope.access,
        baselineExists: patient.coarse.baselineRecorded,
        canCreateBaseline,
        activeProgram: program ? { programId: program.id, canManage } : null,
        canOpenProgram: canManage && program === null,
        roundsOverview: program ? buildProgramRoundsOverview(program, options) : null,
      }),
      currentRound: rounds?.currentRound ?? null,
      roundStrip: rounds?.roundStrip ?? [],
    };
  });
}

/**
 * CT-1 read model of the "จัดบริการ" workspace. A fixed number of SQL statements per request: scope proof
 * (and the network audit), the in-scope relationships, one coarse statement for all of them, and one batched
 * load for the page. Stage, signals, counts, sort and paging are computed over every in-scope patient.
 */
export async function getCareTrackingPage(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: CareTrackingQueryDependencies = {},
): Promise<CareTrackingPage> {
  const parsed = parseQuery(input);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies);
    const now = dependencies.now?.() ?? new Date();
    const scope = await resolveScope(database, actor, parsed);
    const relationships = await database.patientHospitalRelationship.findMany({
      where: { AND: [scope.where, buildSearchWhere(parsed.search)] },
      select: scopeRelationshipSelect,
    });
    const coarseRows = relationships.length > 0
      ? await loadCoarseRows(database, relationships.map((relationship) => relationship.id), now)
      : [];
    const coarseById = new Map(coarseRows.map((row) => [row.relationshipId, row]));

    const visible = relationships.flatMap((relationship): TrackedPatient[] => {
      const coarse = coarseById.get(relationship.id);
      if (!coarse) {
        return [];
      }

      const careEnded = relationship.endedAt !== null;
      const stage = deriveCareStage({
        careEnded,
        baselineRecorded: coarse.baselineRecorded,
        activeProgram: coarse.activeProgramId
          ? {
              openedRounds: coarse.openedRounds,
              completedRounds: coarse.completedRounds,
              currentOpenRound: coarse.currentOpenRound,
              finalAssessmentRecorded: coarse.finalAssessmentRecorded,
            }
          : null,
        completedProgramExists: coarse.completedProgramExists,
      });

      // CT-D5: completed Programs and ended care are hidden unless asked for.
      if (ENDED_CARE_STAGES.has(stage) && !parsed.includeEnded) {
        return [];
      }

      const person = relationship.patientProfile.person;

      return [{
        relationshipId: relationship.id,
        givenName: person.givenName?.trim() ?? "",
        familyName: person.familyName?.trim() ?? "",
        displayName: toDisplayName(person),
        hospitalNumber: relationship.hospitalNumber,
        careEnded,
        coarse,
        stage,
        signals: deriveCareSignals({
          stage,
          now,
          lastActivityAt: coarse.lastActivityAt,
          nextAppointmentAt: coarse.nextAppointmentAt,
          hasOverdueAppointment: coarse.hasOverdueAppointment,
        }),
      }];
    });

    const filtered = visible.filter((patient) => matchesFilters(patient, parsed)).sort(compareTrackedPatients);
    const totalPages = Math.max(1, Math.ceil(filtered.length / CARE_TRACKING_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const pagePatients = filtered.slice((page - 1) * CARE_TRACKING_PAGE_SIZE, page * CARE_TRACKING_PAGE_SIZE);

    return {
      hospital: { ...scope.hospital, access: scope.access },
      summary: summarize(visible),
      items: await loadPageItems(database, actor, scope, pagePatients),
      page,
      pageSize: CARE_TRACKING_PAGE_SIZE,
      total: filtered.length,
      totalPages,
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Care tracking could not be loaded");
  }
}

export const careTrackingQueryInternals = {
  buildCoarseStatement,
  buildSearchWhere,
  compareTrackedPatients,
  matchesFilters,
  summarize,
};
