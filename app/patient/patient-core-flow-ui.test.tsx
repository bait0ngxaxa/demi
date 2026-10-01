import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/patient-access-requests/transport/server-actions", () => ({
  submitPublicPatientAccessRequestAction: vi.fn(),
  reviewPatientAccessRequestAction: vi.fn(),
  withdrawPatientAccessRequestByHospitalAction: vi.fn(),
}));

vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({
  createPatientServiceRequestAction: vi.fn(),
  withdrawOwnPatientServiceRequestAction: vi.fn(),
  setHospitalServiceOfferingAction: vi.fn(),
  reviewPatientServiceRequestAction: vi.fn(),
}));

import { HospitalServiceCatalogWorkspace } from "../app/patients/service-catalog/hospital-service-catalog-workspace";
import { PatientServicesWorkspace } from "../app/personal/services/patient-services-workspace";
import { PatientAccessRequestForm } from "./access-request/patient-access-request-form";
import { PatientAccessRequestReviewControls } from "../app/patients/access-requests/patient-access-request-review-controls";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const offeringId = "33333333-3333-4333-8333-333333333333";
const osmRelationshipId = "44444444-4444-4444-8444-444444444444";
const osmUserId = "55555555-5555-4555-8555-555555555555";

describe("Patient core flow presentation", () => {
  it("keeps public onboarding separate from Login and recovery, with no prefilled identity", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientAccessRequestForm, {
        hospitals: [{ id: hospitalId, hospitalCode: "TEST-01", name: "โรงพยาบาลทดสอบ" }],
      }),
    );

    expect(markup).toContain("โรงพยาบาลจะตรวจสอบตัวตน");
    expect(markup).toContain("การทราบเลขบัตรไม่ใช่หลักฐานยืนยันตัวตน");
    expect(markup).toContain('name="nationalId"');
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain("password");
    expect(markup).not.toContain("1000000000009");
    expect(markup).not.toContain("identityKeyHash");
  });

  it("uses preference language and avoids exposing the OSM User ID in Patient markup", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientServicesWorkspace, {
        relationships: [
          {
            relationshipId,
            hospitalName: "โรงพยาบาลทดสอบ",
            hospitalActive: true,
            offerings: [{ offeringId, code: "SCREENING" as const }],
            osmChoices: [{ relationshipId: osmRelationshipId, displayName: "สมใจ ผู้ดูแล" }],
            requests: [
              {
                requestId: "66666666-6666-4666-8666-666666666666",
                serviceCode: "SCREENING" as const,
                status: "PENDING" as const,
                preferredOsmName: "สมใจ ผู้ดูแล",
                createdAt: new Date("2026-10-01T00:00:00.000Z"),
              },
            ],
          },
        ],
      }),
    );

    expect(markup).toContain("ความประสงค์");
    expect(markup).toContain("ให้โรงพยาบาลจัดผู้ดูแลให้");
    expect(markup).toContain("รอโรงพยาบาลตรวจสอบ");
    expect(markup).toContain("การส่งคำขอยังไม่ใช่การลงทะเบียนใน Program");
    expect(markup).not.toContain("อสม.ที่ได้รับมอบหมาย");
    expect(markup).not.toContain(osmUserId);
    expect(markup).not.toContain("authSubject");
    expect(markup).not.toContain("identityKeyHash");
  });

  it("labels the supported catalog categories as request offerings", () => {
    const markup = renderToStaticMarkup(
      createElement(HospitalServiceCatalogWorkspace, {
        catalogs: [
          {
            hospitalId,
            hospitalCode: "TEST-01",
            hospitalName: "โรงพยาบาลทดสอบ",
            offerings: [
              { code: "SCREENING" as const, enabled: true },
              { code: "FOLLOW_UP" as const, enabled: false },
              { code: "EMPOWERMENT" as const, enabled: false },
            ],
          },
        ],
      }),
    );

    expect(markup).toContain("คัดกรอง");
    expect(markup).toContain("ติดตาม");
    expect(markup).toContain("เสริมพลัง");
    expect(markup).toContain("ไม่สร้าง Program หรือมอบหมาย อสม.");
  });

  it("requires direct National ID verification in Hospital review controls", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientAccessRequestReviewControls, { requestId: "77777777-7777-4777-8777-777777777777" }),
    );

    expect(markup).toContain("เลขบัตรประชาชนที่ตรวจยืนยันโดยตรง");
    expect(markup).toContain('name="identityVerified"');
    expect(markup).toContain("ตรวจยืนยันตัวตนกับผู้ยื่นคำขอโดยตรงแล้ว");
    expect(markup).not.toContain("identityKeyHash");
    expect(markup).not.toContain("authSubject");
  });
});
