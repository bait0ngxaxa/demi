import type {
  FollowupActivityProgressStatus,
  PatientProgramStatus,
} from "@prisma/client";

import type {
  PatientProgramServiceOneEvidenceProjection,
  PatientProgramServiceOneProjection,
  PatientProgramServiceOneRecord,
} from "@/modules/patient-program/services/patient-program-service-one-query-service";
import { toPatientProgramServiceOneProjection } from "@/modules/patient-program/services/patient-program-service-one-query-service";
import { InfrastructureError } from "@/shared/errors/application-error";

export type ReportFact<T> =
  | { state: "RECORDED"; value: T }
  | { state: "NOT_RECORDED" };

export type ProgramReportBaselineMeasurements = {
  weight: ReportFact<number>;
  waistCircumference: ReportFact<number>;
  bloodPressureSystolic: ReportFact<number>;
  bloodPressureDiastolic: ReportFact<number>;
  bloodSugarDtx: ReportFact<number>;
};

export type ProgramReportMeasurements = {
  weight: ReportFact<number>;
  waistCircumference: ReportFact<number>;
  systolicBloodPressure: ReportFact<number>;
  diastolicBloodPressure: ReportFact<number>;
  bloodSugar: ReportFact<number>;
};

export type LinkedBaselineSource =
  | {
      state: "PRESENT";
      baselineId: string;
      recordedOn: Date;
      createdAt: Date;
      recordedBy: {
        id: string;
        displayName: string;
      };
      measurements: ProgramReportBaselineMeasurements;
    }
  | {
      state: "MISSING";
      reason: "PROGRAM_HAS_NO_LINKED_BASELINE";
    };

export type FinalAssessmentSource =
  | {
      state: "PRESENT";
      finalAssessmentId: string;
      recordedAt: Date;
      createdAt: Date;
      recordedBy: {
        id: string;
        displayName: string;
      };
      measurements: ProgramReportMeasurements;
    }
  | {
      state: "MISSING";
      reason: "PROGRAM_HAS_NO_FINAL";
    };

export type ProgramReportEvidenceMetadata = PatientProgramServiceOneEvidenceProjection;

export type ProgramReportServiceOneActivity =
  | {
      state: "PRESENT";
      recorded: true;
      recordedAt: Date;
      recordedBy: {
        displayName: string;
      };
      evidence: ProgramReportEvidenceMetadata | null;
    }
  | {
      state: "MISSING";
      recorded: false;
      reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD";
    };

export type ProgramReportServiceOneProjection = {
  routine: ProgramReportServiceOneActivity;
  floatingChart: ProgramReportServiceOneActivity;
  dreamCard: ProgramReportServiceOneActivity;
  confidence: ProgramReportServiceOneActivity;
};

export type ProgramReportGoalPlanItem = {
  goalPlanItemId: string;
  activityCode: string;
  targetDays: number;
  targetValue: ReportFact<number>;
  targetUnit: ReportFact<string>;
  sortOrder: number;
};

export type ProgramReportGoalPlan = {
  goalPlanId: string;
  roundNumber: number;
  createdAt: Date;
  createdByDisplayName: string;
  primaryGoalCode: string;
  primaryGoalNote: ReportFact<string>;
  weeklyNote: ReportFact<string>;
  templateKey: string;
  templateVersion: string;
  items: ProgramReportGoalPlanItem[];
};

export type ProgramReportFollowupActivityProgress = {
  goalActivityCode: string;
  status: FollowupActivityProgressStatus;
  note: ReportFact<string>;
};

export type ProgramReportFollowup = {
  followupId: string;
  roundNumber: number;
  recordedAt: Date;
  createdAt: Date;
  createdByDisplayName: string;
  measurements: ProgramReportMeasurements;
  activityProgress: ProgramReportFollowupActivityProgress[];
};

export type ProgramReportPage<T> = {
  items: T[];
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ProgramReportingProjection = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  hospitalId: string;
  hospital: {
    id: string;
    name: string;
  };
  patient: {
    displayName: string;
  };
  lifecycle: {
    status: PatientProgramStatus;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    createdBy: {
      id: string;
      displayName: string;
    };
  };
  linkedBaseline: LinkedBaselineSource;
  serviceOne: ProgramReportServiceOneProjection;
  goalPlans: ProgramReportPage<ProgramReportGoalPlan>;
  followups: ProgramReportPage<ProgramReportFollowup>;
  finalAssessment: FinalAssessmentSource;
};

type PersonNameSource = {
  givenName: string | null;
  familyName: string | null;
};

type CreatedBySource = {
  id: string;
  person: PersonNameSource;
};

export type ProgramReportProgramSource = PatientProgramServiceOneRecord & {
  id: string;
  patientHospitalRelationshipId: string;
  initialBaselineId: string | null;
  status: PatientProgramStatus;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  createdByUser: CreatedBySource;
};

export type ProgramReportBaselineSource = {
  id: string;
  patientHospitalRelationshipId: string;
  recordedOn: Date;
  createdAt: Date;
  recordedBy: CreatedBySource;
  weight: number | null;
  waistCircumference: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  bloodSugarDtx: number | null;
};

