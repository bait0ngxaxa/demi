import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PatientProgramDetail, PatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import type { ProgramRoundsOverview } from "@/modules/patient-program-rounds/services/round-query-service";
import type { PatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import type { GoalPlanProgramOverview } from "@/modules/goals/services/goal-query-service";
import type { FollowupProgramHistory } from "@/modules/followups/services/followup-query-service";
import type { PatientFinalAssessmentProjection } from "@/modules/patient-final-assessment/services/patient-final-assessment-query-service";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/patient-program/transport/server-actions", () => ({
  openPatientProgramAction: vi.fn(), completePatientProgramAction: vi.fn(),
}));
vi.mock("@/modules/patient-final-assessment/transport/server-actions", () => ({ createPatientFinalAssessmentAction: vi.fn() }));
vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({
  associatePatientProgramServiceOneArtifactAction: vi.fn(),
  recordPatientProgramServiceOneConfidenceAction: vi.fn(),
  recordPatientProgramServiceOneDreamCardAction: vi.fn(),
  recordPatientProgramServiceOneFloatingChartAction: vi.fn(),
  recordPatientProgramServiceOneRoutineAction: vi.fn(),
}));

import { PatientProgramDetailView } from "./program-detail-view";
import { CompletedPatientPrograms, PatientProgramView } from "../patient-program-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-01T05:00:00Z");
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วยชื่อยาวสำหรับการดูแลต่อเนื่อง",
  hospitalNumber: "HN-001",
  hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
};
const activity = { recorded: false, recordedAt: null, recordedBy: null };
const detail: PatientProgramDetail = {
  programId, patientHospitalRelationshipId: relationshipId, patient,
  status: "ACTIVE", startedAt: now, completedAt: null, createdAt: now,
  createdBy: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้เปิดโปรแกรม" },
  initialBaseline: null, canManage: true,
  serviceOne: [{
    roundNumber: 1,
    listedTools: ["routine", "floatingChart", "confidence"],
    routine: { ...activity, routineDate: null, entries: [], evidence: null },
    floatingChart: { ...activity, summary: null, scores: null, roundOneScores: null, evidence: null },
    dreamCard: { ...activity, description: null, dream: null, obstacle: null, weeklyGoal: null, evidence: null },
    confidence: { ...activity, score: null, improvementPlan: null },
  }],
};
const goalPatient = { ...patient, patientProfileId: "55555555-5555-4555-8555-555555555555", hospitalName: patient.hospital.name };
const overview: GoalPlanProgramOverview = {
  patient: goalPatient, patientProgramId: programId, latestScreening: null, latest: null, items: [],
};
const history: FollowupProgramHistory = {
  patient: goalPatient, patientProgramId: programId, canRecord: true, items: [], totalCount: 0,
};
const finalAssessment: PatientFinalAssessmentProjection = {
  patientProgramId: programId, patientHospitalRelationshipId: relationshipId, programStatus: "ACTIVE", finalAssessment: null,
};
const baseline: PatientBaselineNavigationState = { baseline: null, canCreate: false };
const careOverview: ProgramRoundsOverview = {
  patientHospitalRelationshipId: relationshipId,
  patientProgramId: programId,
  programStatus: "ACTIVE",
  rounds: Array.from({ length: 6 }, (_, index) => ({
    roundNumber: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    title: `ครั้งที่ ${index + 1}`,
    state: index === 0 ? "NOT_STARTED" : "LOCKED",
    resolvedItems: 0,
    totalItems: 2,
    completedAt: null,
    completedByDisplayName: null,
  })),
  after: { state: "LOCKED", date: null, recordedByDisplayName: null },
};

function renderProgram(overrides: Partial<Parameters<typeof PatientProgramDetailView>[0]> = {}): string {
  return renderToStaticMarkup(createElement(PatientProgramDetailView, {
    detail, finalAssessment, followupHistory: history, goalPlanOverview: overview, latestGoalPlan: null, ...overrides,
  }));
}

