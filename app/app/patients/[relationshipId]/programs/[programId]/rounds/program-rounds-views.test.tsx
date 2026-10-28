// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildProgramRoundDetail, buildProgramRoundsOverview, type ProgramRoundRecord } from "@/modules/patient-program-rounds/services/round-query-service";
import { roundGuideline } from "@/modules/patient-program-rounds/domain/round-steps";
import { parseRoundReturnPath } from "@/modules/patient-program-rounds/presentation/round-return-path";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  addRoundPlanItemAction: vi.fn(),
  removeRoundPlanItemAction: vi.fn(),
  markCustomItemDoneAction: vi.fn(),
  unmarkCustomItemDoneAction: vi.fn(),
  addProgramRoundAction: vi.fn(),
  completePatientProgramRoundAction: vi.fn(),
  recordPatientProgramRoundProfileAction: vi.fn(),
  recordPatientProgramRoundReviewAction: vi.fn(),
  recordPatientProgramRoundVitalsAction: vi.fn(),
  skipPatientProgramRoundStepAction: vi.fn(),
  unskipPatientProgramRoundStepAction: vi.fn(),
}));
vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({
  associatePatientProgramServiceOneArtifactAction: vi.fn(),
  recordPatientProgramServiceOneConfidenceAction: vi.fn(),
  recordPatientProgramServiceOneDreamCardAction: vi.fn(),
  recordPatientProgramServiceOneFloatingChartAction: vi.fn(),
  recordPatientProgramServiceOneRoutineAction: vi.fn(),
}));

import { ProgramRoundsOverviewView } from "./program-rounds-overview-view";
import { ProgramRoundDetailView, type RoundCurrentStep } from "./[roundNumber]/program-round-detail-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };
const at = new Date("2026-10-01T03:00:00Z");
const roundPath = (round: number) => `/app/patients/${relationshipId}/programs/${programId}/rounds/${round}`;
const nonces = {
  vitals: "55555555-5555-4555-8555-555555555555",
  completion: "66666666-6666-4666-8666-666666666666",
  review: {
    PAM: "77777777-7777-4777-8777-777777777771",
    PROMS: "77777777-7777-4777-8777-777777777772",
    HEALTH_PATH: "77777777-7777-4777-8777-777777777773",
  },
};

/** ADR-0022: round 1 and each guideline round after a completed one are opened with their guideline plan. */
function openedRounds(completedRounds: readonly number[]): Record<string, unknown>[] {
  const numbers = new Set([1, ...completedRounds.map((round) => round + 1).filter((round) => round <= 6)]);

  return [...numbers].sort((left, right) => left - right).map((roundNumber) => ({
    roundNumber,
    planItems: roundGuideline(roundNumber).map((definition, index) => ({
      id: `plan-${roundNumber}-${definition.code}`,
      stepCode: definition.code,
      customTitle: null,
      position: index + 1,
      removedAt: null,
      doneAt: null,
      doneByUser: null,
    })),
  }));
}

function record(overrides: Record<string, unknown> = {}): ProgramRoundRecord {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: "ACTIVE",
    patientHospitalRelationship: { hospitalProfile: { occupation: "เกษตรกร", preferredName: null, version: 1 } },
    initialBaseline: { heightCm: 160 },
    rounds: openedRounds(((overrides.roundCompletions ?? []) as { roundNumber: number }[]).map((row) => row.roundNumber)),
    roundVitals: [],
    roundActivities: [],
    roundCompletions: [],
    roundStepSkips: [],
    screeningAssessments: [],
    serviceOneRoutines: [],
    serviceOneFloatingCharts: [],
    serviceOneDreamCards: [],
    serviceOneConfidences: [],
    goalPlans: [],
    followups: [],
    finalAssessment: null,
    ...overrides,
  } as unknown as ProgramRoundRecord;
}

const completion = (roundNumber: number) => ({ roundNumber, completedAt: at, completedByUser: recorder });

function renderDetail(
  roundNumber: 1 | 2 | 3 | 4 | 5 | 6,
  currentStep: RoundCurrentStep,
  overrides: Record<string, unknown> = {},
  canManage = true,
): string {
  const detail = buildProgramRoundDetail(record(overrides), roundNumber, { displayName: "สมชาย ผู้ป่วย" }, { canManage });

  return renderToStaticMarkup(
    createElement(ProgramRoundDetailView, { currentStep, detail, nonces, todayServiceDate: "2026-10-14" }),
  );
}

