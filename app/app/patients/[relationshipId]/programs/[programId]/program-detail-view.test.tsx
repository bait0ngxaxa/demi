import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PatientProgramDetail, PatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
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
import { PatientProgramView } from "../patient-program-view";

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
    floatingChart: { ...activity, summary: null, evidence: null },
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

  it("describes a bounded history list without implying an all-time total", () => {
    const completed = { ...detail, status: "COMPLETED" as const, completedAt: now };
    const context: PatientProgramPageContext = {
      patient, active: null, history: Array.from({ length: 50 }, (_, index) => ({ ...completed, programId: `history-${index}` })),
      canOpen: false, canManage: false,
    };
    const html = renderToStaticMarkup(createElement(PatientProgramView, { context }));
    expect(html).toContain("แสดง 50 โปรแกรมจากรายการที่โหลด");
    expect(html).not.toContain("มี 50 โปรแกรม");
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

  it("separates the active journey from completed history and retains Program opening", () => {
    const completed = { ...detail, programId: "historical-program", status: "COMPLETED" as const, completedAt: now };
    const context: PatientProgramPageContext = { patient, active: detail, history: [detail, completed], canOpen: false, canManage: true };
    const html = renderToStaticMarkup(createElement(PatientProgramView, { context }));
    expect(html).toContain(`/programs/${programId}#program-service-one`);
    expect(html).toContain(`/programs/${programId}#program-final`);
    expect(html).toContain('<details');
    expect(html).toContain("ประวัติโปรแกรมที่เสร็จสิ้น · อ่านอย่างเดียว");
    expect(html).toContain("/programs/historical-program");
    expect(html).toContain("แสดง 1 โปรแกรมจากรายการที่โหลด");
    expect(html).not.toContain("มี 1 โปรแกรม");
    expect(html).not.toContain("/programs/historical-program#");
    expect(html).not.toContain("<form");
    const empty = renderToStaticMarkup(createElement(PatientProgramView, { context: { ...context, active: null, canOpen: true } }));
    expect(empty).toContain("เปิดโปรแกรม");
    expect(empty).toContain("<form");
    const unavailable = renderToStaticMarkup(createElement(PatientProgramView, { context: { ...context, active: null, canOpen: false, canManage: false } }));
    expect(unavailable).not.toContain("<form");
    expect(unavailable).toContain("ไม่มีสิทธิ์เปิดหรือจบโปรแกรม");
  });
});
