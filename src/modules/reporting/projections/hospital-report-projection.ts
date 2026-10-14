import type { FollowupActivityProgressStatus, PatientProgramStatus } from "@prisma/client";

import type { FollowupAchievement } from "@/modules/followups/domain/followup-achievement";
import type { GoalActivityCategory } from "@/modules/goals/domain/goal-templates";

export type HospitalReportUnavailableReason =
  | "SOURCE_MISSING"
  | "CLINICAL_SEMANTICS_UNAPPROVED"
  | "NOT_PROGRAM_SCOPED"
  | "DERIVATION_UNAPPROVED";

export type HospitalReportFact<T> =
  | { state: "RECORDED"; value: T }
  | { state: "NOT_RECORDED" }
  | { state: "UNAVAILABLE"; reason: HospitalReportUnavailableReason };

export type HospitalReportRecord<T> = { state: "PRESENT"; value: T } | { state: "MISSING" };

export type HospitalReportMeasurementSet = {
  bloodSugar: HospitalReportFact<number>;
  weight: HospitalReportFact<number>;
  waistCircumference: HospitalReportFact<number>;
  systolicBloodPressure: HospitalReportFact<number>;
  diastolicBloodPressure: HospitalReportFact<number>;
};

/** Phase A (WB-DF-01/05): vitals for Dashboard rounds 1-2 from PatientProgramRoundVitals. */
export type HospitalReportRoundVitals = HospitalReportRecord<{
  /** Date-only (YYYY-MM-DD). */
  serviceDate: string;
  measurements: HospitalReportMeasurementSet;
  heightCm: HospitalReportFact<number>;
}>;

export type HospitalReportGoalPlan = {
  id: string;
  roundNumber: number;
  primaryGoalCode: string;
  primaryGoalLabel: string;
  items: readonly {
    activityCode: string;
    activityLabel: string;
    category: GoalActivityCategory | null;
    targetDays: number;
    targetValue: HospitalReportFact<number>;
    targetUnit: HospitalReportFact<string>;
  }[];
};

export type HospitalReportFollowup = {
  id: string;
  roundNumber: number;
  recordedAt: string;
  /** Date-only (YYYY-MM-DD); null for Follow-ups recorded before service dates were captured. */
  serviceDate: string | null;
  planAdjusted: boolean | null;
  hasObstacle: boolean | null;
  /** Owner decision BR-04; null when the Follow-up has no Goal Plan or incomplete achieved days. */
  achievement: FollowupAchievement | null;
  measurements: HospitalReportMeasurementSet;
  activityProgress: readonly {
    activityCode: string;
    activityLabel: string;
    status: FollowupActivityProgressStatus;
    achievedDays: number | null;
  }[];
};

export type HospitalReportServiceOneActivity = HospitalReportRecord<{ recordedAt: string }>;

