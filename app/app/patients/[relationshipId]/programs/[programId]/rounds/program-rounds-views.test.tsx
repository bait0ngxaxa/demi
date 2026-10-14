import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildProgramRoundDetail, buildProgramRoundsOverview, type ProgramRoundRecord } from "@/modules/patient-program-rounds/services/round-query-service";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  recordPatientProgramRoundVitalsAction: vi.fn(),
  recordPatientProgramRoundReviewAction: vi.fn(),
}));

import { ProgramRoundsOverviewView } from "./program-rounds-overview-view";
import { ProgramRoundDetailView } from "./[roundNumber]/program-round-detail-view";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const recorder = { person: { givenName: "สมศรี", familyName: "อสม." } };
const patient = { displayName: "สมชาย ผู้ป่วย", occupation: "เกษตรกร" };

function record(overrides: Record<string, unknown> = {}): ProgramRoundRecord {
  return {
    id: programId,
    patientHospitalRelationshipId: relationshipId,
    status: "ACTIVE",
    initialBaseline: { heightCm: 160 },
    roundVitals: [],
    roundActivities: [],
    screeningAssessment: null,
    serviceOneRoutine: null,
    serviceOneFloatingChart: null,
    serviceOneDreamCard: { id: "33333333-3333-4333-8333-333333333333", recordedAt: new Date("2026-10-01T03:00:00Z"), recordedByUser: recorder },
    serviceOneConfidence: null,
    goalPlans: [],
    followups: [],
    finalAssessment: null,
    ...overrides,
  } as unknown as ProgramRoundRecord;
}

function renderDetail(roundNumber: 1 | 2 | 3 | 4, overrides: Record<string, unknown> = {}): string {
  const detail = buildProgramRoundDetail(record(overrides), roundNumber, patient);
  const reviewNonces = Object.fromEntries(
    [...detail.activities, ...detail.addOptions].map((row) => [row.toolCode, "44444444-4444-4444-8444-444444444444"]),
  );

  return renderToStaticMarkup(
    createElement(ProgramRoundDetailView, {
      detail,
      reviewNonces,
      todayServiceDate: "2026-10-14",
      vitalsNonce: "55555555-5555-4555-8555-555555555555",
    }),
  );
}