export type ProgramReportFinalAssessmentSource = {
  id: string;
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  recordedAt: Date;
  createdAt: Date;
  recordedBy: CreatedBySource;
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
};

export type ProgramReportGoalPlanSource = {
  id: string;
  patientProgramId: string | null;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  createdAt: Date;
  createdByUser: {
    person: PersonNameSource;
  };
  primaryGoalCode: string;
  primaryGoalNote: string | null;
  weeklyNote: string | null;
  templateKey: string;
  templateVersion: string;
  items: Array<{
    id: string;
    activityCode: string;
    targetDays: number;
    targetValue: number | null;
    targetUnit: string | null;
    sortOrder: number;
  }>;
};

export type ProgramReportFollowupSource = {
  id: string;
  patientProgramId: string | null;
  patientHospitalRelationshipId: string;
  roundNumber: number;
  recordedAt: Date;
  createdAt: Date;
  createdByUser: {
    person: PersonNameSource;
  };
  weight: number | null;
  waistCircumference: number | null;
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  bloodSugar: number | null;
  activityProgress: Array<{
    goalActivityCode: string;
    status: FollowupActivityProgressStatus;
    note: string | null;
  }>;
};

function toDisplayName(person: PersonNameSource): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ไม่ระบุชื่อ";
}

export function toReportFact<T>(value: T | null): ReportFact<T> {
  return value === null ? { state: "NOT_RECORDED" } : { state: "RECORDED", value };
}

function toBaselineMeasurements(
  source: ProgramReportBaselineSource,
): ProgramReportBaselineMeasurements {
  return {
    weight: toReportFact(source.weight),
    waistCircumference: toReportFact(source.waistCircumference),
    bloodPressureSystolic: toReportFact(source.bloodPressureSystolic),
    bloodPressureDiastolic: toReportFact(source.bloodPressureDiastolic),
    bloodSugarDtx: toReportFact(source.bloodSugarDtx),
  };
}

function toMeasurements(
  source: Pick<
    ProgramReportFinalAssessmentSource,
    "weight" | "waistCircumference" | "systolicBloodPressure" | "diastolicBloodPressure" | "bloodSugar"
  >,
): ProgramReportMeasurements {
  return {
    weight: toReportFact(source.weight),
    waistCircumference: toReportFact(source.waistCircumference),
    systolicBloodPressure: toReportFact(source.systolicBloodPressure),
    diastolicBloodPressure: toReportFact(source.diastolicBloodPressure),
    bloodSugar: toReportFact(source.bloodSugar),
  };
}

function assertExactOwnership(
  actualProgramId: string | null,
  actualRelationshipId: string,
  expectedProgramId: string,
  expectedRelationshipId: string,
  sourceName: string,
): void {
  if (
    actualProgramId?.toLowerCase() !== expectedProgramId ||
    actualRelationshipId.toLowerCase() !== expectedRelationshipId
  ) {
    throw new InfrastructureError(`${sourceName} ownership is inconsistent`);
  }
}

function toLinkedBaseline(
  program: ProgramReportProgramSource,
  source: ProgramReportBaselineSource | null,
): LinkedBaselineSource {
  const expectedRelationshipId = program.patientHospitalRelationshipId.toLowerCase();

  if (program.initialBaselineId === null) {
    return {
      state: "MISSING",
      reason: "PROGRAM_HAS_NO_LINKED_BASELINE",
    };
  }

  if (
    !source ||
    source.id.toLowerCase() !== program.initialBaselineId.toLowerCase() ||
    source.patientHospitalRelationshipId.toLowerCase() !== expectedRelationshipId
  ) {
    throw new InfrastructureError("Program linked Baseline ownership is inconsistent");
  }

  return {
    state: "PRESENT",
    baselineId: source.id,
    recordedOn: source.recordedOn,
    createdAt: source.createdAt,
    recordedBy: {
      id: source.recordedBy.id,
      displayName: toDisplayName(source.recordedBy.person),
    },
    measurements: toBaselineMeasurements(source),
  };
}

function toFinalAssessment(
  program: ProgramReportProgramSource,
  source: ProgramReportFinalAssessmentSource | null,
): FinalAssessmentSource {
  if (!source) {
    return { state: "MISSING", reason: "PROGRAM_HAS_NO_FINAL" };
  }

  assertExactOwnership(
    source.patientProgramId,
    source.patientHospitalRelationshipId,
    program.id.toLowerCase(),
    program.patientHospitalRelationshipId.toLowerCase(),
    "Final Assessment",
  );

  return {
    state: "PRESENT",
    finalAssessmentId: source.id,
    recordedAt: source.recordedAt,
    createdAt: source.createdAt,
    recordedBy: {
      id: source.recordedBy.id,
      displayName: toDisplayName(source.recordedBy.person),
    },
    measurements: toMeasurements(source),
  };
}

