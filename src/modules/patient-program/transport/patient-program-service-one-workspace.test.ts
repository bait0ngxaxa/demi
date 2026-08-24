import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PatientProgramStatus } from "@prisma/client";
import type { PatientProgramDetail } from "../services/patient-program-query-service";
import { replacePatientEvidenceFile } from "../../patient-evidence/client/patient-evidence-upload-payload";

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

import {
  PatientProgramServiceOneWorkspace,
  patientProgramServiceOneWorkspaceInternals,
} from "../../../../app/app/patients/[relationshipId]/programs/[programId]/service-one-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const hospitalId = "33333333-3333-4333-8333-333333333333";
const artifactId = "55555555-5555-4555-8555-555555555555";
const recordedAt = new Date("2026-08-21T05:00:00.000Z");
const artifactUploadedAt = new Date("2026-08-21T01:00:00.000Z");
const evidenceAssociatedAt = new Date("2026-08-21T05:00:00.000Z");

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

function formatThaiDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
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
    expect(markup).not.toContain("bg-success-soft");
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
            artifactId,
            mediaType: "image/jpeg",
            byteSize: 1024,
            uploadedAt: artifactUploadedAt,
            associatedAt: evidenceAssociatedAt,
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
    expect(markup).toContain(`/evidence/${artifactId}/content`);
    expect(markup).toContain(`แนบแล้วเมื่อ ${formatThaiDateTime(evidenceAssociatedAt)}`);
    expect(markup).not.toContain(`แนบแล้วเมื่อ ${formatThaiDateTime(artifactUploadedAt)}`);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("แนบหลักฐานรูป");
  });

  it("offers the same optimized mobile image guidance after an activity is recorded", () => {
    mockedUseActionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), false]);
    const active = detail({
      serviceOne: {
        routine: { ...activity(true), evidence: null },
        floatingChart: { ...activity(), summary: null, evidence: null },
        dreamCard: { ...activity(), description: null, evidence: null },
        confidence: { ...activity(), score: null, improvementPlan: null },
      },
    });

    const markup = renderToStaticMarkup(
      createElement(PatientProgramServiceOneWorkspace, { detail: active }),
    );

    expect(markup).toContain('capture="environment"');
    expect(markup).toContain("เลือกรูปได้สูงสุด 25 MB");
    expect(markup).toContain("ระบบจะลดขนาดรูปให้อัตโนมัติก่อนอัปโหลด");
    expect(markup).not.toContain("ไม่เกิน 5 MB");
  });

  it("keeps the Service 1 evidence caption in the upload payload while optimization resolves", async () => {
    const originalFile = new File(["original"], "original.jpg", { type: "image/jpeg" });
    const optimizedFile = new File(["optimized"], "evidence.jpg", { type: "image/jpeg" });
    const uploadFormData = new FormData();
    const caption = "รูปหลักฐานก่อนทำกิจกรรม";

    uploadFormData.set("file", originalFile);
    uploadFormData.set("caption", caption);

    await replacePatientEvidenceFile(
      uploadFormData,
      originalFile,
      async () => {
        await Promise.resolve();
        return optimizedFile;
      },
    );

    expect(uploadFormData.get("caption")).toBe(caption);
    expect(uploadFormData.get("file")).toBe(optimizedFile);
  });

  it("passes the uploaded artifact to the narrow activity association and refreshes after success", async () => {
    const uploadFormData = new FormData();
    uploadFormData.set(
      "file",
      new Blob(["image-bytes"], { type: "image/jpeg" }),
      "dream-card.jpg",
    );
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ artifactId }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const associateAction = vi.fn().mockResolvedValue({
      status: "SUCCESS",
      result: {
        activity: "DREAM_CARD",
        operation: "ASSOCIATED",
        patientProgramId: programId,
        patientHospitalRelationshipId: relationshipId,
        artifactId,
        associatedAt: evidenceAssociatedAt.toISOString(),
      },
    });
    const refresh = vi.fn();

    const result = await patientProgramServiceOneWorkspaceInternals.uploadAndAssociateEvidence({
      activityKey: "DREAM_CARD",
      associateAction,
      fetcher,
      formData: uploadFormData,
      programId,
      refresh,
      relationshipId,
    });

    expect(result).toEqual({ status: "success", message: "แนบหลักฐานรูปเรียบร้อยแล้ว" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/app/patients/${relationshipId}/evidence/upload`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      body: uploadFormData,
      method: "POST",
    });
    expect(associateAction).toHaveBeenCalledTimes(1);
    const associationFormData = associateAction.mock.calls[0]?.[0];
    expect(associationFormData).toBeInstanceOf(FormData);
    expect(associationFormData?.get("patientProgramId")).toBe(programId);
    expect(associationFormData?.get("patientEvidenceArtifactId")).toBe(artifactId);
    expect(associationFormData?.get("activity")).toBe("DREAM_CARD");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not associate or refresh when the evidence upload fails", async () => {
    const uploadFormData = new FormData();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "ไฟล์ไม่ถูกต้อง" } }), {
        headers: { "content-type": "application/json" },
        status: 415,
      }),
    );
    const associateAction = vi.fn();
    const refresh = vi.fn();

    const result = await patientProgramServiceOneWorkspaceInternals.uploadAndAssociateEvidence({
      activityKey: "ROUTINE",
      associateAction,
      fetcher,
      formData: uploadFormData,
      programId,
      refresh,
      relationshipId,
    });

    expect(result).toEqual({ status: "error", message: "ไฟล์ไม่ถูกต้อง" });
    expect(associateAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces association failure as an error and does not report success", async () => {
    const uploadFormData = new FormData();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ artifactId }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const associateAction = vi.fn().mockResolvedValue({
      status: "ERROR",
      code: "CONFLICT",
      message: "หลักฐานถูกแนบแล้ว กรุณาโหลดข้อมูลล่าสุด",
    });
    const refresh = vi.fn();

    const result = await patientProgramServiceOneWorkspaceInternals.uploadAndAssociateEvidence({
      activityKey: "FLOATING_CHART",
      associateAction,
      fetcher,
      formData: uploadFormData,
      programId,
      refresh,
      relationshipId,
    });

    expect(result).toEqual({
      status: "error",
      message:
        "อัปโหลดรูปแล้ว แต่ยังแนบกับกิจกรรมไม่สำเร็จ: หลักฐานถูกแนบแล้ว กรุณาโหลดข้อมูลล่าสุด รูปยังอยู่ในรายการหลักฐานของผู้ป่วย และจะไม่แสดงเป็นหลักฐานของกิจกรรมจนกว่าจะเชื่อมโยงสำเร็จ",
    });
    expect(result.status).not.toBe("success");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not claim association failed when the association call throws", async () => {
    const uploadFormData = new FormData();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ artifactId }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const associateAction = vi.fn().mockRejectedValue(new Error("transport failure"));
    const refresh = vi.fn();

    const result = await patientProgramServiceOneWorkspaceInternals.uploadAndAssociateEvidence({
      activityKey: "DREAM_CARD",
      associateAction,
      fetcher,
      formData: uploadFormData,
      programId,
      refresh,
      relationshipId,
    });

    expect(result).toEqual({
      status: "error",
      message:
        "อัปโหลดรูปเรียบร้อยแล้ว แต่ยังยืนยันสถานะการเชื่อมโยงกับกิจกรรมไม่ได้ กรุณาตรวจสอบข้อมูลล่าสุดก่อนลองอีกครั้ง",
    });
    expect(result.status).not.toBe("success");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes authoritative evidence state when an upload response is incomplete", async () => {
    const uploadFormData = new FormData();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ relationshipId }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );
    const associateAction = vi.fn();
    const refresh = vi.fn();

    const result = await patientProgramServiceOneWorkspaceInternals.uploadAndAssociateEvidence({
      activityKey: "ROUTINE",
      associateAction,
      fetcher,
      formData: uploadFormData,
      programId,
      refresh,
      relationshipId,
    });

    expect(result).toEqual({
      status: "error",
      message: "อัปโหลดรูปแล้ว แต่ระบบไม่พบข้อมูลหลักฐาน กรุณาตรวจสอบรายการหลักฐานและข้อมูลล่าสุด",
    });
    expect(associateAction).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
