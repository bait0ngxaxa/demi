import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HospitalNetworkDirectoryEntry } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/hospital-service-areas/transport/server-actions", () => ({
  applyHospitalBulkRegistrationAction: vi.fn(),
  createNetworkHospitalAction: vi.fn(),
  previewHospitalBulkRegistrationAction: vi.fn(),
  retireHospitalsAction: vi.fn(),
}));

import { HospitalNetworkDirectory } from "./hospital-network-directory";

function entry(
  id: string, status: HospitalNetworkDirectoryEntry["status"], role: HospitalNetworkDirectoryEntry["role"], registeredForParentHospitalId: string | null = null,
): HospitalNetworkDirectoryEntry {
  return { id, hospitalCode: `CODE-${id}`, name: `โรงพยาบาล ${id}`, status, role, networkParentId: null, registeredForParentHospitalId };
}

const hospitals = [
  entry("pending", "PENDING_VERIFICATION", "CHILD"),
  entry("retired", "RETIRED", "PARENT"),
  entry("active", "ACTIVE", "PARENT"),
  entry("creator", "ACTIVE", "PARENT"),
  entry("parent-created", "PENDING_VERIFICATION", "CHILD", "creator"),
];
const nonce = "11111111-1111-4111-8111-111111111111";
const bulkNonce = "22222222-2222-4222-8222-222222222222";

describe("Hospital governance directory views", () => {
  it("keeps RETIRED Hospitals out of the network view and sends the registration nonce", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory bulkSubmissionNonce={bulkNonce} filter="network" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain("โรงพยาบาล active");
    expect(markup).toContain("โรงพยาบาล pending");
    expect(markup).not.toContain("โรงพยาบาล retired");
    expect(markup).toContain(`<input type="hidden" name="submissionNonce" value="${nonce}"/>`);
    expect(markup).toContain("ถอนแล้ว");
    // O1-A: the file import renders with its own per-request nonce.
    expect(markup).toContain("นำเข้าโรงพยาบาลแม่ข่ายจากไฟล์");
    expect(markup).toContain(`<input type="hidden" name="submissionNonce" value="${bulkNonce}"/>`);
    expect(markup).toContain('name="file"');
    expect(markup).toContain('href="/templates/hospital-parent-import-template.csv"');
    // ADR-0018 amendment: the single-registration form no longer offers a network role choice.
    expect(markup).not.toContain('name="networkRole"');
  });

  it("shows which first-OWNER path is open for a Parent (ADR-0024)", () => {
    const parents = [entry("applied", "PENDING_VERIFICATION", "PARENT"), entry("invited", "ACTIVE", "PARENT")];
    const paths = { applied: "PENDING_APPLICATION", invited: "OPEN_INVITATION" } as const;
    const network = renderToStaticMarkup(<HospitalNetworkDirectory bulkSubmissionNonce={bulkNonce} filter="network" hospitals={parents} onboardingPaths={paths} submissionNonce={nonce} />);
    expect(network).toContain("มีคำขอรออนุมัติ");
    expect(network).toContain("มีคำเชิญเปิดอยู่");
    const pending = renderToStaticMarkup(<HospitalNetworkDirectory bulkSubmissionNonce={bulkNonce} filter="pending" hospitals={parents} onboardingPaths={paths} submissionNonce={nonce} />);
    expect(pending).toContain("แม่ข่าย · มีคำขอรออนุมัติ");
    expect(pending).not.toContain("มีคำเชิญเปิดอยู่");
  });

  it("lists only PENDING Hospitals for bulk retirement", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory bulkSubmissionNonce={bulkNonce} filter="pending" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain('type="checkbox" name="hospitalId" value="pending"');
    // ADR-0018: ADMIN sees which Parent registered a pending Child.
    expect(markup).toContain("ลูกข่าย · สร้างโดยแม่ข่าย โรงพยาบาล creator");
    expect(markup).not.toContain("โรงพยาบาล retired");
    expect(markup).not.toContain("โรงพยาบาล active");
    expect(markup).toContain("เลือกโรงพยาบาลก่อน");
    expect(markup).toContain('aria-current="page"');
  });

  it("lists RETIRED Hospitals with the way back to the onboarding list", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory bulkSubmissionNonce={bulkNonce} filter="retired" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain("โรงพยาบาล retired");
    expect(markup).not.toContain("โรงพยาบาล pending");
    expect(markup).toContain("คืนสู่รายชื่อรอสมัคร");
    expect(markup).toContain('href="/app/admin/hospitals/retired#hospital-retirement-heading"');
  });
});