describe("round overview cards (R1-D)", () => {
  it("shows the workbook titles, x/y progress, states and the After lock", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgramRoundsOverviewView, {
        overview: {
          ...buildProgramRoundsOverview(record({ roundCompletions: [completion(1)], serviceOneConfidences: [] })),
          patientDisplayName: "สมชาย ผู้ป่วย",
        },
      }),
    );

    for (const round of [1, 2, 3, 4, 5, 6]) {
      expect(markup).toContain(`/programs/${programId}/rounds/${round}`);
    }
    expect(markup).toContain("ครั้งที่ 2 · ทำแผนสุขภาพ เป้าหมายเล็กๆที่ตั้งไว้");
    expect(markup).toContain("ครั้งที่ 3 · ติดตามการฝึกซ้อมพฤติกรรม");
    expect(markup).not.toContain("ติดตามผล</span>");
    expect(markup).toContain("เสร็จแล้ว");
    expect(markup).toContain("สมศรี อสม.");
    expect(markup).toContain("ยังไม่เริ่ม");
    expect(markup).toContain("ต้องจบครั้งที่ 2 ก่อน");
    expect(markup).toContain("0/4 รายการในแผน");
    expect(markup).toContain("ต้องเปิดอย่างน้อย 6 ครั้ง และจบบริการทุกครั้งก่อน");
  });
});

