// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildServiceProgress, type OwnServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";
import { progressRelationship, progressPatient } from "../../../tests/support/service-progress";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({ completePatientProgramRoundAction: vi.fn(), recordPatientProgramRoundProfileAction: vi.fn(), recordPatientProgramRoundReviewAction: vi.fn(), recordPatientProgramRoundVitalsAction: vi.fn(), skipPatientProgramRoundStepAction: vi.fn(), unskipPatientProgramRoundStepAction: vi.fn(), addRoundPlanItemAction: vi.fn(), removeRoundPlanItemAction: vi.fn(), markCustomItemDoneAction: vi.fn(), unmarkCustomItemDoneAction: vi.fn(), addProgramRoundAction: vi.fn() }));
vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({ associatePatientProgramServiceOneArtifactAction: vi.fn(), recordPatientProgramServiceOneConfidenceAction: vi.fn(), recordPatientProgramServiceOneDreamCardAction: vi.fn(), recordPatientProgramServiceOneFloatingChartAction: vi.fn(), recordPatientProgramServiceOneRoutineAction: vi.fn() }));
vi.mock("@/modules/screening/transport/server-actions", () => ({ submitScreeningAction: vi.fn() }));

import { PatientServiceProgress } from "./patient-service-progress";
import { PatientPersonalHome } from "./patient-personal-home";

function ownService(): OwnServiceProgress {
  const record = progressRelationship();
  record.programs[0].serviceOneConfidences = [{ roundNumber: 1, recordedAt: new Date(), recordedByUser: progressPatient, score: 8, improvementPlan: null }];
  const { progress, recordingRound } = buildServiceProgress(record, null, { readOnly: false });
  return { ...progress, recordingRound, relationship: { relationshipId: record.id, hospitalName: record.hospital.name, hospitalCode: "T", hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null } };
}

describe("patient current service", () => {
  it("shows all three lists, touch-sized disclosures, round text and no staff controls or recorder names", () => {
    const markup = renderToStaticMarkup(<PatientServiceProgress service={ownService()} />);
    const root = document.createElement("div"); root.innerHTML = markup;
    for (const text of ["บันทึกด้วยตนเอง", "เจ้าหน้าที่/อสม. จะทำให้", "ทำแล้ว", "คุณบันทึกแล้ว", "ครั้งที่ 1 · ทำแล้ว", "ยังไม่มีนัด", "ครั้งปัจจุบัน", "ยังไม่เปิดให้บันทึก"]) expect(root.textContent).toContain(text);
    const rounds = root.querySelector('ol[aria-label="ความคืบหน้ารายครั้ง"]');
    expect(rounds?.querySelector('[aria-current="step"] svg[aria-hidden="true"] circle')).not.toBeNull();
    expect(rounds?.querySelector('svg[aria-hidden="true"] rect')).not.toBeNull();
    expect(rounds?.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(root.querySelector("summary")?.className).toContain("min-h-11");
    expect(root.querySelector('input[name="submissionNonce"]')?.getAttribute("value")).toMatch(/^[a-f0-9-]{36}$/);
    expect(root.querySelector('input[name="weight"]')).not.toBeNull();
    for (const text of ["ชื่อเจ้าหน้าที่ลับ", "ชื่อผู้ป่วย", "ตัดออก", "ข้ามรายการนี้", "เพิ่มครั้งบริการ", "จบบริการ", "คำแนะนำสำหรับผู้ประเมิน"]) expect(markup).not.toContain(text);
  });

  it("links completed and current rounds, lists past rounds and points round 3+ Follow-ups to their tab", () => {
    const service = ownService();
    if (!service.currentRound) throw new Error("Missing current round");
    const markup = renderToStaticMarkup(<PatientServiceProgress service={{
      ...service,
      rounds: [
        { number: 1, state: "COMPLETED", completedAt: new Date("2026-11-03T03:00:00.000Z") },
        { number: 2, state: "COMPLETED", completedAt: new Date("2026-11-10T03:00:00.000Z") },
        { number: 3, state: "CURRENT", completedAt: null },
        { number: 4, state: "LOCKED", completedAt: null },
      ],
      currentRound: { ...service.currentRound, number: 3, followupRecorded: true },
    }} />);
    const root = document.createElement("div"); root.innerHTML = markup;
    const roundsHref = `/app/personal/care/${service.relationshipId}/programs/${service.programId}/rounds`;
    const stepper = root.querySelector('ol[aria-label="ความคืบหน้ารายครั้ง"]');
    expect([...stepper?.querySelectorAll("a") ?? []].map((link) => link.getAttribute("href"))).toEqual([1, 2, 3].map((n) => `${roundsHref}#round-${n}`));
    expect(stepper?.querySelectorAll("li")[3]?.querySelector("a")).toBeNull();
    expect(root.textContent).toContain("ครั้งที่ 1 · เสร็จ 3 พ.ย.");
    expect(root.textContent).toContain("ครั้งที่ 2 · เสร็จ 10 พ.ย.");
    expect(root.textContent).toContain("ครั้งนี้บันทึกการติดตามแล้ว");
    expect(markup).toContain(`href="/app/personal/care?tab=followups&amp;relationshipId=${service.relationshipId}"`);
    const noFollowup = renderToStaticMarkup(<PatientServiceProgress service={{ ...service, currentRound: { ...service.currentRound, number: 3, followupRecorded: false } }} />);
    expect(noFollowup).not.toContain("ครั้งนี้บันทึกการติดตามแล้ว");
  });

  it("keeps no-program and no-relationship states explicit", () => {
    expect(renderToStaticMarkup(<PatientServiceProgress service={null} />)).toContain("ยังไม่มีหน่วยบริการที่ดูแลอยู่");
    const service = ownService();
    const markup = renderToStaticMarkup(<PatientServiceProgress service={{ ...service, programId: null, currentRound: null, rounds: [], recordingRound: null }} />);
    expect(markup).toContain("ยังไม่เริ่มโปรแกรม เจ้าหน้าที่/อสม. จะนัดหมายครั้งแรก");
    expect(markup).not.toContain("<form");
  });

  it("shows the real home CTA, changes to progress at zero available items and hides without an active program", () => {
    const patient = { person: { givenName: "ผู้ป่วย", familyName: null } };
    const service = ownService();
    const markup = renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={service} />);
    expect(markup).toContain("บริการครั้งปัจจุบัน");
    expect(markup).toContain("บันทึกเลย");
    expect(markup).toContain(`href="/app/personal/care?tab=rounds&amp;relationshipId=${service.relationshipId}"`);
    const noItems = { ...service, currentRound: service.currentRound ? { ...service.currentRound, selfRecordable: [] } : null };
    const zero = renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={noItems} />);
    expect(zero).toContain("ดูความคืบหน้า");
    expect(zero).not.toContain("บันทึกเลย");
    expect(renderToStaticMarkup(<PatientPersonalHome patient={patient} />)).not.toContain("บริการครั้งปัจจุบัน");
    expect(renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={{ ...service, programId: null }} />)).not.toContain("บริการครั้งปัจจุบัน");
  });
});
