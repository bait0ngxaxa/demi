import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PatientProgramStatus } from "@prisma/client";
import type { PatientProgramDetail } from "../services/patient-program-query-service";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: mockedUseActionState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/modules/patient-program/transport/patient-program-service-one-server-actions", () => ({
  associatePatientProgramServiceOneArtifactAction: vi.fn(),
  recordPatientProgramServiceOneConfidenceAction: vi.fn(),
  recordPatientProgramServiceOneDreamCardAction: vi.fn(),
  recordPatientProgramServiceOneFloatingChartAction: vi.fn(),
  recordPatientProgramServiceOneRoutineAction: vi.fn(),
}));

import { PatientProgramServiceOneWorkspace } from "../../../../app/app/patients/[relationshipId]/programs/[programId]/service-one-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "33333333-3333-4333-8333-333333333333";
const recordedAt = new Date("2026-08-21T05:00:00.000Z");

const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
};

function activity(recorded = false) {
  return {
    recorded,
    recordedAt: recorded ? recordedAt : null,
    recordedBy: recorded ? { displayName: "ผู้บันทึก" } : null,
  };
}

function detail(overrides: Partial<PatientProgramDetail> = {}): PatientProgramDetail {
  return {
    programId,
    patientHospitalRelationshipId: relationshipId,
    status: PatientProgramStatus.ACTIVE,
    startedAt: recordedAt,
    completedAt: null,
    createdAt: recordedAt,
    createdBy: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้เปิดโปรแกรม" },
    initialBaseline: null,
    patient,
    canManage: true,
    serviceOne: {
      routine: { ...activity(), evidence: null },
      floatingChart: { ...activity(), summary: null, evidence: null },
      dreamCard: { ...activity(), description: null, evidence: null },
      confidence: { ...activity(), score: null, improvementPlan: null },
    },
    ...overrides,
  };
}

describe("Service 1 workspace presentation", () => {
  it("renders the progressive Thai workflow with optional evidence and bounded text", () => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);

    const markup = renderToStaticMarkup(
      createElement(PatientProgramServiceOneWorkspace, { detail: detail() }),
    );

    expect(markup).toContain("Service 1 — รู้จักตัวเอง");
    expect(markup).toContain("ตารางกิจวัตร");
    expect(markup).toContain("กราฟวัดลอยจม");
    expect(markup).toContain("การ์ดความฝัน");
    expect(markup).toContain("ไม้บรรทัดวัดใจ");
    expect(markup).toContain("0 จาก 4 กิจกรรมถูกบันทึกแล้ว");
    expect(markup).toMatch(/(?:maxLength|maxlength)="2000"/u);
    expect(markup).toContain('value="0"');
    expect(markup).toContain("ไม่ใช่เกณฑ์ผ่าน");
    expect(markup).not.toContain("แนบหลักฐานรูป");
  });

  it("renders recorded activities and completed Programs as read-only", () => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);

    const completed = detail({
      status: PatientProgramStatus.COMPLETED,
      completedAt: recordedAt,
      serviceOne: {
        routine: {
          ...activity(true),
          evidence: {
            artifactId: "55555555-5555-4555-8555-555555555555",
            mediaType: "image/jpeg",
            byteSize: 1024,
            createdAt: recordedAt,
          },
        },
        floatingChart: { ...activity(true), summary: "สรุปกราฟ", evidence: null },
        dreamCard: { ...activity(true), description: "ความฝัน", evidence: null },
        confidence: { ...activity(true), score: 7, improvementPlan: "แผนพัฒนา" },
      },
    });

    const markup = renderToStaticMarkup(
      createElement(PatientProgramServiceOneWorkspace, { detail: completed }),
    );

    expect(markup).toContain("4 จาก 4 กิจกรรมถูกบันทึกแล้ว");
    expect(markup).toContain("อ่านกิจกรรมและหลักฐานเดิมได้");
    expect(markup).toContain("สรุปกราฟ");
    expect(markup).toContain("ความฝัน");
    expect(markup).toContain("/evidence/55555555-5555-4555-8555-555555555555/content");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("แนบหลักฐานรูป");
  });
});
