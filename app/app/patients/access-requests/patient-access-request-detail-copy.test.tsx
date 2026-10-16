import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.actor,
}));
vi.mock("@/modules/patient-access-requests/services/patient-access-request-service", () => ({
  getHospitalPatientAccessRequestDetail: mocks.detail,
}));

import type { PatientAccessRequestDetail } from "@/modules/patient-access-requests/services/patient-access-request-service";
import PatientAccessRequestDetailPage from "./[requestId]/page";

describe("Patient access request issued-link copy", () => {
  beforeEach(() => {
    mocks.actor.mockResolvedValue({});
    mocks.detail.mockResolvedValue({
      requestId: "11111111-1111-4111-8111-111111111111",
      hospitalId: "22222222-2222-4222-8222-222222222222",
      hospitalName: "โรงพยาบาลทดสอบ",
      hospitalCode: "TEST-01",
      status: "ACTIVATION_ISSUED",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      reviewedAt: new Date("2026-10-01T01:00:00.000Z"),
      completedAt: null,
      resolution: null,
      patientName: "สมชาย ใจดี",
      reconciliation: null,
    } satisfies PatientAccessRequestDetail);
  });

  it("says a link was issued without implying delivery or account activation", async () => {
    const markup = renderToStaticMarkup(await PatientAccessRequestDetailPage({
      params: Promise.resolve({ requestId: "11111111-1111-4111-8111-111111111111" }),
    }));

    expect(markup).toContain("ออกลิงก์เปิดใช้งานแล้ว");
    expect(markup).toContain("ผู้ป่วยตั้งรหัสผ่านเองได้เมื่อเปิดลิงก์ที่ออกไว้");
    expect(markup).toContain("การออกใหม่จะยกเลิกลิงก์เดิมที่ยังใช้ได้");
    expect(markup).not.toContain("ลิงก์ที่ได้รับ");
    expect(markup).not.toContain("ส่งลิงก์เปิดใช้งานให้ผู้ป่วยแล้ว");
  });
});
