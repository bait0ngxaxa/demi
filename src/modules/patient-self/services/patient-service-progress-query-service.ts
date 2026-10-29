import "server-only";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { deriveCareStage, type CareStage } from "@/modules/care-tracking/domain/care-stage";
import { PATIENT_PROGRAM_READ_CAPABILITY } from "@/modules/patient-program/policies/patient-program-policy";
import { ROUND_ITEM_CATALOG } from "@/modules/patient-program-rounds/domain/round-steps";
import {
  buildProgramRoundDetail,
  buildProgramRoundsOverview,
  programRoundSelect,
  type ProgramRoundDetail,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { ApplicationError, InfrastructureError } from "@/shared/errors/application-error";

import { assertPatientSelfReadPolicy } from "../policies/patient-self-policy";
import { patientSelfQueryInternals, type PatientSelfQueryDependencies, type PatientSelfRelationshipContext } from "./patient-self-query-service";

export type ServiceProgressItem = {
  planItemId: string | null;
  label: string;
  byPatient: boolean;
};

export type ServiceProgress = {
  relationshipId: string;
  hospitalName: string;
  stage: CareStage;
  stageLabel: string;
  programId: string | null;
  currentRound: {
    number: number;
    title: string;
    doneItems: number;
    plannedItems: number;
    selfRecordable: ServiceProgressItem[];
    staffWillDo: ServiceProgressItem[];
    done: ServiceProgressItem[];
  } | null;
  rounds: Array<{ number: number; state: "COMPLETED" | "CURRENT" | "LOCKED" }>;
  /** undefined means the caller has no appointment grant; render no hint of appointment data. */
  nextAppointment?: { scheduledAt: Date } | null;
};

export type OwnServiceProgress = ServiceProgress & {
  relationship: PatientSelfRelationshipContext;
  recordingRound: ProgramRoundDetail | null;
};

/** Shared read facts only. Callers must constrain this selection by their own SELF or exact grant policy. */
export const serviceProgressRelationshipSelect = {
  id: true,
  hospitalNumber: true,
  endedAt: true,
  hospital: { select: { name: true, hospitalCode: true, status: true } },
  baseline: { select: { id: true } },
  _count: { select: { programs: { where: { status: "COMPLETED" } } } },
  programs: {
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    where: { status: "ACTIVE" },
    take: 1,
    select: programRoundSelect,
  },
} satisfies Prisma.PatientHospitalRelationshipSelect;

type ProgressRecord = Prisma.PatientHospitalRelationshipGetPayload<{ select: typeof serviceProgressRelationshipSelect }>;

const PATIENT_STAGE_WORDING: Readonly<Record<CareStage, string>> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  READY_FOR_PROGRAM: "รอเริ่มโปรแกรม",
  IN_ROUND: "กำลังรับบริการครั้งที่",
  IN_EXTRA_ROUND: "ครั้งเพิ่มเติม",
  AWAITING_AFTER: "รอการประเมินสุดท้าย",
  AWAITING_PROGRAM_END: "รอจบโปรแกรม",
  PROGRAM_COMPLETED: "จบโปรแกรมแล้ว",
  CARE_ENDED: "สิ้นสุดการดูแลแล้ว",
};

