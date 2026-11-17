// @vitest-environment jsdom
// Form ↔ server contract: every round form posts exactly what its server-side allow-list,
// build*Input parser and request schema accept (see tests/support/form-contract.ts).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  roundAchieveScoreRequestSchema,
  roundCompletionRequestSchema,
  roundProfileRequestSchema,
  roundReviewRequestSchema,
  roundStepSkipRequestSchema,
  roundStepUnskipRequestSchema,
  roundVitalsRequestSchema,
} from "@/modules/patient-program-rounds/schemas/round-schemas";
import {
  ACHIEVE_SCORE_FORM_FIELDS,
  buildAchieveScoreInput,
  buildCompletionInput,
  buildProfileInput,
  buildReviewInput,
  buildStepSkipInput,
  buildStepUnskipInput,
  buildVitalsInput,
  COMPLETION_FORM_FIELDS,
  PROFILE_FORM_FIELDS,
  REVIEW_FORM_FIELDS,
  STEP_FORM_FIELDS,
  VITALS_FORM_FIELDS,
} from "@/modules/patient-program-rounds/transport/server-action-helpers";

import {
  captureSubmittedFormData,
  clickButton,
  clickElement,
  expectFormContract,
  findButton,
  installFormContractEnvironment,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  complete: vi.fn(),
  profile: vi.fn(),
  review: vi.fn(),
  score: vi.fn(),
  skip: vi.fn(),
  unskip: vi.fn(),
  vitals: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  completePatientProgramRoundAction: actions.complete,
  recordPatientProgramRoundProfileAction: actions.profile,
  recordPatientProgramRoundReviewAction: actions.review,
  recordPatientProgramRoundVitalsAction: actions.vitals,
  recordRoundAchieveScoreAction: actions.score,
  skipPatientProgramRoundStepAction: actions.skip,
  unskipPatientProgramRoundStepAction: actions.unskip,
}));

import { RoundAchieveScoreForm } from "./round-achieve-score-form";
import { RoundReviewButton } from "./round-review-button";
import { CompleteRoundControl, RoundProfileForm, SkipStepControl, UnskipStepControl } from "./round-step-controls";
import { RoundVitalsForm } from "./round-vitals-form";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  program: "22222222-2222-4222-8222-222222222222",
  nonce: "33333333-3333-4333-8333-333333333333",
  planItem: "44444444-4444-4444-8444-444444444444",
};
const target = { patientHospitalRelationshipId: ids.relationship, patientProgramId: ids.program, roundNumber: 2 };
const idle = { status: "IDLE" } as const;

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of [actions.complete, actions.profile, actions.review, actions.score, actions.skip, actions.unskip, actions.vitals]) {
    action.mockResolvedValue(idle);
  }
});

function field(container: HTMLElement, name: string): Element | null {
  return container.querySelector(`[name="${name}"]`);
}

