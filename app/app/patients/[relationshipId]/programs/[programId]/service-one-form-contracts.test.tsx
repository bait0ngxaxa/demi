// @vitest-environment jsdom
// Form ↔ server contract: every Service 1 form, and the evidence association the attachment control
// builds, post exactly what the Service 1 allow-lists, build*Input parsers and request schemas accept.
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  patientProgramServiceOneArtifactAssociationRequestSchema,
  patientProgramServiceOneConfidenceRequestSchema,
  patientProgramServiceOneDreamCardRequestSchema,
  patientProgramServiceOneFloatingChartRequestSchema,
  patientProgramServiceOneRoutineRequestSchema,
} from "@/modules/patient-program/schemas/patient-program-service-one-schemas";
import type { PatientProgramServiceOneProjection } from "@/modules/patient-program/services/patient-program-service-one-query-service";
import {
  buildArtifactAssociationInput,
  buildConfidenceInput,
  buildDreamCardInput,
  buildFloatingChartInput,
  buildRoutineInput,
  SERVICE_ONE_ARTIFACT_ASSOCIATION_FORM_FIELDS,
  SERVICE_ONE_CONFIDENCE_FORM_FIELDS,
  SERVICE_ONE_DREAM_CARD_FORM_FIELDS,
  SERVICE_ONE_FLOATING_CHART_FORM_FIELDS,
  SERVICE_ONE_ROUTINE_FORM_FIELDS,
} from "@/modules/patient-program/transport/service-one-form-input";

import {
  captureSubmittedFormData,
  clickElement,
  expectFormContract,
  installFormContractEnvironment,
  setFieldValue,
  settleForm,
  submitForm,
} from "../../../../../../tests/support/form-contract";

