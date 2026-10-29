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
  listNetworkScopes,
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
import { GUIDELINE_ROUND_COUNT, roundTitle } from "@/modules/patient-program-rounds/domain/round-catalog";
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
  ACTIVE_CARE_STAGES,
  CARE_SIGNALS,
  CARE_STAGE_LABELS,
  CARE_STAGES,
  CARE_STALE_DAYS,
  ENDED_CARE_STAGES,
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

/** The facts of one page patient, read by the tracking statement. */
type TrackedPatient = {
  relationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  careEnded: boolean;
  baselineRecorded: boolean;
  currentOpenRound: number | null;
  lastActivityAt: Date | null;
  nextAppointmentAt: Date | null;
  nextAppointmentType: AppointmentType | null;
  stage: CareStage;
  signals: CareSignals;
};

/**
 * One row per page patient, each carrying the summary and paging columns. Without a patient on the page the
 * statement still returns one row, with the patient columns null.
 */
type TrackingRow = {
  summaryTotal: number;
  stageCounts: Partial<Record<CareStage, number>>;
  overdueAppointmentCount: number;
  noUpcomingAppointmentCount: number;
  staleCount: number;
  total: number;
  page: number;
  relationshipId: string | null;
  hospitalNumber: string | null;
  givenName: string | null;
  familyName: string | null;
  careEnded: boolean;
  baselineRecorded: boolean;
  currentOpenRound: number | null;
  lastActivityAt: Date | null;
  nextAppointmentAt: Date | null;
  nextAppointmentType: AppointmentType | null;
  stage: CareStage;
  overdueAppointment: boolean;
  noUpcomingAppointment: boolean;
  stale: boolean;
};

type TrackingStatementInput = {
  now: Date;
  stages: readonly CareStage[];
  signals: readonly CareSignal[];
  includeEnded: boolean;
  page: number;
  pageSize: number;
};

const NETWORK_READ: RoundReadOptions = { recorderNames: false };
const STAFF_READ: RoundReadOptions = { recorderNames: true };
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTIVE_STAGE_VALUES = CARE_STAGES.filter((stage) => ACTIVE_CARE_STAGES.has(stage));
const ENDED_STAGE_VALUES = CARE_STAGES.filter((stage) => ENDED_CARE_STAGES.has(stage));

const patientRoleWhere = {
  patientProfile: { person: { user: { roles: { some: { role: Role.PATIENT } } } } },
} satisfies Prisma.PatientHospitalRelationshipWhereInput;

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
 * deriveCareStage over the columns "careEnded", "baselineRecorded", "hasActiveProgram", "openedRounds",
 * "completedRounds", "currentOpenRound", "finalAssessmentRecorded" and "completedProgramExists". Keep the two in
 * step: the integration parity test compares them on a fixture matrix.
 */
function buildCareStageCase(): Prisma.Sql {
  return Prisma.sql`CASE
      WHEN "careEnded" THEN 'CARE_ENDED'
      WHEN "hasActiveProgram" THEN CASE
        WHEN "finalAssessmentRecorded" THEN 'AWAITING_PROGRAM_END'
        WHEN "currentOpenRound" IS NOT NULL THEN
          CASE WHEN "currentOpenRound" > ${GUIDELINE_ROUND_COUNT}::int THEN 'IN_EXTRA_ROUND' ELSE 'IN_ROUND' END
        WHEN "openedRounds" >= ${GUIDELINE_ROUND_COUNT}::int AND "completedRounds" = "openedRounds" THEN 'AWAITING_AFTER'
        ELSE 'IN_ROUND'
      END
      WHEN "completedProgramExists" THEN 'PROGRAM_COMPLETED'
      WHEN "baselineRecorded" THEN 'READY_FOR_PROGRAM'
      ELSE 'NOT_STARTED'
    END`;
}

/** deriveCareSignals over "stage", "hasOverdueAppointment", "nextAppointmentAt" and "lastActivityAt". */
function buildCareSignalColumns(now: Date): Prisma.Sql {
  const staleBefore = new Date(now.getTime() - CARE_STALE_DAYS * DAY_MS);

  return Prisma.sql`
      "hasOverdueAppointment" AS "overdueAppointment",
      ("stage" = ANY(${ACTIVE_STAGE_VALUES}::text[]) AND "nextAppointmentAt" IS NULL) AS "noUpcomingAppointment",
      ("stage" = ANY(${ACTIVE_STAGE_VALUES}::text[])
        AND ("lastActivityAt" IS NULL OR "lastActivityAt" < ${staleBefore}::timestamptz)) AS "stale"`;
}

