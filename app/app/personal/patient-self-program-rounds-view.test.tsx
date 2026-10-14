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
  initialBaseline: null,
  roundVitals: [],
  roundActivities: [],
  screeningAssessment: null,
  serviceOneRoutine: null,
  serviceOneFloatingChart: null,
  serviceOneDreamCard: null,
  serviceOneConfidence: null,
  goalPlans: [],
  followups: [
    {
      id: followupId,
      roundNumber: 1,
      serviceDate: new Date("2026-10-20T00:00:00Z"),
      recordedAt: new Date("2026-10-20T04:00:00Z"),
      sourceGoalPlanId: null,
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
  it("links to a recorded Follow-up without marking the plan review as done", () => {
    const patient = { displayName: "ผู้ป่วย", occupation: null };
    const rounds = {
      relationship: { hospitalName: "โรงพยาบาล" },
      overview: buildProgramRoundsOverview(record),
      rounds: ([1, 2, 3, 4, 5, 6] as const).map((n) => buildProgramRoundDetail(record, n, patient)),
    } as unknown as PatientSelfProgramRounds;
    const markup = renderToStaticMarkup(
      createElement(PatientSelfProgramRoundsView, { programId, relationshipId, rounds }),
    );

    expect(markup).toContain("มีบันทึกการติดตามผล");
    expect(markup).toContain(`/followups/${followupId}`);
    expect(markup).not.toContain("ทบทวนแผนสุขภาพ");
  });
});
