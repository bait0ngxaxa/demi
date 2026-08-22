import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PatientProgramStatus } from "@prisma/client";
import type { PatientFinalAssessmentProjection } from "../services/patient-final-assessment-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

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

vi.mock("../transport/server-actions", () => ({
  createPatientFinalAssessmentAction: vi.fn(),
}));

import { PatientProgramFinalAssessmentWorkspace } from "../../../../app/app/patients/[relationshipId]/programs/[programId]/final-assessment-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "33333333-3333-4333-8333-333333333333";
const recordedAt = new Date("2026-08-22T05:00:00.000Z");

const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
};

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
      routine: { recorded: false, recordedAt: null, recordedBy: null, evidence: null },
      floatingChart: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        summary: null,
        evidence: null,
      },
      dreamCard: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        description: null,
        evidence: null,
      },
      confidence: {
        recorded: false,
        recordedAt: null,
        recordedBy: null,
        score: null,
        improvementPlan: null,
      },
    },
    ...overrides,
  };
}

function projection(
  overrides: Partial<PatientFinalAssessmentProjection> = {},
): PatientFinalAssessmentProjection {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    programStatus: PatientProgramStatus.ACTIVE,
    finalAssessment: null,
    ...overrides,
  };
}

function existingFinal(): NonNullable<PatientFinalAssessmentProjection["finalAssessment"]> {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    recordedBy: { id: "66666666-6666-4666-8666-666666666666", displayName: "ผู้บันทึก" },
    recordedAt,
    createdAt: recordedAt,
    measurements: {
      weight: 72.5,
      waistCircumference: null,
      systolicBloodPressure: 120,
      diastolicBloodPressure: 80,
      bloodSugar: 95,
    },
  };
}

describe("Final Assessment Program workspace", () => {
  it("renders the active manage state with the five-field create form", () => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);

    const markup = renderToStaticMarkup(
      createElement(PatientProgramFinalAssessmentWorkspace, {
        detail: detail(),
        finalAssessment: projection(),
      }),
    );

    expect(markup).toContain("ยังไม่มีการบันทึกข้อมูล Final Assessment สำหรับโปรแกรมนี้");
    expect(markup).toContain("บันทึกค่าดิบของ Final Assessment");
    expect(markup).toContain("บันทึก Final Assessment");
    expect(markup).toContain('name="patientHospitalRelationshipId"');
    expect(markup).toContain('name="patientProgramId"');
    expect(markup).toContain('name="weight"');
    expect(markup).toContain('name="waistCircumference"');
    expect(markup).toContain('name="systolicBloodPressure"');
    expect(markup).toContain('name="diastolicBloodPressure"');
    expect(markup).toContain('name="bloodSugar"');
    expect(markup).toContain("ค่าที่แสดงเป็นค่าดิบที่บันทึกไว้สำหรับโปรแกรมนี้");
  });

  it("renders an existing active Final as immutable read-only data", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientProgramFinalAssessmentWorkspace, {
        detail: detail(),
        finalAssessment: projection({ finalAssessment: existingFinal() }),
      }),
    );

    expect(markup).toContain("บันทึกแล้ว · อ่านอย่างเดียว");
    expect(markup).toContain("72.5");
    expect(markup).toContain("ไม่ได้บันทึก");
    expect(markup).toContain("ผู้บันทึก");
    expect(markup).toContain("บันทึกในระบบเมื่อ");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("ลบข้อมูล");
  });

  it("renders an explicit absence for an active read-only actor without mutation controls", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientProgramFinalAssessmentWorkspace, {
        detail: detail({ canManage: false }),
        finalAssessment: projection(),
      }),
    );

    expect(markup).toContain("ยังไม่มีการบันทึกข้อมูล Final Assessment สำหรับโปรแกรมนี้");
    expect(markup).toContain("ไม่มีสิทธิ์บันทึก Final Assessment ใหม่");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("บันทึกค่าดิบของ Final Assessment");
  });

  it("renders a completed Final as historical read-only information", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientProgramFinalAssessmentWorkspace, {
        detail: detail({ status: PatientProgramStatus.COMPLETED, canManage: false, completedAt: recordedAt }),
        finalAssessment: projection({
          programStatus: PatientProgramStatus.COMPLETED,
          finalAssessment: existingFinal(),
        }),
      }),
    );

    expect(markup).toContain("ประวัติอ่านอย่างเดียว");
    expect(markup).toContain("สถานะโปรแกรม: เสร็จสิ้นแล้ว");
    expect(markup).toContain("บันทึกในระบบเมื่อ");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("บันทึก Final Assessment");
  });

  it("renders completed absence as a neutral factual state", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientProgramFinalAssessmentWorkspace, {
        detail: detail({ status: PatientProgramStatus.COMPLETED, canManage: false, completedAt: recordedAt }),
        finalAssessment: projection({ programStatus: PatientProgramStatus.COMPLETED }),
      }),
    );

    expect(markup).toContain("ยังไม่มีการบันทึกข้อมูล Final Assessment สำหรับโปรแกรมนี้");
    expect(markup).toContain("โปรแกรมนี้เสร็จสิ้นแล้ว จึงไม่สามารถสร้าง Final Assessment เพิ่มได้");
    expect(markup).not.toContain("ล้มเหลว");
    expect(markup).not.toContain("ไม่สำเร็จ");
    expect(markup).not.toContain("ผลลัพธ์ไม่ดี");
    expect(markup).not.toContain("<form");
  });
});
