import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({
  createPatientServiceRequestAction: vi.fn(),
  withdrawOwnPatientServiceRequestAction: vi.fn(),
  setHospitalServiceOfferingAction: vi.fn(),
  confirmPatientServiceRequestAction: vi.fn(),
  rejectPatientServiceRequestAction: vi.fn(),
}));

import { HospitalServiceCatalogWorkspace } from "../app/patients/service-catalog/hospital-service-catalog-workspace";
import { PatientServicesWorkspace } from "../app/personal/services/patient-services-workspace";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const offeringId = "33333333-3333-4333-8333-333333333333";
const osmRelationshipId = "44444444-4444-4444-8444-444444444444";
const osmUserId = "55555555-5555-4555-8555-555555555555";

describe("Patient service request presentation", () => {
  it("uses preference language and avoids exposing the OSM User ID in Patient markup", () => {
    const markup = renderToStaticMarkup(
      createElement(PatientServicesWorkspace, {
        preferredDateBounds: { min: "2026-10-02", max: "2026-11-30" },
        relationships: [
          {
            relationshipId,
            hospitalName: "โรงพยาบาลทดสอบ",
            hospitalActive: true,
            careEnded: false,
            offerings: [{ offeringId, code: "SCREENING" as const }],
            // The service lists the assigned อสม. first.
            osmChoices: [
              { relationshipId: osmRelationshipId, displayName: "สมใจ ผู้ดูแล", assigned: true },
              { relationshipId: "77777777-7777-4777-8777-777777777777", displayName: "สมหญิง อสม.", assigned: false },
            ],
            requests: [
              {
                requestId: "66666666-6666-4666-8666-666666666666",
                serviceCode: "SCREENING" as const,
                status: "PENDING" as const,
                preferredOsmName: "สมใจ ผู้ดูแล",
                preferredDate: "2026-10-05",
                preferredSlot: "AFTERNOON" as const,
                note: "สะดวกหลังบ่ายสอง",
                rejectionReason: null,
                createdAt: new Date("2026-10-01T00:00:00.000Z"),
              },
              {
                requestId: "88888888-8888-4888-8888-888888888888",
                serviceCode: "FOLLOW_UP" as const,
                status: "REJECTED" as const,
                preferredOsmName: null,
                preferredDate: "2026-10-03",
                preferredSlot: "ANY" as const,
                note: null,
                rejectionReason: "ช่วงนี้ไม่มี อสม. ว่าง",
                createdAt: new Date("2026-09-30T00:00:00.000Z"),
              },
            ],
          },
        ],
      }),
    );

    // ADR-0023 (SR-D3, SR-D6): date, slot and note; the assigned อสม. is preselected; a rejection shows its reason.
    expect(markup).toContain('type="date"');
    expect(markup).toContain('min="2026-10-02"');
    expect(markup).toContain('max="2026-11-30"');
    expect(markup).toContain('name="preferredSlot"');
    expect(markup).toContain('name="note"');
    expect(markup).toContain(`<option value="${osmRelationshipId}" selected="">สมใจ ผู้ดูแล (อสม. ผู้ดูแลของคุณ)</option>`);
    expect(markup.indexOf("(อสม. ผู้ดูแลของคุณ)")).toBeLessThan(markup.indexOf("สมหญิง อสม."));
    expect(markup).toContain("ไม่ระบุ — ให้โรงพยาบาลจัดให้");
    expect(markup).toContain("5 ตุลาคม 2569 · บ่าย");
    expect(markup).toContain("หมายเหตุ: สะดวกหลังบ่ายสอง");
    expect(markup).toContain("เหตุผลที่ไม่อนุมัติ: ช่วงนี้ไม่มี อสม. ว่าง");
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

});
