// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildProgramRoundDetail,
  buildProgramRoundsOverview,
  type ProgramRoundRecord,
} from "@/modules/patient-program-rounds/services/round-query-service";
import { ROUND_ITEM_CATALOG, roundGuideline } from "@/modules/patient-program-rounds/domain/round-steps";
import type { PatientSelfProgramRounds } from "@/modules/patient-self/services/patient-self-care-query-service";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({ completePatientProgramRoundAction: vi.fn(), recordPatientProgramRoundProfileAction: vi.fn(), recordPatientProgramRoundReviewAction: vi.fn(), recordPatientProgramRoundVitalsAction: vi.fn(), skipPatientProgramRoundStepAction: vi.fn(), unskipPatientProgramRoundStepAction: vi.fn(), addRoundPlanItemAction: vi.fn(), removeRoundPlanItemAction: vi.fn(), markCustomItemDoneAction: vi.fn(), unmarkCustomItemDoneAction: vi.fn(), addProgramRoundAction: vi.fn() }));
vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({ associatePatientProgramServiceOneArtifactAction: vi.fn(), recordPatientProgramServiceOneConfidenceAction: vi.fn(), recordPatientProgramServiceOneDreamCardAction: vi.fn(), recordPatientProgramServiceOneFloatingChartAction: vi.fn(), recordPatientProgramServiceOneRoutineAction: vi.fn() }));
vi.mock("@/modules/screening/transport/server-actions", () => ({ submitScreeningAction: vi.fn() }));

import { PatientSelfProgramRoundsView } from "./patient-self-program-rounds-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const followupId = "dddddddd-dddd-4ddd-8ddd-000000000001";
const recorder = { id: "staff-user", person: { givenName: "สมศรี", familyName: "อสม." } };

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

const record = {
  id: programId,
  patientHospitalRelationshipId: relationshipId,
  status: "ACTIVE",
  patientHospitalRelationship: { hospitalProfile: null },
  initialBaseline: null,
  roundVitals: [],
  roundActivities: [],
  rounds: openedRounds([1, 2]),
  roundCompletions: [1, 2].map((roundNumber) => ({ roundNumber, completedAt: new Date("2026-10-10T00:00:00Z"), completedByUser: recorder })),
  roundStepSkips: [
    { roundNumber: 3, planItemId: "plan-3-DREAM_CARD", stepCode: "DREAM_CARD", reasonCode: "PATIENT_DECLINED", note: null, createdAt: new Date("2026-10-20T00:00:00Z"), skippedByUser: recorder },
  ],
  screeningAssessments: [],
  serviceOneRoutines: [],
  serviceOneFloatingCharts: [
    {
      roundNumber: 1,
      summary: null,
      recordedAt: new Date("2026-10-20T00:00:00Z"),
      recordedByUser: recorder,
      familyScore: -5,
      eatingScore: -4,
      workScore: -3,
      healthScore: -2,
      financeScore: -1,
      travelScore: 0,
      exerciseScore: 1,
      wellbeingScore: 5,
      serviceOneArtifactAssociation: null,
    },
    {
      roundNumber: 4,
      summary: null,
      recordedAt: new Date("2026-10-20T00:00:00Z"),
      recordedByUser: recorder,
      familyScore: 5,
      eatingScore: 4,
      workScore: 3,
      healthScore: 2,
      financeScore: 1,
      travelScore: 0,
      exerciseScore: -1,
      wellbeingScore: -5,
      serviceOneArtifactAssociation: null,
    },
  ],
  serviceOneDreamCards: [],
  serviceOneConfidences: [],
  goalPlans: [],
  followups: [
    {
      id: followupId,
      roundNumber: 1,
      serviceDate: new Date("2026-10-20T00:00:00Z"),
      recordedAt: new Date("2026-10-20T04:00:00Z"),
      sourceGoalPlanId: null,
      planAdjusted: null,
      weight: 62,
      waistCircumference: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      bloodSugar: null,
      createdByUser: recorder,
      activityProgress: [],
    },
  ],
  finalAssessment: null,
} as unknown as ProgramRoundRecord;