function submitFirstForm(container: HTMLElement): void {
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

const vitalsProps = {
  heightEditable: true,
  latestHeightCm: 165,
  nextHref: "/next",
  occupation: "ค้าขาย",
  patientDisplayName: "สมชาย ผู้ป่วย",
  patientHospitalRelationshipId: ids.relationship,
  patientProgramId: ids.program,
  profile: null,
  roundNumber: 2,
  submissionNonce: ids.nonce,
  todayServiceDate: "2026-11-02",
};
const vitalsContract = { fields: VITALS_FORM_FIELDS, parse: buildVitalsInput, schema: roundVitalsRequestSchema };
const profileFields = ["preferredName", "occupation", "profileVersion"];

describe("Round vitals form ↔ recordPatientProgramRoundVitalsAction", () => {
  it("first record (round 2) posts every measurement and no profile fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <RoundVitalsForm {...vitalsProps} />,
      action: actions.vitals,
      interact: (container) => {
        setFieldValue(field(container, "weight"), "68.5");
        setFieldValue(field(container, "waistCircumference"), "82");
        setFieldValue(field(container, "systolicBloodPressure"), "128");
        setFieldValue(field(container, "diastolicBloodPressure"), "82");
        setFieldValue(field(container, "bloodSugar"), "104");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { ...vitalsContract, notPosted: profileFields })).toMatchObject({
      patientProgramId: ids.program,
      roundNumber: 2,
      weight: 68.5,
      heightCm: 165,
      bloodSugar: 104,
    });
  });

  it("round 1 also posts the profile fields", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundVitalsForm
          {...vitalsProps}
          occupation={null}
          profile={{ preferredName: null, occupation: null, profileVersion: 3 }}
          roundNumber={1}
        />
      ),
      action: actions.vitals,
      interact: (container) => {
        setFieldValue(field(container, "occupation"), "เกษตรกร");
        setFieldValue(field(container, "preferredName"), "ลุงชาย");
        setFieldValue(field(container, "weight"), "70");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, vitalsContract))
      .toMatchObject({ roundNumber: 1, preferredName: "ลุงชาย", occupation: "เกษตรกร", profileVersion: 3, weight: 70 });
  });

  it("patient self-record of round 1 posts the profile version without the profile inputs", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundVitalsForm
          {...vitalsProps}
          patientMode
          profile={{ preferredName: "ลุงชาย", occupation: "ค้าขาย", profileVersion: 3 }}
          roundNumber={1}
        />
      ),
      action: actions.vitals,
      interact: (container) => {
        setFieldValue(field(container, "bloodSugar"), "98");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { ...vitalsContract, notPosted: ["preferredName", "occupation"] }))
      .toMatchObject({ roundNumber: 1, bloodSugar: 98, preferredName: null });
  });

  it("re-record with saved values posts the same fields as the first record", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundVitalsForm
          {...vitalsProps}
          defaultServiceDate="2026-10-30"
          initialValues={{ weight: 69, heightCm: 165, waistCircumference: 83, bloodSugar: null, systolicBloodPressure: 130, diastolicBloodPressure: 85 }}
        />
      ),
      action: actions.vitals,
      interact: (container) => {
        setFieldValue(field(container, "weight"), "68");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { ...vitalsContract, notPosted: profileFields }))
      .toMatchObject({ serviceDate: "2026-10-30", weight: 68, bloodSugar: null, systolicBloodPressure: 130 });
  });

  it("supplement posts only the missing measurements and the recorded service date", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundVitalsForm {...vitalsProps} supplement={{ serviceDate: "2026-10-30", missing: ["waistCircumference", "bloodSugar"] }} />
      ),
      action: actions.vitals,
      interact: (container) => {
        setFieldValue(field(container, "bloodSugar"), "110");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, {
      ...vitalsContract,
      notPosted: [...profileFields, "weight", "heightCm", "systolicBloodPressure", "diastolicBloodPressure"],
    })).toMatchObject({ serviceDate: "2026-10-30", bloodSugar: 110, waistCircumference: null, weight: null });
  });
});

