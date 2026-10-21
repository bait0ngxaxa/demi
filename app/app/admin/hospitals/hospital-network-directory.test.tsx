import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HospitalNetworkDirectoryEntry } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/hospital-service-areas/transport/server-actions", () => ({
  createNetworkHospitalAction: vi.fn(),
  retireHospitalsAction: vi.fn(),
}));

import { HospitalNetworkDirectory } from "./hospital-network-directory";

function entry(id: string, status: HospitalNetworkDirectoryEntry["status"], role: HospitalNetworkDirectoryEntry["role"]): HospitalNetworkDirectoryEntry {
  return { id, hospitalCode: `CODE-${id}`, name: `โรงพยาบาล ${id}`, status, role, networkParentId: null };
}

const hospitals = [
  entry("pending", "PENDING_VERIFICATION", "CHILD"),
  entry("retired", "RETIRED", "PARENT"),
  entry("active", "ACTIVE", "PARENT"),
];
const nonce = "11111111-1111-4111-8111-111111111111";

describe("Hospital governance directory views", () => {
  it("keeps RETIRED Hospitals out of the network view and sends the registration nonce", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory filter="network" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain("โรงพยาบาล active");
    expect(markup).toContain("โรงพยาบาล pending");
    expect(markup).not.toContain("โรงพยาบาล retired");
    expect(markup).toContain(`<input type="hidden" name="submissionNonce" value="${nonce}"/>`);
    expect(markup).toContain("ถอนแล้ว");
  });

  it("lists only PENDING Hospitals for bulk retirement", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory filter="pending" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain('type="checkbox" name="hospitalId" value="pending"');
    expect(markup).not.toContain("โรงพยาบาล retired");
    expect(markup).not.toContain("โรงพยาบาล active");
    expect(markup).toContain("เลือกโรงพยาบาลก่อน");
    expect(markup).toContain('aria-current="page"');
  });

  it("lists RETIRED Hospitals with the way back to the onboarding list", () => {
    const markup = renderToStaticMarkup(<HospitalNetworkDirectory filter="retired" hospitals={hospitals} submissionNonce={nonce} />);
    expect(markup).toContain("โรงพยาบาล retired");
    expect(markup).not.toContain("โรงพยาบาล pending");
    expect(markup).toContain("คืนสู่รายชื่อรอสมัคร");
    expect(markup).toContain('href="/app/admin/hospitals/retired#hospital-retirement-heading"');
  });
});