describe("Patient SELF round history", () => {
  it("shows read-only progress, skips with reasons and the Follow-up link without recorder names", () => {
    const options = { recorderNames: false };
    const rounds = {
      relationship: { hospitalName: "โรงพยาบาล" },
      overview: buildProgramRoundsOverview(record, options),
      rounds: ([1, 2, 3, 4, 5, 6] as const).map((n) =>
        buildProgramRoundDetail(record, n, { displayName: "" }, { canManage: false, options }),
      ),
    } as unknown as PatientSelfProgramRounds;
    const markup = renderToStaticMarkup(
      createElement(PatientSelfProgramRoundsView, { programId, relationshipId, rounds }),
    );

    expect(markup).toContain(`/followups/${followupId}`);
    expect(markup).toContain("เสร็จแล้ว");
    expect(markup).toContain("กำลังทำ");
    expect(markup).toContain("เหตุผลที่ข้าม: ผู้ป่วยปฏิเสธ");
    expect(markup).toContain("คะแนนอารมณ์");
    expect(markup).toContain("ครอบครัว");
    expect(markup).toContain("ไม้บรรทัดวัดทุกข์สุข");
    expect(markup).toContain("เปรียบเทียบกับครั้งที่ 1");
    expect(markup).toContain("ครั้งที่ 4");
    // The Follow-up is not linked to a plan, so the plan review is not done.
    const document = globalThis.document.createElement("div");
    document.innerHTML = markup;
    const timelines = document.querySelectorAll('ol[aria-label="ขั้นตอนของครั้งนี้"]');
    expect(timelines).toHaveLength(6);
    timelines.forEach((timeline) => expect(timeline.querySelector("a")).toBeNull());
    expect(timelines[2].querySelectorAll("li")[1].textContent).toContain("ทบทวนแผนสุขภาพยังไม่ได้บันทึก");
    expect(markup).not.toContain("สมศรี");
    expect(markup).not.toContain("<form");
  });
});