describe("Round step controls ↔ round server actions", () => {
  it("profile form posts the preferred name and an empty occupation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundProfileForm
          nextHref="/next"
          occupation={null}
          preferredName={null}
          profileVersion={4}
          submissionNonce={ids.nonce}
          target={{ ...target, roundNumber: 1 }}
        />
      ),
      action: actions.profile,
      interact: (container) => {
        setFieldValue(field(container, "preferredName"), "ป้าแดง");
        setFieldValue(field(container, "occupation"), "แม่บ้าน");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { fields: PROFILE_FORM_FIELDS, parse: buildProfileInput, schema: roundProfileRequestSchema }))
      .toMatchObject({ preferredName: "ป้าแดง", occupation: "แม่บ้าน", profileVersion: 4, submissionNonce: ids.nonce });
  });

  it("patient profile form posts no occupation and no nonce when none is given", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundProfileForm nextHref="/next" occupation={null} patientMode preferredName="ป้าแดง" profileVersion={null} target={{ ...target, roundNumber: 1 }} />
      ),
      action: actions.profile,
      interact: submitFirstForm,
    });

    expect(expectFormContract(payload, {
      fields: PROFILE_FORM_FIELDS,
      notPosted: ["occupation", "submissionNonce"],
      parse: buildProfileInput,
      schema: roundProfileRequestSchema,
    })).toMatchObject({ preferredName: "ป้าแดง", profileVersion: null });
  });

  it("skip dialog posts the plan item, the reason and the note", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <SkipStepControl nextHref="/next" planItemId={ids.planItem} stepLabel="วัดสัญญาณชีพ" target={target} />,
      action: actions.skip,
      interact: (container) => {
        clickButton(container, "ข้ามรายการนี้");
        clickElement(document.querySelector('input[name="reasonCode"][value="OTHER"]'));
        setFieldValue(document.querySelector('textarea[name="note"]'), "เครื่องวัดความดันเสีย");
        const button = findButton(document.body, "บันทึกการข้าม");
        submitForm(button.form, button);
      },
    });

    expect(expectFormContract(payload, { fields: STEP_FORM_FIELDS, parse: buildStepSkipInput, schema: roundStepSkipRequestSchema }))
      .toMatchObject({ planItemId: ids.planItem, reasonCode: "OTHER", note: "เครื่องวัดความดันเสีย" });
  });

  it("unskip posts the plan item only", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <UnskipStepControl planItemId={ids.planItem} target={target} />,
      action: actions.unskip,
      interact: submitFirstForm,
    });

    expect(expectFormContract(payload, {
      fields: STEP_FORM_FIELDS,
      notPosted: ["reasonCode", "note"],
      parse: buildStepUnskipInput,
      schema: roundStepUnskipRequestSchema,
    })).toEqual({ patientProgramId: ids.program, roundNumber: 2, planItemId: ids.planItem });
  });

  it("completion posts the round target and nonce after confirmation", async () => {
    const payload = await captureSubmittedFormData({
      render: () => <CompleteRoundControl roundsHref="/rounds" submissionNonce={ids.nonce} target={target} />,
      action: actions.complete,
      interact: async (container) => {
        submitFirstForm(container);
        const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((button) => button.textContent?.includes("จบบริการครั้งที่ 2"));
        clickElement(confirm ?? null);
        await settleForm();
      },
    });

    expect(expectFormContract(payload, { fields: COMPLETION_FORM_FIELDS, parse: buildCompletionInput, schema: roundCompletionRequestSchema }))
      .toEqual({ patientProgramId: ids.program, roundNumber: 2, submissionNonce: ids.nonce });
  });
});

describe("Round review and Achieve score ↔ round server actions", () => {
  it("review button posts the tool code", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundReviewButton
          label="ทบทวน PAM แล้ว"
          patientHospitalRelationshipId={ids.relationship}
          patientProgramId={ids.program}
          roundNumber={2}
          submissionNonce={ids.nonce}
          toolCode="PAM"
        />
      ),
      action: actions.review,
      interact: submitFirstForm,
    });

    expect(expectFormContract(payload, { fields: REVIEW_FORM_FIELDS, parse: buildReviewInput, schema: roundReviewRequestSchema }))
      .toMatchObject({ toolCode: "PAM", roundNumber: 2 });
  });

  it("Achieve score posts the score", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundAchieveScoreForm achieveScore={{ editable: true, score: null, computedRatePercent: 75 }} submissionNonce={ids.nonce} target={target} />
      ),
      action: actions.score,
      interact: (container) => {
        setFieldValue(field(container, "score"), "82.5");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { fields: ACHIEVE_SCORE_FORM_FIELDS, parse: buildAchieveScoreInput, schema: roundAchieveScoreRequestSchema }))
      .toMatchObject({ score: 82.5 });
  });

  it("a blank Achieve score posts the score key so the server clears it", async () => {
    const payload = await captureSubmittedFormData({
      render: () => (
        <RoundAchieveScoreForm achieveScore={{ editable: true, score: 60, computedRatePercent: null }} submissionNonce={ids.nonce} target={target} />
      ),
      action: actions.score,
      interact: (container) => {
        setFieldValue(field(container, "score"), "");
        submitFirstForm(container);
      },
    });

    expect(expectFormContract(payload, { fields: ACHIEVE_SCORE_FORM_FIELDS, parse: buildAchieveScoreInput, schema: roundAchieveScoreRequestSchema }))
      .toMatchObject({ score: null });
  });
});
