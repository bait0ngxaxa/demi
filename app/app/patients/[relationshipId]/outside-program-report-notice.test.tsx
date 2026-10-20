import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPrototypeQuestionSet } from "@/modules/screening/domain/question-sets";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/modules/screening/transport/server-actions", () => ({ submitScreeningAction: vi.fn() }));
vi.mock("@/modules/followups/transport/server-actions", () => ({
  createFollowupAction: vi.fn(),
  createFollowupForProgramAction: vi.fn(),
}));

const { ScreeningForm } = await import("./screenings/new/screening-form");
const { FollowupForm } = await import("./followups/new/followup-form");

const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "ทดสอบ ผู้ป่วย",
  hospitalNumber: null,
  hospital: { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลทดสอบ" },
};
const NOTICE = "บันทึกนอก Program จึงจะไม่อยู่ในรายงานโรงพยาบาลตาม Program (ไฟล์ Excel)";

function screening(withProgram: boolean): string {
  return renderToStaticMarkup(createElement(ScreeningForm, {
    patient,
    programId: withProgram ? programId : undefined,
    questionSet: getPrototypeQuestionSet(),
    relationshipId,
    submissionNonce: "44444444-4444-4444-8444-444444444444",
  }));
}

function followup(withProgram: boolean): string {
  return renderToStaticMarkup(createElement(FollowupForm, {
    appointments: [],
    goalPlans: [],
    patient,
    scope: withProgram ? { kind: "program", relationshipId, patientProgramId: programId } : { kind: "relationship", relationshipId },
    selectedAppointmentId: null,
    selectedGoalPlanId: null,
    submissionNonce: "55555555-5555-4555-8555-555555555555",
    todayServiceDate: "2026-10-20",
  }));
}

describe("relationship-scope care forms (P1 Part D)", () => {
  it("tell staff a screening outside a Program will not appear in the Program report", () => {
    expect(screening(false)).toContain(`แบบประเมินนี้${NOTICE}`);
    expect(screening(true)).not.toContain(NOTICE);
  });

  it("tell staff a follow-up outside a Program will not appear in the Program report", () => {
    expect(followup(false)).toContain(`การติดตามผลนี้${NOTICE}`);
    expect(followup(true)).not.toContain(NOTICE);
  });
});
