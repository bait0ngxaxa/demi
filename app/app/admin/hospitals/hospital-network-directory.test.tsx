import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  HospitalNetworkDirectoryEntry,
  HospitalNetworkDirectoryPage,
} from "@/modules/hospital-service-areas/services/hospital-network-governance-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/form", () => ({ default: ({ children, ...props }: ComponentProps<"form">) => <form {...props}>{children}</form> }));
vi.mock("@/modules/hospital-service-areas/transport/server-actions", () => ({
  applyHospitalBulkRegistrationAction: vi.fn(),
  createNetworkHospitalAction: vi.fn(),
  previewHospitalBulkRegistrationAction: vi.fn(),
  retireHospitalsAction: vi.fn(),
}));

import { hospitalDirectoryHref, HospitalNetworkDirectory } from "./hospital-network-directory";

function entry(
  id: string, status: HospitalNetworkDirectoryEntry["status"], role: HospitalNetworkDirectoryEntry["role"],
  extra: Partial<HospitalNetworkDirectoryEntry> = {},
): HospitalNetworkDirectoryEntry {
  return {
    id, hospitalCode: `CODE-${id}`, name: `โรงพยาบาล ${id}`, status, role,
    networkParentId: null, networkParentName: null, registeredForParentHospitalId: null, registeredForParentHospitalName: null,
    ...extra,
  };
}

function directoryPage(items: HospitalNetworkDirectoryEntry[], position: { page?: number; totalPages?: number; total?: number } = {}): HospitalNetworkDirectoryPage {
  const page = position.page ?? 1;
  const totalPages = position.totalPages ?? 1;
  return { items, page, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages, total: position.total ?? items.length };
}

const nonce = "11111111-1111-4111-8111-111111111111";
const bulkNonce = "22222222-2222-4222-8222-222222222222";

function render(
  filter: "network" | "pending" | "retired",
  items: HospitalNetworkDirectoryEntry[],
  options: { value?: string; page?: number; totalPages?: number; total?: number; onboardingPaths?: Record<string, "PENDING_APPLICATION" | "OPEN_INVITATION"> } = {},
): string {
  return renderToStaticMarkup(
    <HospitalNetworkDirectory
      bulkSubmissionNonce={bulkNonce}
      directory={directoryPage(items, options)}
      filter={filter}
      onboardingPaths={options.onboardingPaths}
      submissionNonce={nonce}
      value={options.value ?? ""}
    />,
  );
}

describe("Hospital governance directory views", () => {
  it("renders the network page it was given and sends the registration nonce", () => {
    const markup = render("network", [entry("active", "ACTIVE", "PARENT"), entry("pending", "PENDING_VERIFICATION", "CHILD")]);
    expect(markup).toContain("โรงพยาบาล active");
    expect(markup).toContain("โรงพยาบาล pending");
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

  it("names each Child's Parent from the page's own lookup", () => {
    const markup = render("network", [
      entry("attached", "ACTIVE", "CHILD", { networkParentId: "parent", networkParentName: "โรงพยาบาลแม่ข่าย ก" }),
      entry("free", "ACTIVE", "CHILD"),
      entry("unclassified", "ACTIVE", null),
    ]);
    expect(markup).toContain("ลูกข่ายของ โรงพยาบาลแม่ข่าย ก");
    expect(markup).toContain("ลูกข่ายที่ยังไม่มีแม่ข่าย");
    expect(markup).toContain("ยังไม่กำหนดประเภท");
  });

  it("pages the directory with links that keep the filter and the search", () => {
    const markup = render("pending", [entry("pending", "PENDING_VERIFICATION", "PARENT")], { value: "ก ข", page: 2, totalPages: 3, total: 60 });
    expect(markup).toContain("หน้า 2 จาก 3");
    expect(markup).toContain('href="/app/admin/hospitals?status=pending&amp;value=%E0%B8%81+%E0%B8%82"');
    expect(markup).toContain('href="/app/admin/hospitals?status=pending&amp;value=%E0%B8%81+%E0%B8%82&amp;page=3"');
    // The search form sends the filter and the term but no page, so a new search starts on page 1.
    expect(markup).toContain('<input type="hidden" name="status" value="pending"/>');
    expect(markup).toContain('name="value"');
    expect(markup).not.toContain('name="page"');
    expect(markup).toContain("พบ 60 แห่งที่ตรงกับ “ก ข”");
  });

  it("links the network view without a status and leaves out page 1", () => {
    expect(hospitalDirectoryHref("network", "", 1)).toBe("/app/admin/hospitals");
    expect(hospitalDirectoryHref("network", "abc", 2)).toBe("/app/admin/hospitals?value=abc&page=2");
    expect(hospitalDirectoryHref("retired", "", 1)).toBe("/app/admin/hospitals?status=retired");
  });

  it("shows which first-OWNER path is open for a Parent (ADR-0024)", () => {
    const parents = [entry("applied", "PENDING_VERIFICATION", "PARENT"), entry("invited", "ACTIVE", "PARENT")];
    const onboardingPaths = { applied: "PENDING_APPLICATION", invited: "OPEN_INVITATION" } as const;
    const network = render("network", parents, { onboardingPaths });
    expect(network).toContain("มีคำขอรออนุมัติ");
    expect(network).toContain("มีคำเชิญเปิดอยู่");
    const pending = render("pending", [parents[0]!], { onboardingPaths });
    expect(pending).toContain("แม่ข่าย · มีคำขอรออนุมัติ");
    expect(pending).not.toContain("มีคำเชิญเปิดอยู่");
  });

  it("lists the pending page for bulk retirement with the registering Parent", () => {
    const markup = render("pending", [
      entry("pending", "PENDING_VERIFICATION", "CHILD"),
      entry("parent-created", "PENDING_VERIFICATION", "CHILD", { registeredForParentHospitalId: "creator", registeredForParentHospitalName: "โรงพยาบาล creator" }),
    ]);
    expect(markup).toContain('type="checkbox" name="hospitalId" value="pending"');
    // ADR-0018: ADMIN sees which Parent registered a pending Child.
    expect(markup).toContain("ลูกข่าย · สร้างโดยแม่ข่าย โรงพยาบาล creator");
    expect(markup).toContain("เลือกโรงพยาบาลก่อน");
    expect(markup).toContain('aria-current="page"');
  });

  it("lists RETIRED Hospitals with the way back to the onboarding list", () => {
    const markup = render("retired", [entry("retired", "RETIRED", "PARENT")]);
    expect(markup).toContain("โรงพยาบาล retired");
    expect(markup).toContain("คืนสู่รายชื่อรอสมัคร");
    expect(markup).toContain('href="/app/admin/hospitals/retired#hospital-retirement-heading"');
  });

  it("says when a search finds nothing", () => {
    expect(render("network", [], { value: "ไม่มี" })).toContain("ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา");
  });
});