const actions = vi.hoisted(() => ({
  associate: vi.fn(),
  confidence: vi.fn(),
  dream: vi.fn(),
  floating: vi.fn(),
  routine: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({
  associatePatientProgramServiceOneArtifactAction: actions.associate,
  recordPatientProgramServiceOneConfidenceAction: actions.confidence,
  recordPatientProgramServiceOneDreamCardAction: actions.dream,
  recordPatientProgramServiceOneFloatingChartAction: actions.floating,
  recordPatientProgramServiceOneRoutineAction: actions.routine,
}));
// The image optimizer needs a real canvas; the association payload does not depend on it.
vi.mock("@/modules/patient-evidence/client/patient-evidence-upload-payload", () => ({ replacePatientEvidenceFile: vi.fn() }));

import { EvidenceAttachmentControl, ServiceOneToolStep, type ServiceOneToolKey } from "./service-one-workspace";

const ids = {
  relationship: "11111111-1111-4111-8111-111111111111",
  program: "22222222-2222-4222-8222-222222222222",
  nonce: "33333333-3333-4333-8333-333333333333",
  artifact: "44444444-4444-4444-8444-444444444444",
};
const unrecorded = { recorded: false, recordedAt: null, recordedBy: null };
const serviceOne: PatientProgramServiceOneProjection = {
  routine: { ...unrecorded, routineDate: null, entries: [], evidence: null },
  floatingChart: { ...unrecorded, summary: null, scores: null, roundOneScores: null, evidence: null },
  dreamCard: { ...unrecorded, description: null, dream: null, obstacle: null, weeklyGoal: null, evidence: null },
  confidence: { ...unrecorded, score: null, improvementPlan: null },
};

beforeAll(() => {
  installFormContractEnvironment();
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of [actions.confidence, actions.dream, actions.floating, actions.routine]) {
    action.mockResolvedValue({ status: "IDLE" });
  }
});

function renderTool(tool: ServiceOneToolKey, submissionNonce: string | null = ids.nonce) {
  return (
    <ServiceOneToolStep
      canManage
      nextHref={null}
      programId={ids.program}
      relationshipId={ids.relationship}
      roundNumber={1}
      serviceOne={serviceOne}
      submissionNonce={submissionNonce ?? undefined}
      tool={tool}
    />
  );
}

function submit(container: HTMLElement): void {
  const form = container.querySelector("form");
  submitForm(form, form?.querySelector<HTMLButtonElement>('button[type="submit"]'));
}

function fillRoutine(container: HTMLElement): void {
  setFieldValue(container.querySelector('[name="routineDate"]'), "2026-10-20");
  const rowInputs = [...container.querySelectorAll<HTMLInputElement>('input[type="text"]')];
  setFieldValue(rowInputs[0] ?? null, "06:00");
  setFieldValue(rowInputs[1] ?? null, "เดินรอบหมู่บ้าน");
  setFieldValue(rowInputs[2] ?? null, "เพิ่มเป็น 30 นาที");
  submit(container);
}

describe("Service 1 forms ↔ Service 1 server actions", () => {
  it("routine posts the date and the serialized entries", async () => {
    const payload = await captureSubmittedFormData({ render: () => renderTool("routine"), action: actions.routine, interact: fillRoutine });

    expect(expectFormContract(payload, {
      fields: SERVICE_ONE_ROUTINE_FORM_FIELDS,
      parse: buildRoutineInput,
      schema: patientProgramServiceOneRoutineRequestSchema,
    })).toMatchObject({ routineDate: "2026-10-20", entries: [{ timeText: "06:00", activity: "เดินรอบหมู่บ้าน" }] });
  });

  it("routine without a submission nonce posts no nonce key", async () => {
    const payload = await captureSubmittedFormData({ render: () => renderTool("routine", null), action: actions.routine, interact: fillRoutine });

    expect(expectFormContract(payload, {
      fields: SERVICE_ONE_ROUTINE_FORM_FIELDS,
      notPosted: ["submissionNonce"],
      parse: buildRoutineInput,
      schema: patientProgramServiceOneRoutineRequestSchema,
    })).toMatchObject({ roundNumber: 1 });
  });

  it("floating chart posts every score and the summary", async () => {
    const payload = await captureSubmittedFormData({
      render: () => renderTool("floatingChart"),
      action: actions.floating,
      interact: (container) => {
        for (const range of container.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
          setFieldValue(range, "4");
        }
        setFieldValue(container.querySelector('[name="summary"]'), "ครอบครัวสนับสนุนดี");
        submit(container);
      },
    });

    expect(expectFormContract(payload, {
      fields: SERVICE_ONE_FLOATING_CHART_FORM_FIELDS,
      parse: buildFloatingChartInput,
      schema: patientProgramServiceOneFloatingChartRequestSchema,
    })).toMatchObject({ familyScore: 4, wellbeingScore: 4, summary: "ครอบครัวสนับสนุนดี" });
  });

  it("dream card posts the dream, obstacle and weekly goal", async () => {
    const payload = await captureSubmittedFormData({
      render: () => renderTool("dreamCard"),
      action: actions.dream,
      interact: (container) => {
        setFieldValue(container.querySelector('[name="dream"]'), "อยากไปเที่ยวกับหลาน");
        setFieldValue(container.querySelector('[name="obstacle"]'), "เหนื่อยง่าย");
        setFieldValue(container.querySelector('[name="weeklyGoal"]'), "เดินวันละ 20 นาที");
        submit(container);
      },
    });

    expect(expectFormContract(payload, {
      fields: SERVICE_ONE_DREAM_CARD_FORM_FIELDS,
      parse: buildDreamCardInput,
      schema: patientProgramServiceOneDreamCardRequestSchema,
    })).toMatchObject({ dream: "อยากไปเที่ยวกับหลาน", weeklyGoal: "เดินวันละ 20 นาที" });
  });

  it("confidence posts the score and the improvement plan", async () => {
    const payload = await captureSubmittedFormData({
      render: () => renderTool("confidence"),
      action: actions.confidence,
      interact: (container) => {
        clickElement(container.querySelector('input[name="score"][value="7"]'));
        setFieldValue(container.querySelector('[name="improvementPlan"]'), "ลองเดินเพิ่มวันเสาร์");
        submit(container);
      },
    });

    expect(expectFormContract(payload, {
      fields: SERVICE_ONE_CONFIDENCE_FORM_FIELDS,
      parse: buildConfidenceInput,
      schema: patientProgramServiceOneConfidenceRequestSchema,
    })).toMatchObject({ score: 7, improvementPlan: "ลองเดินเพิ่มวันเสาร์" });
  });

  it("evidence attachment posts the association the server accepts after the upload", async () => {
    actions.associate.mockResolvedValue({ status: "SUCCESS", result: { operation: "ASSOCIATED" } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ artifactId: ids.artifact }), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);

    try {
      const payload = await captureSubmittedFormData({
        render: () => (
          <EvidenceAttachmentControl
            activityKey="ROUTINE"
            canManage
            evidence={null}
            label="รูปตารางชีวิต"
            programId={ids.program}
            recorded
            relationshipId={ids.relationship}
            roundNumber={1}
          />
        ),
        action: actions.associate,
        interact: async (container) => {
          const fileInput = container.querySelector<HTMLInputElement>('input[name="file"]');
          if (!fileInput) throw new Error("Missing file input");
          const file = new File(["image"], "routine.jpg", { type: "image/jpeg" });
          Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
          const form = fileInput.form;
          await act(async () => {
            form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
          });
          await settleForm();
        },
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(expectFormContract(payload, {
        fields: SERVICE_ONE_ARTIFACT_ASSOCIATION_FORM_FIELDS,
        parse: buildArtifactAssociationInput,
        schema: patientProgramServiceOneArtifactAssociationRequestSchema,
      })).toEqual({ patientProgramId: ids.program, roundNumber: 1, activity: "ROUTINE", patientEvidenceArtifactId: ids.artifact });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