export type HospitalReportProgramRow = {
  patientProgramId: string;
  patientHospitalRelationshipId: string;
  patient: {
    displayName: string;
    givenName: string | null;
    familyName: string | null;
    hospitalNumber: HospitalReportFact<string>;
  };
  currentRelationshipOsmAssignment: HospitalReportRecord<{
    displayName: string;
    assignedAt: string;
  }>;
  lifecycle: {
    status: PatientProgramStatus;
    startedAt: string;
    completedAt: HospitalReportFact<string>;
  };
  baseline: HospitalReportRecord<{
    recordedOn: string;
    measurements: HospitalReportMeasurementSet;
    heightCm: HospitalReportFact<number>;
    hba1c: HospitalReportFact<number>;
    confidenceScore: HospitalReportFact<number>;
  }>;
  serviceOne: {
    routine: HospitalReportServiceOneActivity;
    floatingChart: HospitalReportServiceOneActivity;
    dreamCard: HospitalReportServiceOneActivity;
    confidence: HospitalReportServiceOneActivity;
  };
  goalPlans: {
    totalCount: number;
    items: readonly HospitalReportGoalPlan[];
    hasMore: boolean;
  };
  followups: {
    totalCount: number;
    items: readonly HospitalReportFollowup[];
    hasMore: boolean;
  };
  finalAssessment: HospitalReportRecord<{
    recordedAt: string;
    /** Date-only (YYYY-MM-DD); null for assessments recorded before service dates were captured. */
    serviceDate: string | null;
    measurements: HospitalReportMeasurementSet;
    hba1c: HospitalReportFact<number>;
  }>;
  roundVitals: {
    round1: HospitalReportRoundVitals;
    round2: HospitalReportRoundVitals;
  };
  /** Latest recorded height (round 2, round 1, then Baseline) used for After BMI; not an After measurement. */
  latestHeightCm: HospitalReportFact<number>;
  /** WB-DF-04: kg/m^2 values only; Before from the Baseline, After from the Final Assessment weight. */
  bmi: {
    baseline: HospitalReportFact<number>;
    after: HospitalReportFact<number>;
  };
  /** PAM/PROMs totals from the screening performed from round 1 of this Program. */
  screening: HospitalReportRecord<{
    submittedAt: string;
    pamScore: number;
    promsScore: number;
  }>;
  illnessDuration: HospitalReportFact<number>;
  unavailable: {
    baselineCvdRiskScore: HospitalReportUnavailableReason;
    afterCvdRiskScore: HospitalReportUnavailableReason;
    beforeWeeklyExercise: HospitalReportUnavailableReason;
    afterWeeklyExercise: HospitalReportUnavailableReason;
    achievementRate: HospitalReportUnavailableReason;
    outcome: HospitalReportUnavailableReason;
  };
};

export type HospitalReportingPageProjection = {
  hospital: { id: string; hospitalCode: string; name: string };
  counts: HospitalReportingSummary;
  page: {
    items: readonly HospitalReportProgramRow[];
    pageSize: number;
    nextCursor: string | null;
  };
};

export type HospitalReportingSummary = {
  patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP"; value: number };
  relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP"; value: number };
  programs: { grain: "PATIENT_PROGRAM"; total: number; active: number; completed: number };
};

export type ParentChildHospitalReportingSection<T> = {
  state: "AVAILABLE";
  value: T;
};

export type ParentChildHospitalReportingServiceProcessSummary = {
  programsWithRoutineRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM"; value: number };
};

export type ParentChildHospitalReportingProjection = {
  operation: "PARENT_CHILD_REPORT";
  access: "PARENT_OWNER";
  parent: { id: string; name: string };
  hospital: { id: string; name: string };
  content: {
    state: "AVAILABLE";
    dashboard: ParentChildHospitalReportingSection<HospitalReportingSummary>;
    serviceProcess: ParentChildHospitalReportingSection<ParentChildHospitalReportingServiceProcessSummary>;
  };
};

export type ParentChildHospitalReportPageProjection = ParentChildHospitalReportingProjection;

export type HospitalReportingDataset = Omit<HospitalReportingPageProjection, "page"> & {
  programs: readonly HospitalReportProgramRow[];
};