function parseMarkup(markup: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

describe("round stepper (SR-D7)", () => {
  it("uses labelled timelines and defaults mobile details according to editability", () => {
    const editable = parseMarkup(renderDetail(1, "PAM"));
    const details = editable.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toContain("ขั้นตอนที่ 3/9 · PAM · ยังไม่ได้บันทึก");
    const timeline = details?.querySelector('ol[aria-label="ขั้นตอนของครั้งนี้"]');
    expect(timeline?.querySelectorAll("li")).toHaveLength(9);
    expect(timeline?.querySelector("li")?.textContent).toContain("สัญญาณชีพ");
    expect(timeline?.querySelector('[aria-current="step"]')?.getAttribute("href")).toBe(`${roundPath(1)}?step=PAM`);
    expect(timeline?.querySelector("li:last-child")?.textContent).toContain("สรุปและจบบริการครั้งที่ 1");
    expect(editable.querySelector('a[title]')).toBeNull();
    for (const markup of [
      renderDetail(1, "SUMMARY", { roundCompletions: [completion(1)] }),
      renderDetail(3, "VITALS"),
      renderDetail(1, "VITALS", { status: "COMPLETED" }),
      renderDetail(1, "VITALS", {}, false),
    ]) {
      expect(parseMarkup(markup).querySelector("details")?.hasAttribute("open")).toBe(true);
    }
  });

  it("embeds the vitals form with preferred name and occupation in round 1 and offers a reasoned skip", () => {
    const markup = renderDetail(1, "VITALS", {
      patientHospitalRelationship: { hospitalProfile: { occupation: null, preferredName: null, version: 2 } },
    });

    expect(markup).toContain("ครั้งที่ 1 · รู้จักตัวเอง");
    expect(markup).toContain('name="heightCm"');
    expect(markup).toContain('name="preferredName"');
    expect(markup).toContain('name="occupation"');
    expect(markup).toContain('name="profileVersion"');
    expect(markup).toContain("ข้ามรายการนี้");
    expect(markup).toContain("0/8 รายการในแผน");
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain(`${roundPath(1)}?after=VITALS`);
  });

  it("lists the missing vitals and offers adding them or a reasoned skip", () => {
    const partial = {
      id: "v1", roundNumber: 1, serviceDate: new Date("2026-10-01T00:00:00.000Z"), recordedAt: at, weight: 70, heightCm: 160,
      waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: 110, recordedByUser: recorder,
    };
    const markup = renderDetail(1, "VITALS", { roundVitals: [partial] });

    expect(markup).toContain("ยังขาด: รอบเอว · ความดันตัวบน · ความดันตัวล่าง");
    expect(markup).toContain('name="waistCircumference"');
    expect(markup).not.toContain('name="weight"');
    expect(markup).not.toContain('name="preferredName"');
    expect(markup).toContain('type="hidden" name="serviceDate" value="2026-10-01"');
    expect(markup).toContain("บันทึกค่าที่ยังขาด");
    expect(markup).toContain("ข้ามรายการนี้");

    // Rounds 3-6 record vitals in the Follow-up, so a missing value is resolved by a reasoned skip.
    const bareFollowup = {
      id: "f1", roundNumber: 1, serviceDate: at, recordedAt: at, sourceGoalPlanId: null, planAdjusted: false, weight: 70,
      waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null,
      createdByUser: recorder, activityProgress: [],
    };
    const round3 = renderDetail(3, "VITALS", { roundCompletions: [completion(1), completion(2)], followups: [bareFollowup] });
    // Height is not asked again in rounds 3-6 (WB-DF-05).
    expect(round3).toContain("ยังขาด: รอบเอว · ค่าน้ำตาล · ความดันตัวบน · ความดันตัวล่าง หากวัดค่าที่ขาดไม่ได้");
    expect(round3).not.toContain("บันทึกค่าที่ยังขาด");
    expect(round3).toContain("ข้ามรายการนี้");
  });

  it("embeds a per-round tool form with the round number", () => {
    const markup = renderDetail(2, "CONFIDENCE_RULER", { roundCompletions: [completion(1)] });

    expect(markup).toContain("ไม้บรรทัดวัดใจ");
    expect(markup).toContain('name="roundNumber"');
    expect(markup).toContain('name="score"');
  });

  it("links Goal Plan and Follow-up steps with a returnTo the target page accepts", () => {
    const goal = renderDetail(2, "HEALTH_PLAN_REVIEW", { roundCompletions: [completion(1)] });
    const returnTo = encodeURIComponent(`${roundPath(2)}?after=HEALTH_PLAN_REVIEW`);
    expect(goal).toContain(`/programs/${programId}/goals/new?returnTo=${returnTo}`);
    expect(parseRoundReturnPath(`${roundPath(2)}?after=HEALTH_PLAN_REVIEW`)).toBe(`${roundPath(2)}?after=HEALTH_PLAN_REVIEW`);

    const followup = renderDetail(3, "VITALS", { roundCompletions: [completion(1), completion(2)] });
    expect(followup).toContain(`/programs/${programId}/followups/new?returnTo=`);
  });

  it("shows a skipped step with its reason and an unskip control", () => {
    const markup = renderDetail(1, "PAM", {
      roundStepSkips: [
        { roundNumber: 1, planItemId: "plan-1-PAM", stepCode: "PAM", reasonCode: "OTHER", note: "ผู้ป่วยเหนื่อย", createdAt: at, skippedByUser: recorder },
      ],
    });

    expect(markup).toContain("ข้ามแล้ว · เหตุผล: อื่น ๆ: ผู้ป่วยเหนื่อย");
    expect(markup).toContain("ยกเลิกการข้าม");
  });

  it("derives เส้นทางสุขภาพ from round 1 vitals without a form (SR-D9)", () => {
    const markup = renderDetail(1, "HEALTH_PATH", {
      roundVitals: [{
        id: "v1", roundNumber: 1, serviceDate: at, recordedAt: at, weight: 70, heightCm: 160, waistCircumference: 90,
        systolicBloodPressure: 130, diastolicBloodPressure: 85, bloodSugar: 110, recordedByUser: recorder,
      }],
    });

    expect(markup).toContain("ไม่มีแบบฟอร์มแยก");
    expect(markup).toContain("ครั้งที่ 1");
    // R2-H/R2-D: the booklet timepoint label and colour bands next to blood sugar and blood pressure.
    expect(markup).toContain("จุดเริ่มต้น");
    expect(markup).toContain("ดัชนีมวลกาย (kg/m²)");
    expect(markup).toContain("27.3");
    expect(markup).toContain("71 - 130");
    expect(markup).toContain("130/85 - 139/89");
    expect(markup).not.toContain("รอแบบฟอร์มจากหน่วยงาน");
  });

  it("records PAM and PROMs as separate steps, each with its own form (R2-C)", () => {
    const pam = renderDetail(1, "PAM");
    expect(pam).toContain("instrument=PAM");
    expect(pam).toContain("ทำแบบประเมิน PAM");
    expect(pam).not.toContain("instrument=PROMS");

    const answered = renderDetail(1, "PROMS", {
      screeningAssessments: [{ id: "ffffffff-ffff-4fff-8fff-000000000001", instrument: "PAM", submittedAt: at, conductedByUser: recorder }],
    });
    expect(answered).toContain("instrument=PROMS");
  });

  it("labels the six health path timepoints in round 6 (R2-H)", () => {
    const markup = renderDetail(6, "HEALTH_PATH_REVIEW", {
      roundCompletions: [1, 2, 3, 4, 5].map(completion),
    });

    for (const label of ["จุดเริ่มต้น", "2 สัปดาห์", "1 เดือน", "2 เดือน", "3 เดือน", "6 เดือน"]) {
      expect(markup).toContain(label);
    }
  });

  it("lists every item on the summary and offers completion with one DONE item", () => {
    const pending = renderDetail(5, "SUMMARY", { roundCompletions: [1, 2, 3, 4].map(completion) });
    expect(pending).toContain("ยังไม่ได้ทำ 3 รายการ");
    expect(pending).not.toContain("จบบริการครั้งที่ 5</button>");

    const skips = ["VITALS", "HEALTH_PLAN_REVIEW", "ROUTINE"].map((stepCode) => ({
      roundNumber: 5, planItemId: `plan-5-${stepCode}`, stepCode, reasonCode: "PATIENT_DECLINED", note: null, createdAt: at, skippedByUser: recorder,
    }));
    const ready = renderDetail(5, "SUMMARY", { roundCompletions: [1, 2, 3, 4].map(completion), roundStepSkips: skips, serviceOneRoutines: [{ id: "routine-5", roundNumber: 5, routineDate: null, entries: [], recordedAt: at, recordedByUser: recorder }] });
    expect(ready).toContain("ผู้ป่วยปฏิเสธ");
    expect(ready).toContain("จบบริการครั้งที่ 5");
    expect(ready).toContain(`value="${nonces.completion}"`);
  });

  it("renders completed and locked rounds read-only", () => {
    const completed = renderDetail(1, "SUMMARY", { roundCompletions: [completion(1)] });
    expect(completed).toContain("ครั้งนี้จบบริการแล้ว");
    expect(completed).toContain("จบบริการครั้งนี้แล้วเมื่อ");
    expect(completed).not.toContain("<form");

    const locked = renderDetail(3, "VITALS");
    expect(locked).toContain("ต้องจบครั้งที่ 2 ก่อน");
    expect(locked).not.toContain("ข้ามรายการนี้");
    expect(locked).not.toContain("/followups/new");

    const readOnly = renderDetail(1, "VITALS", {}, false);
    expect(readOnly).toContain("ไม่มีสิทธิ์บันทึก");
    expect(readOnly).not.toContain("<form");
  });
});


describe("flexible staff rounds (FR-3)", () => {
  it("shows add round only to staff when every opened round is completed", () => {
    const overview = buildProgramRoundsOverview(record({ roundCompletions: [1, 2, 3, 4, 5, 6].map(completion) }));
    const render = (canManage: boolean, addRoundUnavailableReason: string | null) => renderToStaticMarkup(<ProgramRoundsOverviewView overview={{ ...overview, canManage, addRoundUnavailableReason, patientDisplayName: "ผู้ป่วย" }} />);
    expect(render(true, null)).toContain("เพิ่มครั้งบริการ</button>");
    for (const reason of ["ยังมีครั้งบริการที่ต้องจบก่อน", "ครบ 12 ครั้งแล้ว", "บันทึกการประเมินสุดท้ายแล้ว"]) {
      expect(render(true, reason)).not.toContain("เพิ่มครั้งบริการ</button>");
      expect(render(true, reason)).toContain(reason);
    }
    expect(render(false, null)).not.toContain("เพิ่มครั้งบริการ</button>");
  });
  it("uses independent links for CUSTOM items and shows added provenance", () => {
    const program = record({ rounds: [{ roundNumber: 1, planItems: ["one", "two"].map((id, index) => ({ id, stepCode: "CUSTOM", customTitle: id, position: index + 1, origin: "ADDED", removedAt: null, doneAt: null, doneByUser: null, doneNote: null })) }] });
    const detail = buildProgramRoundDetail(program, 1, { displayName: "ผู้ป่วย" }, { canManage: true });
    const markup = renderToStaticMarkup(<ProgramRoundDetailView detail={detail} currentStep="two" nonces={nonces} todayServiceDate="2026-10-01" />);
    expect(markup).toContain("?step=one");
    expect(markup).toContain("?step=two");
    expect(markup).toContain("เพิ่มเอง");
    expect(markup).toContain("0/2 รายการในแผน");
    expect(markup).toContain('name="planItemId" value="two"');
  });
  it("shows empty extra plans and hides every write control without access", () => {
    const program = record({ roundCompletions: [1, 2, 3, 4, 5, 6].map(completion), rounds: [...openedRounds([1, 2, 3, 4, 5]), { roundNumber: 7, planItems: [] }] });
    const detail = buildProgramRoundDetail(program, 7, { displayName: "ผู้ป่วย" }, { canManage: false });
    const markup = renderToStaticMarkup(<ProgramRoundDetailView detail={detail} currentStep="SUMMARY" nonces={nonces} todayServiceDate="2026-10-01" />);
    expect(markup).toContain("ยังไม่มีรายการ เพิ่มรายการที่จะทำในครั้งนี้");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("เพิ่มรายการ</button>");
  });
});
