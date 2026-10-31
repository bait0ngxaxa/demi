import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/hospital-onboarding/transport/parent-owner-invitation-actions", () => ({
  changeParentOwnerInviteeAction: vi.fn(),
  inviteParentOwnerAction: vi.fn(),
  issueParentOwnerLinkAction: vi.fn(),
  revokeParentOwnerLinkAction: vi.fn(),
}));

import { ParentOwnerInvitationSection, type ParentOwnerInvitationSectionProps } from "./parent-owner-invitation-section";

const invitation: NonNullable<ParentOwnerInvitationSectionProps["invitation"]> = {
  inviteeName: "สมศักดิ์ ผู้ดูแล",
  invitedAt: "2026-10-31T03:00:00.000Z",
  delivery: "ACTIVATION_LINK",
  link: { status: "OPEN", expiresAt: "2026-11-01T03:00:00.000Z", mode: "REMOTE" },
};

const base: ParentOwnerInvitationSectionProps = {
  hospital: { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลชุมชนใหม่" },
  availability: "FIRST_OWNER",
  pendingApplication: null,
  invitation: null,
  lastDeclinedAt: null,
  submissionNonce: "22222222-2222-4222-8222-222222222222",
};

function render(props: Partial<ParentOwnerInvitationSectionProps> = {}): string {
  return renderToStaticMarkup(<ParentOwnerInvitationSection {...base} {...props} />);
}

describe("platform ADMIN Parent OWNER invitation section (ADR-0024)", () => {
  it("invites the first OWNER of a pending Parent with the shared invitee form and its nonce", () => {
    const markup = render();
    expect(markup).toContain("เชิญผู้ดูแลโรงพยาบาลคนแรก");
    for (const label of ["เลขบัตรประชาชนผู้ดูแล", "ชื่อ", "นามสกุล", "ส่งลิงก์หรือคิวอาร์โค้ด (ใช้ได้ 24 ชั่วโมง)", "เปิดใช้งานต่อหน้าบนเครื่องนี้ (ใช้ได้ 15 นาที)", "ส่งคำเชิญ"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain(`name="submissionNonce" value="${base.submissionNonce}"`);
    expect(markup).toContain(`name="hospitalId" value="${base.hospital.id}"`);
    expect(markup).not.toContain("ออกลิงก์ใหม่");
  });

  it("titles a replacement OWNER invitation for an ACTIVE Parent without an OWNER", () => {
    const markup = render({ availability: "REPLACEMENT" });
    expect(markup).toContain("เชิญผู้ดูแลโรงพยาบาลแทน");
    expect(markup).not.toContain("เชิญผู้ดูแลโรงพยาบาลคนแรก");
  });

  it("shows an open link as รอเปิดใช้งาน with its expiry and the regenerate, revoke and change actions", () => {
    const markup = render({ invitation });
    expect(markup).toContain("รอเปิดใช้งาน");
    expect(markup).toContain("สมศักดิ์ ผู้ดูแล");
    expect(markup).toContain("ลิงก์ใช้ได้ถึง");
    for (const label of ["ออกลิงก์ใหม่", "เปิดใช้งานต่อหน้า", "ยกเลิกลิงก์", "เปลี่ยนผู้ถูกเชิญ"]) expect(markup).toContain(label);
    expect(markup).not.toContain("ส่งคำเชิญ<");
  });

  it("shows an expired link as หมดอายุ without a revoke action", () => {
    const markup = render({ invitation: { ...invitation, link: { status: "EXPIRED", expiresAt: "2026-10-30T03:00:00.000Z", mode: "REMOTE" } } });
    expect(markup).toContain("หมดอายุ");
    expect(markup).toContain("ออกลิงก์ใหม่");
    expect(markup).not.toContain("ยกเลิกลิงก์");
  });

  it("shows an ACTIVE-account invitee as รอตอบรับ with no link controls", () => {
    const markup = render({ invitation: { ...invitation, delivery: "ACCOUNT_ACCEPTANCE", link: { status: "NONE", expiresAt: null, mode: null } } });
    expect(markup).toContain("รอตอบรับ");
    expect(markup).toContain("เปลี่ยนผู้ถูกเชิญ");
    expect(markup).not.toContain("ออกลิงก์ใหม่");
    expect(markup).not.toContain("ยกเลิกลิงก์");
  });

  it("shows a held caregiver-claimed invitee as ต้องคืนบัญชีโดยผู้ดูแลระบบ with the recovery tool and cancel", () => {
    const markup = render({ invitation: { ...invitation, delivery: "ADMIN_RESET_REQUIRED", link: { status: "NONE", expiresAt: null, mode: null } } });
    expect(markup).toContain("ต้องคืนบัญชีโดยผู้ดูแลระบบ");
    expect(markup).toContain('href="/app/admin/recovery"');
    expect(markup).toContain("ยกเลิกคำเชิญ");
    expect(markup).not.toContain("ออกลิงก์ใหม่");
  });

  it("links a PENDING application to its review and offers no invitation form until it is decided", () => {
    const markup = render({
      availability: "PENDING_APPLICATION",
      pendingApplication: { id: "33333333-3333-4333-8333-333333333333", createdAt: "2026-10-30T03:00:00.000Z" },
    });
    expect(markup).toContain("มีคำขอขึ้นทะเบียนรอพิจารณา");
    expect(markup).toContain('href="/app/admin/hospital-onboarding/33333333-3333-4333-8333-333333333333"');
    expect(markup).toContain("ต้องอนุมัติหรือปฏิเสธคำขอนี้ก่อน");
    expect(markup).not.toContain("ส่งคำเชิญ");
    expect(markup).not.toContain("เลขบัตรประชาชนผู้ดูแล");
  });

  it("reports a decline and offers a new invitation", () => {
    const markup = render({ lastDeclinedAt: "2026-10-31T05:00:00.000Z" });
    expect(markup).toContain("ผู้ถูกเชิญปฏิเสธคำเชิญเมื่อ");
    expect(markup).toContain("ส่งคำเชิญ");
  });

  it("keeps a 380 px layout: one column below sm, wrapping actions and breakable names", () => {
    const markup = render({ invitation });
    expect(markup).toContain("flex min-w-0 flex-col gap-3 sm:flex-row");
    expect(markup).toContain("flex flex-wrap gap-2");
    expect(markup).toContain("break-words");
    // Invitee fields stack in one column and only split into two from sm upward.
    expect(markup).toContain("grid gap-4 sm:grid-cols-2");
    expect(markup).toContain("min-h-11");
    expect(markup).not.toMatch(/\bw-\[(?:[4-9]\d\d|\d{4,})px\]/u);
  });
});
