// @vitest-environment jsdom
// Form ↔ server contract: the screening form posts exactly what screeningFormFields(questionSet),
// buildSubmissionInput and screeningSubmitRequestSchema accept, for every current instrument.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CURRENT_INSTRUMENT_QUESTION_SETS } from "@/modules/screening/domain/question-sets";
import { screeningSubmitRequestSchema } from "@/modules/screening/schemas/screening-schemas";
import { buildSubmissionInput, screeningFormFields } from "@/modules/screening/transport/screening-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  installFormContractEnvironment,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  submit: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/screening/transport/server-actions", () => ({ submitScreeningAction: actions.submit }));

import { ScreeningForm } from "./screening-form";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  program: "22222222-2222-4222-8222-222222222222",
  nonce: "33333333-3333-4333-8333-333333333333",
};
const patient = { displayName: "สมชาย ผู้ป่วย", hospitalNumber: "HN-001", hospital: { name: "โรงพยาบาล ก" } };

beforeAll(() => {
  installFormContractEnvironment();
});

function answerEveryQuestion(container: HTMLElement): void {
  const names = [...new Set([...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((radio) => radio.name))];
  for (const name of names) {
    const options = container.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`);
    clickElement(options[options.length - 1] ?? null);
  }
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

describe("Screening form ↔ submitScreeningAction", () => {
  for (const questionSet of Object.values(CURRENT_INSTRUMENT_QUESTION_SETS)) {
    it(`${questionSet.instrument}: posts one answer per question`, async () => {
      actions.submit.mockResolvedValue({ status: "IDLE" });
      const payload = await captureSubmittedFormData({
        render: () => <ScreeningForm patient={patient} questionSet={questionSet} relationshipId={ids.relationship} submissionNonce={ids.nonce} />,
        action: actions.submit,
        interact: (container) => {
          if (questionSet.instrument === "PROMS") {
            for (const fieldset of container.querySelectorAll("fieldset")) {
              const scale = fieldset.getAttribute("aria-describedby");
              expect(scale && document.getElementById(scale)?.textContent).toBe(questionSet.scaleLabel);
              const labels = [...fieldset.querySelectorAll("label")];
              expect(labels.map((label) => label.textContent)).toEqual(["1", "2", "3", "4", "5"]);
              expect(labels.map((label) => label.querySelector("input")?.value)).toEqual(["1", "2", "3", "4", "5"]);
              const faces = labels.map((label) => label.querySelector('svg[aria-hidden="true"]'));
              expect(faces.every(Boolean)).toBe(true);
              expect(new Set(faces.map((face) => face?.outerHTML)).size).toBe(5);
            }
          }
          answerEveryQuestion(container);
        },
      });

      const parsed = expectFormContract(payload, {
        fields: screeningFormFields(questionSet),
        notPosted: ["patientProgramId"],
        parse: buildSubmissionInput,
        schema: screeningSubmitRequestSchema,
      });
      expect(parsed).toMatchObject({ instrument: questionSet.instrument, patientHospitalRelationshipId: ids.relationship });
      expect(Object.keys((parsed as { responses: { answers: object } }).responses.answers)).toHaveLength(questionSet.questions.length);
    });

    it(`${questionSet.instrument}: from round 1 of a Program also posts the Program`, async () => {
      actions.submit.mockResolvedValue({ status: "IDLE" });
      const payload = await captureSubmittedFormData({
        render: () => (
          <ScreeningForm patient={patient} programId={ids.program} questionSet={questionSet} relationshipId={ids.relationship} submissionNonce={ids.nonce} />
        ),
        action: actions.submit,
        interact: answerEveryQuestion,
      });

      expect(expectFormContract(payload, {
        fields: screeningFormFields(questionSet),
        parse: buildSubmissionInput,
        schema: screeningSubmitRequestSchema,
      })).toMatchObject({ patientProgramId: ids.program });
    });
  }
});
