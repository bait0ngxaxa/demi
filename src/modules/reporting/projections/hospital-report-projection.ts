import type { RoundReport } from "./round-report-projection";
import type { FollowupActivityProgressStatus, PatientProgramStatus } from "@prisma/client";

import type { FollowupAchievement } from "@/modules/followups/domain/followup-achievement";
import type { GoalActivityCategory } from "@/modules/goals/domain/goal-templates";
import type { HospitalReportCohort, HospitalReportFilters } from "@/modules/reporting/schemas/hospital-report-schemas";

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
  rounds: readonly RoundReport[];
  extraRoundsCompleted: number;
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
    /** D8: unit approved as %. */
    hba1c: HospitalReportFact<number>;
    /** D8: confidence ruler approved as a 0-10 score. */
    confidenceScore: HospitalReportFact<number>;
    /** D7: staff-entered CVD risk score %, Before. */
    cvdRiskScore: HospitalReportFact<number>;
  }>;
  /** R1-E: round-1 results ("Before"); the dream card is round 3 (SR-D11). A skipped tool is MISSING. */
  serviceOne: {
    routine: HospitalReportServiceOneActivity;
    floatingChart: HospitalReportServiceOneActivity;
    dreamCard: HospitalReportServiceOneActivity;
    /** D8: 0-10 score of the round-1 ไม้บรรทัดวัดใจ. */
    confidence: HospitalReportRecord<{ recordedAt: string; score: number }>;
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
    /** D7: staff-entered CVD risk score %, After. */
    cvdRiskScore: HospitalReportFact<number>;
  }>;
  roundVitals: {
    round1: HospitalReportRoundVitals;
    round2: HospitalReportRoundVitals;
  };
  /** Latest recorded round height, then Baseline used for After BMI; not an After measurement. */
  latestHeightCm: HospitalReportFact<number>;
  /** WB-DF-04: kg/m^2 values only; Before from the Baseline, After from the Final Assessment weight. */
  bmi: {
    baseline: HospitalReportFact<number>;
    after: HospitalReportFact<number>;
  };
  /**
   * PAM/PROMs from the screenings performed in the active plan of an opened round of this Program (R2-C). PAM = total score.
   * PROMs = มีปัญหา/ไม่มีปัญหา (Q6); a legacy combined screening still reports its PROMs total.
   */
  screening: {
    pam: HospitalReportRecord<{ submittedAt: string; score: number }>;
    proms: HospitalReportRecord<
      { submittedAt: string; hasProblem: boolean } | { submittedAt: string; legacyTotal: number }
    >;
  };
  illnessDuration: HospitalReportFact<number>;
  /**
   * D9: self-reported PersonalExerciseEntry.durationMinutes, average minutes per week over the 28
   * Bangkok days before the Program start date (before) and before the Final Assessment service date
   * (after). NOT_RECORDED when no entry with a duration falls in the window or there is no Final
   * Assessment.
   */
  weeklyExercise: {
    before: HospitalReportFact<number>;
    after: HospitalReportFact<number>;
  };
  unavailable: {
    achievementRate: HospitalReportUnavailableReason;
    outcome: HospitalReportUnavailableReason;
  };
};

export type HospitalReportCompactProgramRow = HospitalReportProgramRow & {
  completedRounds: number;
  latestServiceDate: string | null;
};

export type HospitalReportingPageProjection = {
  hospital: { id: string; hospitalCode: string; name: string };
  /** Phase F: whether Patients whose care ended are part of this report. */
  cohort: HospitalReportCohort;
  counts: HospitalReportingSummary;
  /** Full-cohort Program record-presence counts; independent of filters and pagination. */
  serviceProcess: HospitalReportingServiceProcessSummary;
  filters: HospitalReportFilters;
  roundProgress: { rounds: readonly number[]; afterRecorded: number; completed: number };
  page: {
    items: readonly HospitalReportCompactProgramRow[];
    total: number;
    number: number;
    previousCursor: string | null;
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

/**
 * Programs with the Service 1 result the workbook reports (round 1; dream card round 3). The four counts
 * overlap: one Program can hold several records, so they must never be summed.
 */
export type HospitalReportingServiceProcessSummary = {
  programsWithRoutineRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM"; value: number };
  programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM"; value: number };
};

export type ParentChildHospitalReportingServiceProcessSummary = HospitalReportingServiceProcessSummary;

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

export type HospitalReportingDataset = Omit<HospitalReportingPageProjection, "page" | "filters" | "roundProgress" | "serviceProcess"> & {
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
    coverage: "SOURCE_BACKED_APPROVED_D8",
    source: "PatientBaseline.hba1c",
    limitation: "Unit approved as % (customer decision D8).",
  },
  baselineConfidence: {
    coverage: "SOURCE_BACKED_APPROVED_D8",
    source: "PatientProgramServiceOneConfidence.score of round 1 (Phase R1, SR-D8)",
    limitation:
      "Confidence ruler approved as a 0-10 score (customer decision D8). The Before column is the round-1 ruler; a skipped or missing round-1 ruler shows as not recorded. PatientBaseline.confidenceScore is not reported.",
  },
  cvdRisk: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientBaseline.cvdRiskScore (Before) and PatientFinalAssessment.cvdRiskScore (After)",
    limitation:
      "Staff-entered % 0-100, one decimal, optional; no calculation (D7, WB-DF-17). Records made before the field existed show as not recorded.",
  },
  bmi: {
    coverage: "DERIVED_WB_DF_04",
    source: "weight / (latest recorded height)^2 from PatientBaseline, PatientProgramRoundVitals and PatientFinalAssessment",
    limitation:
      "Value only (WB-DF-04): no category or interpretation. After uses the latest recorded height because Final Assessment records none.",
  },
  pamProms: {
    coverage: "SOURCE_BACKED_PROGRAM_SCOPED",
    source: "ScreeningAssessment.patientProgramId + instrument (screenings performed in the active plan of an opened round)",
    limitation: "Screenings recorded outside a Program round are not linked to a Program stage and are not reported.",
  },
  weeklyExercise: {
    coverage: "DERIVED_D9_SELF_REPORTED",
    source:
      "PersonalExerciseEntry.durationMinutes of the Patient profile: minutes in the 28 Asia/Bangkok days before the Program start date (Before) or the Final Assessment service date (After), divided by 4",
    limitation:
      "Self-reported by the Patient (ผู้ป่วยบันทึกเอง), not a clinical measurement; entries without a duration are not counted. Supersedes Wellness Q79 for this aggregate only (D9, WB-DF-16). Disclosure basis: Patient consent confirmed by the Product Owner 2026-10-16; the entries belong to the Patient profile, so every Hospital related to the Patient gets the same aggregate.",
  },
  serviceOne: {
    coverage: "SOURCE_BACKED_RECORD_PRESENCE",
    source:
      "Per-round Service 1 records (Phase R1, SR-D8): round 1 for กราฟวัดลอยจม / ตารางชีวิตของฉัน, round 3 for ความฝันของฉัน",
    limitation:
      "Record presence does not prove service delivery or outcome. A step skipped with a reason has no record and reports as ไม่ทำ.",
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
    source: "Latest PatientProgramRoundVitals.heightCm through the opened rounds, then PatientBaseline.heightCm",
    limitation: "Final Assessment records no height of its own; this is the latest recorded height.",
  },
  serviceRoundMeasurements: {
    coverage: "SOURCE_BACKED_NEW_RECORDS",
    source: "PatientProgramRoundVitals for rounds 1-12 or current-round PatientFollowup measurements for rounds 3-12",
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
