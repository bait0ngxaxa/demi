import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildProgramRoundDetail,
  buildProgramRoundsOverview,
  type ProgramRoundRecord,
} from "@/modules/patient-program-rounds/services/round-query-service";
import type { PatientSelfProgramRounds } from "@/modules/patient-self/services/patient-self-care-query-service";

import { PatientSelfProgramRoundsView } from "./patient-self-program-rounds-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const followupId = "dddddddd-dddd-4ddd-8ddd-000000000001";
const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };

const record = {
  id: programId,
  patientHospitalRelationshipId: relationshipId,
  status: "ACTIVE",
  patientHospitalRelationship: { hospitalProfile: null },
  initialBaseline: null,
  roundVitals: [],
  roundActivities: [],
  roundCompletions: [1, 2].map((roundNumber) => ({ roundNumber, completedAt: new Date("2026-10-10T00:00:00Z"), completedByUser: recorder })),
  roundStepSkips: [
    { roundNumber: 3, stepCode: "DREAM_CARD", reasonCode: "PATIENT_DECLINED", note: null, createdAt: new Date("2026-10-20T00:00:00Z"), skippedByUser: recorder },
  ],
  screeningAssessment: null,
  serviceOneRoutines: [],
  serviceOneFloatingCharts: [],
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
    // The Follow-up is not linked to a plan, so the plan review is not done.
    expect(markup).toMatch(/ทบทวนแผนสุขภาพ<\/span><\/span><span[^>]*>ยังไม่ได้บันทึก/u);
    expect(markup).not.toContain("สมศรี");
    expect(markup).not.toContain("<form");
  });
});
