// @vitest-environment jsdom
// Form ↔ server contract: the goal plan form posts exactly what GOAL_PLAN_FORM_FIELDS /
// GOAL_PLAN_PROGRAM_FORM_FIELDS, the build*Input parsers and the request schemas accept.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { BOOKLET_PLAN_TEXT, bookletV1GoalTemplate } from "@/modules/goals/domain/goal-templates/booklet-v1";
import { goalPlanProgramSubmitRequestSchema, goalPlanSubmitRequestSchema } from "@/modules/goals/schemas/goal-schemas";
import {
  buildProgramSubmissionInput,
  buildSubmissionInput,
  GOAL_PLAN_FORM_FIELDS,
  GOAL_PLAN_PROGRAM_FORM_FIELDS,
} from "@/modules/goals/transport/goal-plan-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  relationship: vi.fn(),
  program: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/goals/transport/server-actions", () => ({
  submitGoalPlanAction: actions.relationship,
  submitGoalPlanForProgramAction: actions.program,
}));

import { GoalPlanForm, type GoalPlanFormScope } from "./goal-plan-form";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  program: "22222222-2222-4222-8222-222222222222",
  followup: "33333333-3333-4333-8333-333333333333",
  screening: "44444444-4444-4444-8444-444444444444",
  nonce: "55555555-5555-4555-8555-555555555555",
};
const patient = {
  patientHospitalRelationshipId: ids.relationship,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "66666666-6666-4666-8666-666666666666", name: "โรงพยาบาล ก" },
};
/** Legacy-template fields the booklet form never posts; the server still accepts them. */
const legacyOnlyFields = ["primaryGoalCode", "primaryGoalNote", "weeklyNote"];

beforeAll(() => {
  installFormContractEnvironment();
});

function section(container: HTMLElement, legend: string): HTMLFieldSetElement {
  const fieldset = [...container.querySelectorAll("fieldset")].find((node) => node.querySelector("legend")?.textContent === legend);
  if (!fieldset) throw new Error(`Missing section ${legend}`);
  return fieldset;
}

function chooseActivity(scope: HTMLElement, label: string): void {
  const option = [...scope.querySelectorAll("label")].find((node) => node.textContent?.trim() === label);
  clickElement(option?.querySelector('input[type="checkbox"]') ?? null);
}

function fillBookletPlan(container: HTMLElement): void {
  setFieldValue(container.querySelector('input[aria-label^="ฉันจะลดน้ำหนัก"]'), "3");
  const food = section(container, BOOKLET_PLAN_TEXT.food);
  setFieldValue(food.querySelector("textarea"), "ลดน้ำหวานและข้าวเย็น");
  chooseActivity(food, "ลดหวาน");
  const exercise = section(container, BOOKLET_PLAN_TEXT.exercise);
  setFieldValue(exercise.querySelector("textarea"), "เดินหลังอาหารเย็น");
  chooseActivity(exercise, "เดินออกกำลังกาย");
  const form = container.querySelector("form");
  submitForm(form, findButton(container, /บันทึก/u));
}

function renderForm(scope: GoalPlanFormScope) {
  return (
    <GoalPlanForm
      latestScreening={{ screeningAssessmentId: ids.screening, submittedAt: "2026-10-01T03:00:00.000Z", outcome: { kind: "PROMS", hasProblem: false, problemItemKeys: [], itemScores: {} } }}
      patient={patient}
      scope={scope}
      submissionNonce={ids.nonce}
      template={bookletV1GoalTemplate}
    />
  );
}

describe("Goal plan form ↔ goal plan server actions", () => {
  it("relationship plan posts the booklet through submitGoalPlanAction", async () => {
    actions.relationship.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => renderForm({ kind: "relationship", relationshipId: ids.relationship }),
      action: actions.relationship,
      interact: fillBookletPlan,
    });

    expect(expectFormContract(payload, {
      fields: GOAL_PLAN_FORM_FIELDS,
      notPosted: legacyOnlyFields,
      parse: buildSubmissionInput,
      schema: goalPlanSubmitRequestSchema,
    })).toMatchObject({
      patientHospitalRelationshipId: ids.relationship,
      sourceScreeningAssessmentId: ids.screening,
      items: [{ activityCode: "stop_sweet" }, { activityCode: "exercise_walk" }],
      booklet: { goals: { weightLossKg: 3 } },
    });
  });

  it("Program plan posts the Program and source Follow-up through submitGoalPlanForProgramAction", async () => {
    actions.program.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => renderForm({ kind: "program", relationshipId: ids.relationship, patientProgramId: ids.program, sourceFollowupId: ids.followup }),
      action: actions.program,
      interact: fillBookletPlan,
    });

    expect(expectFormContract(payload, {
      fields: GOAL_PLAN_PROGRAM_FORM_FIELDS,
      notPosted: legacyOnlyFields,
      parse: buildProgramSubmissionInput,
      schema: goalPlanProgramSubmitRequestSchema,
    })).toMatchObject({ patientProgramId: ids.program, sourceFollowupId: ids.followup });
  });

  it("Program plan without a source Follow-up still posts the empty field the parser reads as null", async () => {
    actions.program.mockResolvedValue({ status: "IDLE" });
    const payload = await captureSubmittedFormData({
      render: () => renderForm({ kind: "program", relationshipId: ids.relationship, patientProgramId: ids.program }),
      action: actions.program,
      interact: fillBookletPlan,
    });

    expect(expectFormContract(payload, {
      fields: GOAL_PLAN_PROGRAM_FORM_FIELDS,
      notPosted: legacyOnlyFields,
      parse: buildProgramSubmissionInput,
      schema: goalPlanProgramSubmitRequestSchema,
    })).toMatchObject({ patientProgramId: ids.program, sourceFollowupId: null });
  });
});