/**
 * One statement for every relationship in scope: the coarse facts, stage and signals, the summary counts, the
 * stage/signal filters, the sort and the page. "Last care activity" is the latest of:
 * PatientBaseline.recordedOn, PatientProgram.startedAt, PatientProgramRound.openedAt,
 * PatientProgramRoundCompletion.completedAt, PatientProgramRoundVitals.recordedAt, PatientFollowup.recordedAt,
 * PatientProgramRoundActivity.performedAt and PatientFinalAssessment.recordedAt, over all of the relationship's
 * Programs. Every source is timestamptz except PatientBaseline.recordedOn, a date read as midnight UTC, so the
 * result does not depend on the session TimeZone. Sort: any signal first, then next appointment (soonest, none
 * last), then last activity (oldest, none first), then name in the database collation (as the Patient directory).
 */
function buildTrackingStatement(relationshipIds: readonly string[], input: TrackingStatementInput): Prisma.Sql {
  const stageCounts = Prisma.join(
    CARE_STAGES.map((stage) => Prisma.sql`${stage}::text, COUNT(*) FILTER (WHERE tracked."stage" = ${stage}::text)`),
  );
  const signalFilter = Prisma.join(
    CARE_SIGNALS.map((signal) => {
      const column = signal === "overdueAppointment"
        ? Prisma.sql`"overdueAppointment"`
        : signal === "noUpcomingAppointment" ? Prisma.sql`"noUpcomingAppointment"` : Prisma.sql`"stale"`;
      return Prisma.sql`(${column} AND ${signal}::text = ANY(${[...input.signals]}::text[]))`;
    }),
    " OR ",
  );

  return Prisma.sql`
    WITH scope AS (
      SELECT relationship."id", relationship."endedAt", relationship."hospitalNumber", person."givenName", person."familyName"
      FROM "PatientHospitalRelationship" AS relationship
      JOIN "PatientProfile" AS profile ON profile."id" = relationship."patientProfileId"
      JOIN "Person" AS person ON person."id" = profile."personId"
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
        SELECT followup."patientHospitalRelationshipId", followup."recordedAt"
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
      WHERE appointment."status" = 'SCHEDULED' AND appointment."scheduledAt" >= ${input.now}::timestamptz
      ORDER BY appointment."patientHospitalRelationshipId", appointment."scheduledAt", appointment."id"
    ),
    overdue AS (
      SELECT DISTINCT appointment."patientHospitalRelationshipId" AS "relationshipId"
      FROM "PatientAppointment" AS appointment
      JOIN scope ON scope."id" = appointment."patientHospitalRelationshipId"
      WHERE appointment."status" = 'SCHEDULED' AND appointment."scheduledAt" < ${input.now}::timestamptz
    ),
    coarse AS (
      SELECT
        scope."id",
        scope."hospitalNumber",
        scope."givenName",
        scope."familyName",
        (scope."endedAt" IS NOT NULL) AS "careEnded",
        EXISTS (
          SELECT 1 FROM "PatientBaseline" AS baseline WHERE baseline."patientHospitalRelationshipId" = scope."id"
        ) AS "baselineRecorded",
        (active_program."id" IS NOT NULL) AS "hasActiveProgram",
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
    ),
    staged AS (
      SELECT coarse.*, ${buildCareStageCase()} AS "stage" FROM coarse
    ),
    tracked AS (
      -- CT-D5: completed Programs and ended care are hidden unless asked for.
      SELECT staged.*, ${buildCareSignalColumns(input.now)}
      FROM staged
      WHERE ${input.includeEnded}::boolean OR NOT ("stage" = ANY(${ENDED_STAGE_VALUES}::text[]))
    ),
    summary AS (
      SELECT
        COUNT(*)::int AS "summaryTotal",
        jsonb_build_object(${stageCounts}) AS "stageCounts",
        COUNT(*) FILTER (WHERE tracked."overdueAppointment")::int AS "overdueAppointmentCount",
        COUNT(*) FILTER (WHERE tracked."noUpcomingAppointment")::int AS "noUpcomingAppointmentCount",
        COUNT(*) FILTER (WHERE tracked."stale")::int AS "staleCount"
      FROM tracked
    ),
    filtered AS (
      SELECT tracked.* FROM tracked
      WHERE (cardinality(${[...input.stages]}::text[]) = 0 OR "stage" = ANY(${[...input.stages]}::text[]))
        AND (cardinality(${[...input.signals]}::text[]) = 0 OR ${signalFilter})
    ),
    ordered AS (
      SELECT filtered.*, ROW_NUMBER() OVER (
        ORDER BY
          ("overdueAppointment" OR "noUpcomingAppointment" OR "stale") DESC,
          "nextAppointmentAt" ASC NULLS LAST,
          "lastActivityAt" ASC NULLS FIRST,
          COALESCE(BTRIM("givenName"), ''),
          COALESCE(BTRIM("familyName"), ''),
          "id"
      ) AS "position"
      FROM filtered
    ),
    page_window AS (
      SELECT counted."total",
        LEAST(${input.page}::bigint, GREATEST(1, CEIL(counted."total"::numeric / ${input.pageSize}::int)))::int AS "page"
      FROM (SELECT COUNT(*)::int AS "total" FROM filtered) AS counted
    )
    SELECT
      summary."summaryTotal", summary."stageCounts", summary."overdueAppointmentCount",
      summary."noUpcomingAppointmentCount", summary."staleCount",
      page_window."total", page_window."page",
      page_row."id"::text AS "relationshipId",
      page_row."hospitalNumber", page_row."givenName", page_row."familyName",
      page_row."careEnded", page_row."baselineRecorded", page_row."currentOpenRound",
      page_row."lastActivityAt", page_row."nextAppointmentAt", page_row."nextAppointmentType",
      page_row."stage", page_row."overdueAppointment", page_row."noUpcomingAppointment", page_row."stale"
    FROM summary
    CROSS JOIN page_window
    LEFT JOIN ordered AS page_row
      ON page_row."position" > (page_window."page" - 1)::bigint * ${input.pageSize}::int
      AND page_row."position" <= page_window."page"::bigint * ${input.pageSize}::int
    ORDER BY page_row."position"
  `;
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function toSummary(row: TrackingRow | undefined): CareTrackingSummary {
  const stages = emptyCounts(CARE_STAGES);
  for (const stage of CARE_STAGES) {
    stages[stage] = Number(row?.stageCounts[stage] ?? 0);
  }

  return {
    total: row?.summaryTotal ?? 0,
    stages,
    signals: {
      overdueAppointment: row?.overdueAppointmentCount ?? 0,
      noUpcomingAppointment: row?.noUpcomingAppointmentCount ?? 0,
      stale: row?.staleCount ?? 0,
    },
  };
}

function toTrackedPatient(row: TrackingRow): TrackedPatient[] {
  if (row.relationshipId === null) {
    return [];
  }

  return [{
    relationshipId: row.relationshipId,
    displayName: toDisplayName({ givenName: row.givenName, familyName: row.familyName }),
    hospitalNumber: row.hospitalNumber,
    careEnded: row.careEnded,
    baselineRecorded: row.baselineRecorded,
    currentOpenRound: row.currentOpenRound,
    lastActivityAt: row.lastActivityAt,
    nextAppointmentAt: row.nextAppointmentAt,
    nextAppointmentType: row.nextAppointmentType,
    stage: row.stage,
    signals: {
      overdueAppointment: row.overdueAppointment,
      noUpcomingAppointment: row.noUpcomingAppointment,
      stale: row.stale,
    },
  }];
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
    const canCreateBaseline = writable && !patient.baselineRecorded &&
      decidePatientBaselinePolicy({ actor, capability: PATIENT_BASELINE_CREATE_CAPABILITY, target }).allowed;
    const rounds = program ? buildRoundView(program, patient.currentOpenRound, options) : null;

    return {
      relationshipId: patient.relationshipId,
      displayName: patient.displayName,
      hospitalNumber: patient.hospitalNumber,
      assignedOsmDisplayName:
        scope.access === "DIRECT" && responsibleOsm.status === "ASSIGNED" ? responsibleOsm.displayName : null,
      stage: patient.stage,
      stageLabel: CARE_STAGE_LABELS[patient.stage],
      signals: patient.signals,
      lastActivityAt: patient.lastActivityAt,
      nextAppointment:
        patient.nextAppointmentAt && patient.nextAppointmentType
          ? { scheduledAt: patient.nextAppointmentAt, type: patient.nextAppointmentType }
          : null,
      nextStep: resolvePatientCareNextStep({
        access: scope.access,
        baselineExists: patient.baselineRecorded,
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

export type CareTrackingScopeOption =
  | { access: "DIRECT"; hospitalId: string; hospitalName: string }
  | {
      /** ADR-0016: one read-only Child, read through the Parent `hospitalId` (CT-D3). */
      access: "NETWORK";
      hospitalId: string;
      parentHospitalName: string;
      childHospitalId: string;
      hospitalName: string;
    };

/**
 * The Hospitals the "จัดบริการ" workspace offers, from the same read builders as getCareTrackingPage: the Patient
 * directory's direct scopes (OWNER/MEMBER), then the Hospitals of an active OSM, then (CT-3) every network Child
 * the actor reads for, as the directory lists them. Every page load still re-proves the chosen scope.
 */
export async function listCareTrackingScopes(
  actor: ActorContext | null | undefined,
  dependencies: Pick<CareTrackingQueryDependencies, "database"> = {},
): Promise<CareTrackingScopeOption[]> {
  if (!actor) {
    throw new ForbiddenError();
  }

  const readsAsStaff = actor.roles.includes(Role.HOSPITAL);
  const readsAsOsm = decideOsmAssignedPatientReadPolicy({ actor, capability: PATIENT_READ_CAPABILITY }).allowed;

  if (!readsAsStaff && !readsAsOsm) {
    throw new ForbiddenError();
  }

  try {
    const database = getDatabase(dependencies);
    const hospitalSelect = { id: true, name: true } satisfies Prisma.HospitalSelect;
    const orderBy = [{ name: "asc" }, { id: "asc" }] satisfies Prisma.HospitalOrderByWithRelationInput[];
    const [staffHospitals, osmHospitals, networks] = await Promise.all([
      readsAsStaff
        ? database.hospital.findMany({ where: buildAuthorizedHospitalWhere(actor.userId), select: hospitalSelect, orderBy })
        : [],
      readsAsOsm
        ? database.hospital.findMany({ where: buildOsmActiveHospitalWhere(actor.userId), select: hospitalSelect, orderBy })
        : [],
      readsAsStaff ? listNetworkScopes(database, actor.userId, "PATIENT_READ") : [],
    ]);
    const staffIds = new Set(staffHospitals.map(({ id }) => id));
    const direct = [...staffHospitals, ...osmHospitals.filter(({ id }) => !staffIds.has(id))].map(
      (hospital): CareTrackingScopeOption => ({ access: "DIRECT", hospitalId: hospital.id, hospitalName: hospital.name }),
    );
    // ADR-0016: Children after direct scopes and never duplicating a Hospital the actor reads directly.
    const network = networks.flatMap(({ parent, children }) => children
      .filter(({ id }) => !staffIds.has(id))
      .map((child): CareTrackingScopeOption => ({
        access: "NETWORK",
        hospitalId: parent.id,
        parentHospitalName: parent.name,
        childHospitalId: child.id,
        hospitalName: child.name,
      })));

    return [...direct, ...network];
  } catch {
    throw new InfrastructureError("Care tracking scopes could not be loaded");
  }
}

/**
 * CT-1 read model of the "จัดบริการ" workspace. A fixed number of SQL statements per request: scope proof
 * (and the network audit), the in-scope relationship ids from the existing read builders, one tracking statement
 * (stage, signals, counts, filters, sort and page over every in-scope patient), and one batched load for the page.
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
      select: { id: true },
    });
    const rows = relationships.length > 0
      ? await database.$queryRaw<TrackingRow[]>(buildTrackingStatement(relationships.map(({ id }) => id), {
          now,
          stages: parsed.stages ?? [],
          signals: parsed.signals ?? [],
          includeEnded: parsed.includeEnded ?? false,
          page: parsed.page,
          pageSize: CARE_TRACKING_PAGE_SIZE,
        }))
      : [];
    const first = rows[0];
    const total = first?.total ?? 0;

    return {
      hospital: { ...scope.hospital, access: scope.access },
      summary: toSummary(first),
      items: await loadPageItems(database, actor, scope, rows.flatMap(toTrackedPatient)),
      page: first?.page ?? 1,
      pageSize: CARE_TRACKING_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / CARE_TRACKING_PAGE_SIZE)),
    };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      throw error;
    }

    throw new InfrastructureError("Care tracking could not be loaded");
  }
}

export const careTrackingQueryInternals = {
  buildCareSignalColumns,
  buildCareStageCase,
  buildSearchWhere,
  buildTrackingStatement,
};
