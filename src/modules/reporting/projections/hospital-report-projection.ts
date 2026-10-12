import type { FollowupActivityProgressStatus, PatientProgramStatus } from "@prisma/client";

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

export type HospitalReportGoalPlan = {
  id: string;
  roundNumber: number;
  primaryGoalCode: string;
  primaryGoalLabel: string;
  items: readonly {
    activityCode: string;
    activityLabel: string;
    targetDays: number;
    targetValue: HospitalReportFact<number>;
    targetUnit: HospitalReportFact<string>;
  }[];
};

export type HospitalReportFollowup = {
  id: string;
  roundNumber: number;
  recordedAt: string;
  measurements: HospitalReportMeasurementSet;
  activityProgress: readonly {
    activityCode: string;
    activityLabel: string;
    status: FollowupActivityProgressStatus;
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
    measurements: HospitalReportMeasurementSet;
  }>;
  unavailable: {
    illnessDuration: HospitalReportUnavailableReason;
    baselineCvdRiskScore: HospitalReportUnavailableReason;
    baselineBmi: HospitalReportUnavailableReason;
    afterCvdRiskScore: HospitalReportUnavailableReason;
    afterHba1c: HospitalReportUnavailableReason;
    afterBmi: HospitalReportUnavailableReason;
    afterHeightCm: HospitalReportUnavailableReason;
    beforePamScore: HospitalReportUnavailableReason;
    beforePromsScore: HospitalReportUnavailableReason;
    beforeWeeklyExercise: HospitalReportUnavailableReason;
    afterWeeklyExercise: HospitalReportUnavailableReason;
    achievementDays: HospitalReportUnavailableReason;
    achievementRate: HospitalReportUnavailableReason;
    achievementOver70Count: HospitalReportUnavailableReason;
    outcome: HospitalReportUnavailableReason;
    planAdjustment: HospitalReportUnavailableReason;
    obstacle: HospitalReportUnavailableReason;
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

export type ParentChildHospitalReportingSectionState = {
  state: "WITHHELD";
  reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED";
};

export type ParentChildHospitalReportingProjection = {
  operation: "PARENT_CHILD_REPORT";
  access: "PARENT_OWNER";
  parent: { id: string; name: string };
  hospital: { id: string; name: string };
  content: {
    state: "WITHHELD";
    reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED";
    dashboard: ParentChildHospitalReportingSectionState;
    serviceProcess: ParentChildHospitalReportingSectionState;
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
  illnessDuration: { coverage: "SOURCE_MISSING", reason: "No illness-onset or duration field exists." },
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
    coverage: "DERIVATION_UNAPPROVED",
    reason: "No stored BMI and no approved formula or stage pairing exist.",
  },
  pamProms: {
    coverage: "NOT_PROGRAM_SCOPED",
    reason: "Existing Screening scores are not linked to a Program stage.",
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
  afterHba1cAndHeight: {
    coverage: "SOURCE_MISSING",
    reason: "Final Assessment has no HbA1c or height field.",
  },
  achievement: {
    coverage: "SOURCE_MISSING_AND_DERIVATION_UNAPPROVED",
    reason: "No achieved-day source or accepted denominator/formula exists.",
  },
  outcomeAdjustmentObstacle: {
    coverage: "SOURCE_MISSING",
    reason: "No structured outcome, plan-adjustment event, or Follow-up obstacle field exists.",
  },
} as const;