describe("Patient self recording UI (FR-4)", () => {
  function currentProgram(): ProgramRoundRecord {
    const rounds = openedRounds([]) as unknown as ProgramRoundRecord["rounds"];
    rounds[0].planItems.push({ id: "custom-1", stepCode: "CUSTOM", customTitle: "เดินรอบบ้าน", position: 10, removedAt: null, origin: "ADDED", doneAt: null, doneByUser: null, doneNote: null });
    rounds[0].planItems.push({ id: "dream-1", stepCode: "DREAM_CARD", customTitle: null, position: 9, removedAt: null, origin: "ADDED", doneAt: null, doneByUser: null, doneNote: null });
    return { ...record, rounds, roundCompletions: [], roundStepSkips: [], followups: [], serviceOneFloatingCharts: [], serviceOneConfidences: [] };
  }
  function render(program: ProgramRoundRecord, canSelfRecord: boolean): string {
    const options = { recorderNames: false };
    const rounds: PatientSelfProgramRounds = { relationship: { relationshipId, hospitalCode: "T", hospitalName: "โรงพยาบาล", hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null }, overview: buildProgramRoundsOverview(program, options), rounds: [buildProgramRoundDetail(program, 1, { displayName: "" }, { canManage: false, canSelfRecord, options })] };
    return renderToStaticMarkup(<PatientSelfProgramRoundsView programId={programId} relationshipId={relationshipId} rounds={rounds} />);
  }
  it("opens the shared allowed forms without staff guidance or forbidden controls", () => {
    const markup = render(currentProgram(), true);
    expect(markup).toContain("ครั้งบริการปัจจุบัน");
    for (const name of ["weight", "preferredName", "instrument", "score", "entries", "familyScore", "dream", "note"]) expect(markup).toContain(`name="${name}"`);
    expect(markup).toContain('value="PAM"');
    expect(markup).toContain('value="PROMS"');
    expect(markup).toContain("ทำแล้ว");
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain("เจ้าหน้าที่/อสม. จะบันทึกให้");
    for (const text of ["ตัดออก", "ข้ามรายการนี้", "ยกเลิกการข้าม", "เพิ่มครั้งบริการ", "ยกเลิกทำแล้ว", "คำแนะนำสำหรับผู้ประเมิน", "แนบรูป"]) expect(markup).not.toContain(text);
    const document = globalThis.document.createElement("div"); document.innerHTML = markup;
    expect([...document.querySelectorAll("button")].some((button) => button.textContent?.includes("จบบริการ"))).toBe(false);
    expect(document.querySelector('input[name="occupation"]')).toBeNull();
  });
  it("keeps read-only scopes and completed rounds free of write forms", () => {
    const program = currentProgram();
    expect(render(program, false)).not.toContain("<form");
    const completed = { ...program, roundCompletions: [{ roundNumber: 1, completedAt: new Date(), completedByUser: recorder }] };
    expect(render(completed, true)).not.toContain("<form");
  });
  it("shows own provenance without ever exposing staff recorder names", () => {
    const program = currentProgram();
    program.patientHospitalRelationship = { ...program.patientHospitalRelationship, patientProfile: { person: { user: { id: "patient-user" } } } };
    program.serviceOneConfidences = [{ roundNumber: 1, recordedAt: new Date(), recordedByUser: { id: "patient-user", person: { givenName: "ชื่อผู้ป่วย", familyName: null } }, score: 7, improvementPlan: null }];
    const markup = render(program, true);
    expect(markup).toContain("คุณบันทึกแล้ว");
    expect(markup).not.toContain("ชื่อผู้ป่วย");
    expect(markup).not.toContain("สมศรี");
  });
  it("FR-7: hides the vitals form for a staff-recorded partial row and keeps it for the patient's own", () => {
    function withPartialVitals(recordedByUser: { id: string; person: { givenName: string | null; familyName: string | null } }): ProgramRoundRecord {
      const program = currentProgram();
      program.patientHospitalRelationship = { ...program.patientHospitalRelationship, patientProfile: { person: { user: { id: "patient-user" } } } };
      program.roundVitals = [{ id: "vitals-1", roundNumber: 1, serviceDate: new Date("2026-10-20T00:00:00Z"), recordedAt: new Date("2026-10-20T04:00:00Z"), weight: 70, heightCm: null, waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null, recordedByUser }];
      return program;
    }
    const vitalsItem = (markup: string) => {
      const document = globalThis.document.createElement("div"); document.innerHTML = markup;
      return [...document.querySelectorAll("li")].find((item) => item.querySelector("h3")?.textContent === ROUND_ITEM_CATALOG.VITALS.label);
    };
    const staff = vitalsItem(render(withPartialVitals(recorder), true));
    expect(staff?.textContent).toContain("เจ้าหน้าที่/อสม. บันทึกให้แล้ว");
    expect(staff?.querySelector('input[name="weight"]')).toBeNull();
    expect(staff?.textContent).not.toContain("สมศรี");
    const own = vitalsItem(render(withPartialVitals({ id: "patient-user", person: { givenName: null, familyName: null } }), true));
    expect(own?.querySelector('input[name="weight"]')).not.toBeNull();
    expect(own?.textContent).not.toContain("เจ้าหน้าที่/อสม. บันทึกให้แล้ว");
  });
  it("FR-7b: hides the round 3 vitals form once the round's Follow-up holds measurements", () => {
    function roundThree(weight: number | null): string {
      const program = {
        ...record,
        roundCompletions: [1, 2].map((roundNumber) => ({ roundNumber, completedAt: new Date("2026-10-10T00:00:00Z"), completedByUser: recorder })),
        roundStepSkips: [],
        followups: record.followups.map((followup) => ({ ...followup, weight })),
      } as ProgramRoundRecord;
      const options = { recorderNames: false };
      const rounds: PatientSelfProgramRounds = { relationship: { relationshipId, hospitalCode: "T", hospitalName: "โรงพยาบาล", hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null }, overview: buildProgramRoundsOverview(program, options), rounds: [buildProgramRoundDetail(program, 3, { displayName: "" }, { canManage: false, canSelfRecord: true, options })] };
      return renderToStaticMarkup(<PatientSelfProgramRoundsView programId={programId} relationshipId={relationshipId} rounds={rounds} />);
    }
    const vitalsItem = (markup: string) => {
      const document = globalThis.document.createElement("div"); document.innerHTML = markup;
      return [...document.querySelectorAll("li")].find((item) => item.querySelector("h3")?.textContent === ROUND_ITEM_CATALOG.VITALS.label);
    };
    const measured = vitalsItem(roundThree(62));
    expect(measured?.textContent).toContain("เจ้าหน้าที่/อสม. บันทึกให้แล้ว");
    expect(measured?.querySelector('input[name="weight"]')).toBeNull();
    const empty = vitalsItem(roundThree(null));
    expect(empty?.querySelector('input[name="weight"]')).not.toBeNull();
  });
});