describe("Patient care journey and Program workspace", () => {
  it("connects every section and preserves scoped destinations without imposing prerequisites", () => {
    const html = renderProgram();
    for (const id of ["program-service-one", "program-goals", "program-followups", "program-final"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    for (const path of ["report", "goals/new", "followups/new"]) {
      expect(html).toContain(`/app/patients/${relationshipId}/programs/${programId}/${path}`);
    }
    expect(html.match(new RegExp(`href="/app/patients/${relationshipId}"`, "gu"))).toHaveLength(2);
    expect(html.match(/กลับไปยังรายละเอียดผู้ป่วย/gu)).toHaveLength(1);
    expect(html).toContain("ไม่ต้องทำตามลำดับ");
    expect(html).toContain("ยังไม่มีบันทึกกิจกรรม");
    expect(html).toContain("ยังไม่มีแผนเป้าหมาย");
    expect(html.match(/href="[^"]+\/goals\/new"/gu)).toHaveLength(1);
    expect(html.match(/href="[^"]+\/followups\/new"/gu)).toHaveLength(1);
    expect(html).toContain("จบโปรแกรม");
    expect(html).toContain("บันทึก Final Assessment");
  });

  it("labels actual record presence independently of clinical completion", () => {
    const html = renderProgram({
      detail: { ...detail, serviceOne: detail.serviceOne.map((round) => ({ ...round, routine: { ...round.routine, recorded: true, recordedAt: now } })) },
      followupHistory: { ...history, totalCount: 1 },
      finalAssessment: { ...finalAssessment, finalAssessment: {
        id: "final-record", recordedBy: detail.createdBy, serviceDate: now, recordedAt: now, createdAt: now,
        measurements: { weight: 70, waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null, hba1c: null, cvdRiskScore: null },
      } },
    });
    expect(html).toContain("มีบันทึกกิจกรรม");
    expect(html).toContain("มีบันทึกการติดตามผล");
    expect(html).toContain("มีบันทึกการประเมินสุดท้าย");
    expect(html).toContain("ยังไม่มีแผนเป้าหมาย");
    expect(html).not.toContain("ครบ 6");
  });

  it("keeps completed Programs historical with no mutation controls even if management capability exists", () => {
    const html = renderProgram({
      detail: { ...detail, status: "COMPLETED", completedAt: now },
      finalAssessment: { ...finalAssessment, programStatus: "COMPLETED" },
    });
    expect(html).toContain("อยู่ในประวัติแบบอ่านอย่างเดียว");
    expect(html).toContain("บันทึกในโปรแกรม");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/goals/new");
    expect(html).not.toContain("/followups/new");
    expect(html).toContain(`/programs/${programId}/report`);
  });

  it("renders completed Programs inline as read-only history", () => {
    const completed = { ...detail, status: "COMPLETED" as const, completedAt: now };
    const programs = Array.from({ length: 50 }, (_, index) => ({ ...completed, programId: `history-${index}` }));
    const html = renderToStaticMarkup(createElement(CompletedPatientPrograms, { programs, relationshipId }));
    expect(html).toContain("โปรแกรมที่จบแล้ว");
    expect(html).toContain("/programs/history-49");
    expect(html).not.toContain("<form");
  });

  it("honors read-only and Follow-up capability flags independently", () => {
    const html = renderProgram({ detail: { ...detail, canManage: false }, followupHistory: { ...history, canRecord: false } });
    expect(html).toContain("ไม่มีสิทธิ์จัดการโปรแกรม");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/goals/new");
    expect(html).not.toContain("/followups/new");
    const followupDenied = renderProgram({ followupHistory: { ...history, canRecord: false } });
    expect(followupDenied).toContain("/goals/new");
    expect(followupDenied).not.toContain("/followups/new");
  });

  it("guides the current Program through sequential rounds and keeps completed history separate", () => {
    const completed = { ...detail, programId: "historical-program", status: "COMPLETED" as const, completedAt: now };
    const context: PatientProgramPageContext = { patient, active: detail, latest: detail, history: [detail], canOpen: false, canManage: true };
    const journey = renderToStaticMarkup(createElement(PatientProgramView, {
      baseline,
      context,
      overview: careOverview,
      roundsError: false,
    }));
    const historyHtml = renderToStaticMarkup(createElement(CompletedPatientPrograms, {
      programs: [detail, completed],
      relationshipId,
    }));

    expect(journey).toContain('id="patient-care"');
    expect(journey).toContain(`/programs/${programId}/rounds/1`);
    expect(journey).not.toContain(`/programs/${programId}/rounds/2`);
    expect(journey).toContain('aria-disabled="true"');
    expect(journey).toContain("จบครั้งที่ 6 ก่อนจึงจะเปิด After ได้");
    expect(journey).not.toContain("ไม่จำเป็นต้องทำตามลำดับ");
    expect(journey).not.toContain(`/programs/${programId}#program-service-one`);
    expect(journey).not.toContain(`/programs/${programId}#program-goals`);
    expect(journey).not.toContain(`/programs/${programId}#program-followups`);
    expect(historyHtml).toContain("/programs/historical-program");
    expect(historyHtml).toContain("ดูโปรแกรมที่จบแล้ว");
    expect(historyHtml).not.toContain("<form");
  });
});
