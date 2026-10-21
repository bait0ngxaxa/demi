import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/hospital-service-areas/transport/server-actions", () => ({
  cancelPendingChildFacilityAction: vi.fn(),
  changeChildOwnerInviteeAction: vi.fn(),
  endServiceAreaAction: vi.fn(),
  inviteReplacementChildOwnerAction: vi.fn(),
  issueChildOwnerLinkAction: vi.fn(),
  renameChildFacilityAction: vi.fn(),
  revokeChildOwnerLinkAction: vi.fn(),
}));

import { ChildFacilityPanel, type ChildFacilityPanelProps } from "./child-facility-panel";

const base: ChildFacilityPanelProps = {
  parentHospitalId: "11111111-1111-4111-8111-111111111111",
  areaId: "22222222-2222-4222-8222-222222222222",
  attachedAt: "2026-10-21T03:00:00.000Z",
  child: { id: "33333333-3333-4333-8333-333333333333", hospitalCode: "H-ABCDEF", name: "รพ.สต.บ้านใหม่", updatedAt: "2026-10-21T03:00:00.000Z" },
  state: "PENDING_ACTIVATION",
  invitation: {
    inviteeName: "สมหญิง ดูแลดี",
    delivery: "ACTIVATION_LINK",
    link: { status: "OPEN", expiresAt: "2026-10-22T03:00:00.000Z", mode: "REMOTE" },
  },
  lastDeclinedAt: null,
  registeredByThisParent: true,
};

describe("Parent Child facility panel (ADR-0018 O-D5)", () => {
  it("offers link, invitee, rename and cancel actions for a pending Child, and no Patient or report access", () => {
    const markup = renderToStaticMarkup(<ChildFacilityPanel {...base} />);
    expect(markup).toContain("รอเปิดใช้งาน");
    expect(markup).toContain("สมหญิง ดูแลดี");
    for (const label of ["ออกลิงก์ใหม่", "เปิดใช้งานต่อหน้า", "ยกเลิกลิงก์", "เปลี่ยนผู้ถูกเชิญ", "เปลี่ยนชื่อ", "ยกเลิกหน่วยบริการ"]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain('href="/app/patients');
    expect(markup).not.toContain('href="/app/hospitals/reporting');
    expect(markup).not.toContain("นำออกจากเครือข่าย");
  });

  it("shows only an acceptance wait and no link controls for an ACTIVE-account invitee", () => {
    const markup = renderToStaticMarkup(<ChildFacilityPanel {...base} invitation={{ ...base.invitation!, delivery: "ACCOUNT_ACCEPTANCE", link: { status: "NONE", expiresAt: null, mode: null } }} />);
    expect(markup).toContain("รอผู้ถูกเชิญตอบรับในบัญชี DEMI ของตนเอง");
    expect(markup).not.toContain("ออกลิงก์ใหม่");
  });

  it("lets the Parent invite someone else after a decline", () => {
    const markup = renderToStaticMarkup(<ChildFacilityPanel {...base} invitation={null} lastDeclinedAt="2026-10-21T05:00:00.000Z" />);
    expect(markup).toContain("ผู้ถูกเชิญปฏิเสธคำเชิญ");
    expect(markup).toContain("เชิญผู้ดูแล");
    expect(markup).not.toContain("ออกลิงก์ใหม่");
  });

  it("limits an ACTIVE Child to rename and the existing association actions; the Child manages its own OWNER", () => {
    const markup = renderToStaticMarkup(<ChildFacilityPanel {...base} invitation={null} registeredByThisParent={false} state="ACTIVE" />);
    expect(markup).toContain("ใช้งานอยู่");
    expect(markup).toContain(`href="/app/patients?hospitalId=${base.child.id}"`);
    expect(markup).toContain("เปลี่ยนชื่อ");
    expect(markup).toContain("นำออกจากเครือข่าย");
    for (const label of ["ออกลิงก์ใหม่", "เปลี่ยนผู้ถูกเชิญ", "เชิญผู้ดูแลคนใหม่", "ยกเลิกหน่วยบริการ"]) {
      expect(markup).not.toContain(label);
    }
  });

  it("offers a replacement OWNER invitation only when an ACTIVE Child has no OWNER", () => {
    const markup = renderToStaticMarkup(<ChildFacilityPanel {...base} invitation={null} state="NO_OWNER" />);
    expect(markup).toContain("ไม่มีผู้ดูแล");
    expect(markup).toContain("เชิญผู้ดูแลคนใหม่");
    expect(markup).not.toContain("ยกเลิกหน่วยบริการ");
  });
});