function toServiceOneActivity(
  source: {
    recorded: boolean;
    recordedAt: Date | null;
    recordedBy: { displayName: string } | null;
    evidence?: PatientProgramServiceOneEvidenceProjection | null;
  },
): ProgramReportServiceOneActivity {
  if (!source.recorded) {
    return {
      state: "MISSING",
      recorded: false,
      reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD",
    };
  }

  if (!source.recordedAt || !source.recordedBy) {
    throw new InfrastructureError("Service 1 recording provenance is inconsistent");
  }

  return {
    state: "PRESENT",
    recorded: true,
    recordedAt: source.recordedAt,
    recordedBy: source.recordedBy,
    evidence: source.evidence ?? null,
  };
}

function toServiceOneProjection(
  source: PatientProgramServiceOneProjection,
): ProgramReportServiceOneProjection {
  return {
    routine: toServiceOneActivity(source.routine),
    floatingChart: toServiceOneActivity(source.floatingChart),
    dreamCard: toServiceOneActivity(source.dreamCard),
    confidence: toServiceOneActivity({
      recorded: source.confidence.recorded,
      recordedAt: source.confidence.recordedAt,
      recordedBy: source.confidence.recordedBy,
      evidence: null,
    }),
  };
}

export function toProgramReportGoalPlan(
  source: ProgramReportGoalPlanSource,
  expectedProgramId: string,
  expectedRelationshipId: string,
): ProgramReportGoalPlan {
  assertExactOwnership(
    source.patientProgramId,
    source.patientHospitalRelationshipId,
    expectedProgramId,
    expectedRelationshipId,
    "Goal Plan",
  );

  return {
    goalPlanId: source.id,
    roundNumber: source.roundNumber,
    createdAt: source.createdAt,
    createdByDisplayName: toDisplayName(source.createdByUser.person),
    primaryGoalCode: source.primaryGoalCode,
    primaryGoalNote: toReportFact(source.primaryGoalNote),
    weeklyNote: toReportFact(source.weeklyNote),
    templateKey: source.templateKey,
    templateVersion: source.templateVersion,
    items: source.items.map((item) => ({
      goalPlanItemId: item.id,
      activityCode: item.activityCode,
      targetDays: item.targetDays,
      targetValue: toReportFact(item.targetValue),
      targetUnit: toReportFact(item.targetUnit),
      sortOrder: item.sortOrder,
    })),
  };
}

export function toProgramReportFollowup(
  source: ProgramReportFollowupSource,
  expectedProgramId: string,
  expectedRelationshipId: string,
): ProgramReportFollowup {
  assertExactOwnership(
    source.patientProgramId,
    source.patientHospitalRelationshipId,
    expectedProgramId,
    expectedRelationshipId,
    "Follow-up",
  );

  return {
    followupId: source.id,
    roundNumber: source.roundNumber,
    recordedAt: source.recordedAt,
    createdAt: source.createdAt,
    createdByDisplayName: toDisplayName(source.createdByUser.person),
    measurements: toMeasurements(source),
    activityProgress: source.activityProgress.map((progress) => ({
      goalActivityCode: progress.goalActivityCode,
      status: progress.status,
      note: toReportFact(progress.note),
    })),
  };
}

export function toProgramReportingProjection(input: {
  program: ProgramReportProgramSource;
  hospital: { id: string; name: string };
  patientDisplayName: string;
  linkedBaseline: ProgramReportBaselineSource | null;
  finalAssessment: ProgramReportFinalAssessmentSource | null;
  goalPlans: ProgramReportPage<ProgramReportGoalPlan>;
  followups: ProgramReportPage<ProgramReportFollowup>;
}): ProgramReportingProjection {
  if (
    input.hospital.id.trim() === "" ||
    input.program.patientHospitalRelationshipId.trim() === ""
  ) {
    throw new InfrastructureError("Program reporting identity is inconsistent");
  }

  return {
    patientProgramId: input.program.id,
    patientHospitalRelationshipId: input.program.patientHospitalRelationshipId,
    hospitalId: input.hospital.id,
    hospital: input.hospital,
    patient: { displayName: input.patientDisplayName },
    lifecycle: {
      status: input.program.status,
      startedAt: input.program.startedAt,
      completedAt: input.program.completedAt,
      createdAt: input.program.createdAt,
      createdBy: {
        id: input.program.createdByUser.id,
        displayName: toDisplayName(input.program.createdByUser.person),
      },
    },
    linkedBaseline: toLinkedBaseline(input.program, input.linkedBaseline),
    serviceOne: toServiceOneProjection(
      // The existing Service 1 mapper is the source of the safe activity/evidence
      // select semantics. This report mapper deliberately drops content URLs and
      // large free-text fields while retaining presence/provenance metadata.
      toPatientProgramServiceOneProjection(input.program),
    ),
    goalPlans: input.goalPlans,
    followups: input.followups,
    finalAssessment: toFinalAssessment(input.program, input.finalAssessment),
  };
}

export const programReportProjectionInternals = {
  assertExactOwnership,
  toBaselineMeasurements,
  toDisplayName,
  toFinalAssessment,
  toLinkedBaseline,
  toMeasurements,
  toReportFact,
  toServiceOneActivity,
  toServiceOneProjection,
};
