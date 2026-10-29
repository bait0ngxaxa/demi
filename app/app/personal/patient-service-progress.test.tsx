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
    const markup = renderToStaticMarkup(<PatientServiceProgress services={[ownService()]} />);
    const root = document.createElement("div"); root.innerHTML = markup;
    expect(markup).toContain("บริการของฉันตอนนี้");
    for (const text of ["บันทึกด้วยตนเอง", "เจ้าหน้าที่/อสม. จะทำให้", "ทำแล้ว", "คุณบันทึกแล้ว", "ครั้งที่ 1 · ทำแล้ว", "ยังไม่มีนัด", "ครั้งปัจจุบัน", "ยังไม่เปิดให้บันทึก"]) expect(root.textContent).toContain(text);
    expect(root.querySelector("summary")?.className).toContain("min-h-11");
    expect(root.querySelector('input[name="submissionNonce"]')?.getAttribute("value")).toMatch(/^[a-f0-9-]{36}$/);
    expect(root.querySelector('input[name="weight"]')).not.toBeNull();
    for (const text of ["ชื่อเจ้าหน้าที่ลับ", "ชื่อผู้ป่วย", "ตัดออก", "ข้ามรายการนี้", "เพิ่มครั้งบริการ", "จบบริการ", "คำแนะนำสำหรับผู้ประเมิน"]) expect(markup).not.toContain(text);
  });

  it("keeps no-program and no-relationship states explicit", () => {
    expect(renderToStaticMarkup(<PatientServiceProgress services={[]} />)).toContain("ยังไม่มีหน่วยบริการที่ดูแลอยู่");
    const service = ownService();
    const markup = renderToStaticMarkup(<PatientServiceProgress services={[{ ...service, programId: null, currentRound: null, rounds: [], recordingRound: null }]} />);
    expect(markup).toContain("ยังไม่เริ่มโปรแกรม เจ้าหน้าที่/อสม. จะนัดหมายครั้งแรก");
    expect(markup).not.toContain("<form");
  });

  it("shows the real home CTA, changes to progress at zero available items and hides without an active program", () => {
    const patient = { person: { givenName: "ผู้ป่วย", familyName: null } };
    const service = ownService();
    const markup = renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={service} />);
    expect(markup).toContain("บริการครั้งปัจจุบัน");
    expect(markup).toContain("บันทึกเลย");
    expect(markup).toContain(`href="/app/personal/care#service-${service.relationshipId}"`);
    const noItems = { ...service, currentRound: service.currentRound ? { ...service.currentRound, selfRecordable: [] } : null };
    const zero = renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={noItems} />);
    expect(zero).toContain("ดูความคืบหน้า");
    expect(zero).not.toContain("บันทึกเลย");
    expect(renderToStaticMarkup(<PatientPersonalHome patient={patient} />)).not.toContain("บริการครั้งปัจจุบัน");
    expect(renderToStaticMarkup(<PatientPersonalHome patient={patient} serviceProgress={{ ...service, programId: null }} />)).not.toContain("บริการครั้งปัจจุบัน");
  });
});