export const HOSPITAL_REPORT_UNAVAILABLE_FIELDS = {
  hospitalIdentity: { coverage: "SOURCE_BACKED", source: "Hospital.id/name/hospitalCode" },
  patientIdentity: {
    coverage: "SOURCE_BACKED",
    source: "PatientHospitalRelationship -> PatientProfile -> Person",
  },
  hospitalLocalId: {
    coverage: "SOURCE_BACKED",
    source: "PatientHospitalRelationship.hospitalNumber",
  },
  illnessDuration: { coverage: "DERIVED_WB_DF_11", source: "PatientHospitalHealthHistory.diagnosisYear (B.E.); current Bangkok year minus diagnosis year; current hospital-local history" },
  responsibleOsm: {
    coverage: "SOURCE_BACKED_RELATIONSHIP_CURRENT_ONLY",
    source: "PatientOsmAssignment with endedAt null",
    limitation: "Current relationship assignment is not historical Program or service attribution.",
  },
  baselineMeasurements: {
    coverage: "SOURCE_BACKED",
    source: "PatientProgram.initialBaselineId -> PatientBaseline",
  },
  baselineHeight: {
    coverage: "SOURCE_BACKED_REQUIRES_PROJECTION_EXTENSION",
    source: "PatientBaseline.heightCm",
  },
  baselineHba1c: {
    coverage: "SOURCE_EXISTS_SEMANTICS_UNAPPROVED",
    source: "PatientBaseline.hba1c",
    limitation: "Measurement context and unit are not approved for reporting.",
  },
  baselineConfidence: {
    coverage: "SOURCE_EXISTS_SEMANTICS_UNAPPROVED",
    source: "PatientBaseline.confidenceScore",
    limitation: "Scale and stage are not approved for workbook equivalence.",
  },
  cvdRisk: { coverage: "SOURCE_MISSING", reason: "No CVD risk score source exists." },
  bmi: {
    coverage: "DERIVED_WB_DF_04",
    source: "weight / (latest recorded height)^2 from PatientBaseline, PatientProgramRoundVitals and PatientFinalAssessment",
    limitation:
      "Value only (WB-DF-04): no category or interpretation. After uses the latest recorded height because Final Assessment records none.",
  },
  pamProms: {
    coverage: "SOURCE_BACKED_PROGRAM_SCOPED",
    source: "ScreeningAssessment.patientProgramId (screening performed from round 1)",
    limitation: "Screenings recorded outside a Program round are not linked to a Program stage and are not reported.",
  },
  weeklyExercise: {
    coverage: "NOT_PROGRAM_SCOPED",
    reason: "PersonalExerciseEntry is self-reported and has no Program link.",
  },
  serviceOne: {
    coverage: "SOURCE_BACKED_RECORD_PRESENCE",
    source: "Program-owned Service 1 records",
    limitation: "Record presence does not prove service delivery or outcome.",
  },
  goalTargets: {
    coverage: "SOURCE_BACKED",
    source: "PatientGoalPlan and PatientGoalItem for the exact Program",
    limitation: "Targets are not observed achievement.",
  },
  followupFacts: {
    coverage: "SOURCE_BACKED",
    source: "PatientFollowup and PatientFollowupActivityProgress for the exact Program",
    limitation: "Recorded time and status do not prove an in-person encounter or treatment success.",
  },
  finalMeasurements: {
    coverage: "SOURCE_BACKED",
    source: "PatientFinalAssessment for the exact Program",
  },
  afterHba1c: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientFinalAssessment.hba1c",
    limitation: "Final Assessments recorded before HbA1c was captured show as not recorded.",
  },
  afterHeight: {
    coverage: "SOURCE_BACKED_LATEST_RECORDED",
    source: "Latest PatientProgramRoundVitals.heightCm (round 2, then round 1), then PatientBaseline.heightCm",
    limitation: "Final Assessment records no height of its own; this is the latest recorded height.",
  },
  serviceRoundMeasurements: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientProgramRoundVitals for rounds 1-2; PatientFollowup measurements for rounds 3-6",
    limitation: "Programs without round vitals recorded show as not recorded for rounds 1-2.",
  },
  achievement: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientFollowupActivityProgress.achievedDays over the source Goal Plan targetDays (BR-04)",
    limitation: "Follow-ups recorded before achieved days were captured cannot be scored.",
  },
  planAdjustmentObstacle: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientFollowup.planAdjusted / hasObstacle (BR-06/BR-07)",
    limitation: "Follow-ups recorded before these answers were captured show as not recorded.",
  },
  outcome: {
    coverage: "SOURCE_MISSING",
    reason: "The Owner outcome vocabulary (BR-05) has not been supplied.",
  },
} as const;