/** Allowlist projection: never returns recorder names, clinical answers, free-text notes or staff controls. */
export function buildServiceProgress(
  record: ProgressRecord,
  nextAppointment: ServiceProgress["nextAppointment"],
  { readOnly = true }: { readOnly?: boolean } = {},
): { progress: ServiceProgress; recordingRound: ProgramRoundDetail | null } {
  const program = record.programs.find(({ status }) => status === "ACTIVE") ?? null;
  const completed = new Set(program?.roundCompletions.map(({ roundNumber }) => roundNumber));
  const opened = program?.rounds.map(({ roundNumber }) => roundNumber) ?? [];
  const current = opened.find((number) => !completed.has(number)) ?? null;
  const stage = deriveCareStage({
    careEnded: record.endedAt !== null,
    baselineRecorded: record.baseline !== null,
    completedProgramExists: record._count.programs > 0,
    activeProgram: program ? {
      openedRounds: opened.length,
      completedRounds: opened.filter((number) => completed.has(number)).length,
      currentOpenRound: current,
      finalAssessmentRecorded: program.finalAssessment !== null,
    } : null,
  });
  const round = program && current !== null
    ? buildProgramRoundDetail(program, current, { displayName: "" }, {
        canManage: false,
        canSelfRecord: record.endedAt === null && record.hospital.status === "ACTIVE",
        options: { recorderNames: false },
      })
    : null;
  const selfRecordable: ServiceProgressItem[] = [];
  const staffWillDo: ServiceProgressItem[] = [];
  const done: ServiceProgressItem[] = [];
  for (const step of round?.status.steps ?? []) {
    const item = { planItemId: step.planItemId ?? null, label: step.label, byPatient: step.evidence?.byPatient === true };
    if (step.status === "DONE") done.push(item);
    if (step.status !== "TODO") continue;
    if (round?.canSelfRecord && step.planItemId && ROUND_ITEM_CATALOG[step.code].patientRecordable && !round.staffRecordedSteps.includes(step.code)) {
      selfRecordable.push(item);
    } else {
      staffWillDo.push(item);
    }
  }

  return {
    progress: {
      relationshipId: record.id,
      hospitalName: record.hospital.name,
      stage,
      stageLabel: stage === "IN_ROUND" || stage === "IN_EXTRA_ROUND"
        ? `${PATIENT_STAGE_WORDING[stage]} ${current ?? opened.length + 1}`
        : PATIENT_STAGE_WORDING[stage],
      programId: program?.id ?? null,
      currentRound: round ? {
        number: round.roundNumber,
        title: round.title,
        doneItems: done.length,
        plannedItems: round.status.steps.length,
        selfRecordable,
        staffWillDo,
        done,
      } : null,
      rounds: program ? buildProgramRoundsOverview(program, { recorderNames: false }).rounds.map((summary) => ({
        number: summary.roundNumber,
        state: completed.has(summary.roundNumber) ? "COMPLETED" : summary.roundNumber === current ? "CURRENT" : "LOCKED",
      })) : [],
      ...(nextAppointment === undefined ? {} : { nextAppointment }),
    },
    recordingRound: readOnly ? null : round,
  };
}

/** One batched load for all ongoing own Hospitals; neither staff scope nor client-supplied ownership is used. */
export async function getOwnServiceProgress(
  actor: ActorContext | null | undefined,
  dependencies: PatientSelfQueryDependencies & { now?: Date } = {},
): Promise<OwnServiceProgress[]> {
  const input = { actor, capability: PATIENT_PROGRAM_READ_CAPABILITY };
  assertPatientSelfReadPolicy(input);
  const now = dependencies.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new InfrastructureError("Current service time could not be captured");
  try {
    const person = await (dependencies.database ?? getPrisma()).person.findFirst({
      where: patientSelfQueryInternals.ownPatientWhere(input.actor),
      select: { patientProfile: { select: { hospitalRelationships: {
        where: { endedAt: null, hospital: { is: { status: "ACTIVE" } } },
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
        select: {
          ...serviceProgressRelationshipSelect,
          appointments: {
            where: { status: "SCHEDULED", scheduledAt: { gte: now } },
            orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 1,
            select: { scheduledAt: true },
          },
        },
      } } } },
    });
    return (person?.patientProfile?.hospitalRelationships ?? []).map((record) => {
      const { progress, recordingRound } = buildServiceProgress(record, record.appointments[0] ?? null, { readOnly: false });
      return { ...progress, recordingRound, relationship: patientSelfQueryInternals.toRelationshipNavigation(record) };
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Patient service progress could not be loaded");
  }
}