describe("six-round navigator views", () => {
  it("lists rounds 1-6 and After with status, links to each round and the legacy program page", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgramRoundsOverviewView, {
        overview: {
          ...buildProgramRoundsOverview(
            record({
              roundActivities: [
                {
                  id: "66666666-6666-4666-8666-666666666666",
                  roundNumber: 3,
                  toolCode: "DREAM_CARD",
                  source: "PLANNED",
                  mode: "REVIEWED",
                  linkedRecordType: "SERVICE_ONE_DREAM_CARD",
                  linkedRecordId: "33333333-3333-4333-8333-333333333333",
                  performedAt: new Date("2026-10-10T03:00:00Z"),
                  recordedByUser: recorder,
                },
              ],
            }),
          ),
          patientDisplayName: patient.displayName,
        },
      }),
    );

    for (const round of [1, 2, 3, 4, 5, 6]) {
      expect(markup).toContain(`/programs/${programId}/rounds/${round}`);
    }
    expect(markup).toContain("After · การประเมินสุดท้าย");
    expect(markup).toContain("บันทึกแล้ว");
    expect(markup).toContain("ไม่ได้บันทึก");
    expect(markup).toContain("ผู้บันทึก สมศรี อสม.");
    expect(markup).toContain("ไปยังรายละเอียดโปรแกรมแบบเดิม");
  });

  it("shows the auto vitals form, the recommended list with pending forms disabled, and the Add section", () => {
    const markup = renderDetail(1);

    expect(markup).toContain("สมชาย ผู้ป่วย");
    expect(markup).toContain("เกษตรกร");
    expect(markup).toContain('name="heightCm"');
    expect(markup).toContain('value="160"');
    expect(markup).not.toContain("readOnly");
    expect(markup).toContain("BMI (kg/m²)");
    expect(markup).toContain("รู้จักตัวเอง");
    expect(markup).toContain("รอแบบฟอร์มจากหน่วยงาน");
    expect(markup).toContain("/screenings/new?programId=" + programId);
    expect(markup).toContain("การจัดบริการเพิ่ม");
  });

  it("offers a read-only review for an existing Service 1 result in a later round and Add for the rest", () => {
    const markup = renderDetail(3);

    expect(markup).toContain("บันทึกว่าได้ทบทวนในครั้งนี้");
    expect(markup).toContain("ดูผลเดิม (อ่านอย่างเดียว)");
    expect(markup).toContain('name="toolCode"');
    expect(markup).toContain('value="DREAM_CARD"');
    expect(markup).toContain("รายการแนะนำของครั้งนี้");
    // Round 3 vitals come with the Follow-up, so no vitals form and height is display-only.
    expect(markup).not.toContain('name="weight"');
    expect(markup).toContain("ส่วนสูงล่าสุด 160 cm (แสดงอย่างเดียว)");
  });

  it("shows EXTRA activities in history and no write controls once the Program is completed", () => {
    const completed = renderDetail(2, {
      status: "COMPLETED",
      roundActivities: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          roundNumber: 2,
          toolCode: "DREAM_CARD",
          source: "EXTRA",
          mode: "REVIEWED",
          linkedRecordType: "SERVICE_ONE_DREAM_CARD",
          linkedRecordId: "33333333-3333-4333-8333-333333333333",
          performedAt: new Date("2026-10-10T03:00:00Z"),
          recordedByUser: recorder,
        },
      ],
    });

    expect(completed).toContain("การจัดบริการเพิ่ม");
    expect(completed).toContain("ทบทวนแล้ว");
    expect(completed).toContain("โปรแกรมนี้จบแล้ว");
    expect(completed).not.toContain('name="submissionNonce"');
    expect(completed).not.toContain("บันทึกว่าได้ทบทวนในครั้งนี้");
  });

  it("does not offer a Follow-up action for the round 2 plan review and marks it decision-gated", () => {
    const markup = renderDetail(2);

    expect(markup).toContain("ทบทวนแผนสุขภาพ");
    expect(markup).toContain("รอการตัดสินใจ");
    expect(markup).toContain("ยังไม่ได้กำหนดขั้นตอนทบทวนแผนสุขภาพของครั้งนี้");
    expect(markup).not.toContain("บันทึกได้ในครั้งที่ 3–6");
    expect(markup).not.toContain("/followups/new");
    expect(markup).not.toContain(">บันทึกแล้ว</span>");
  });

  it("shows an existing plan in round 4 as a read-only link, not a performed round 4 activity", () => {
    const markup = renderDetail(4, {
      goalPlans: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          roundNumber: 1,
          createdAt: new Date("2026-10-02T03:00:00Z"),
          templateKey: "demi-goals",
          templateVersion: "legacy-prototype-v1",
          createdByUser: recorder,
          items: [],
        },
      ],
    });

    expect(markup).toContain("แผนสุขภาพดีของฉัน");
    expect(markup).toContain("ดูแผนที่มีอยู่ (สร้างในครั้งที่ 2)");
    expect(markup).toContain("/goals/77777777-7777-4777-8777-777777777777");
    expect(markup).toContain("แผนสุขภาพที่มีอยู่ไม่นับเป็นการทำกิจกรรมของครั้งนี้");
    expect(markup).toContain("รอการตัดสินใจ");
    expect(markup).not.toContain(">บันทึกแล้ว</span>");
    expect(markup).not.toContain(">ทบทวนแล้ว</span>");
  });

  it("keeps the real round 2 Goal Plan creation as a recorded result with its normal link", () => {
    const markup = renderDetail(2, {
      goalPlans: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          roundNumber: 1,
          createdAt: new Date("2026-10-02T03:00:00Z"),
          templateKey: "demi-goals",
          templateVersion: "legacy-prototype-v1",
          createdByUser: recorder,
          items: [],
        },
      ],
    });

    expect(markup).toContain(">บันทึกแล้ว</span>");
    expect(markup).not.toContain("แผนสุขภาพที่มีอยู่ไม่นับเป็นการทำกิจกรรมของครั้งนี้");
  });

  it("shows a recorded Follow-up as a fact, not as a completed plan review", () => {
    const markup = renderDetail(3, {
      goalPlans: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-000000000001",
          roundNumber: 1,
          createdAt: new Date("2026-10-02T03:00:00Z"),
          templateKey: "demi-goals",
          templateVersion: "legacy-prototype-v1",
          createdByUser: recorder,
          items: [{ activityCode: "stop_sweet", targetDays: 4, targetValue: null, targetUnit: null }],
        },
      ],
      followups: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-000000000001",
          roundNumber: 1,
          serviceDate: new Date("2026-10-20T00:00:00Z"),
          recordedAt: new Date("2026-10-20T04:00:00Z"),
          sourceGoalPlanId: "eeeeeeee-eeee-4eee-8eee-000000000001",
          weight: 62,
          createdByUser: recorder,
          activityProgress: [],
        },
      ],
    });

    expect(markup).toContain("ยังไม่มีบันทึกการทบทวนแผน");
    expect(markup).toContain("ยังไม่มีบันทึกว่าได้ทบทวนแผนสุขภาพ");
    expect(markup).toContain("ดูการติดตามผลที่บันทึก");
    expect(markup).not.toContain(">บันทึกแล้ว</span>");
    expect(markup).toContain("กิจกรรมในแผนเป้าหมาย");
    expect(markup).toContain("ยังไม่มีบันทึกความคืบหน้า");
    expect(markup).not.toContain("รายการที่ต้องติดตามในครั้งนี้");
    expect(markup).not.toContain("รอติดตาม");
  });
});

