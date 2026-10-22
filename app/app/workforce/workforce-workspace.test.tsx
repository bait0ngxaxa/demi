import { MembershipStatus, MembershipType, Profession, UserStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkforceListResult, WorkforceListRow } from "@/modules/workforce/services/workforce-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { WorkforceWorkspace } from "./workforce-workspace";

const hospital = { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาล ก", hospitalCode: "H-001", scope: "OWNER" as const };
const second = { ...hospital, id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ข", hospitalCode: "H-002" };
const row: WorkforceListRow = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: "user",
  displayName: "บุคลากรทดสอบ",
  kind: "HOSPITAL_MEMBER",
  membershipType: MembershipType.MEMBER,
  profession: Profession.NURSE,
  relationshipStatus: MembershipStatus.ACTIVE,
  accountStatus: UserStatus.ACTIVE,
  activationRequired: false,
  activationStatus: null,
  activationExpiresAt: null,
  activationMode: null,
};

function render(rows: WorkforceListRow[] = [row], tab: "staff" | "osm" | "pending" = "staff", pageInfo?: Partial<WorkforceListResult["pageInfo"]>): string {
  const workforce: WorkforceListResult = {
    hospital: second,
    viewerScope: "OWNER",
    rows,
    pendingCount: 3,
    pageInfo: {
      pageSize: 25,
      serverTime: 1791849600000,
      search: "สม",
      status: "PROVISIONED",
      staffCursor: "staff-cursor",
      osmCursor: "osm-cursor",
      staffNextCursor: "staff-next",
      osmNextCursor: null,
      ...pageInfo,
    },
  };
  return renderToStaticMarkup(
    <WorkforceWorkspace hospitals={[hospital, second]} selectedHospitalId={second.id} tab={tab} workforce={workforce} />,
  );
}

describe("OWNER workforce roster", () => {
  it("keeps the OWNER hospital selector, roster, add action and import action in scope", () => {
    const html = render();
    expect(html).toContain("โรงพยาบาลที่จัดการ");
    expect(html).toContain(`value="${second.id}" selected=""`);
    expect(html).toContain("รายชื่อและการดำเนินการเป็นของ โรงพยาบาล ข เท่านั้น");
    expect(html).toContain(`href="/app/workforce/new?hospitalId=${second.id}&amp;step=1"`);
    expect(html).toContain(`href="/app/workforce/import?hospitalId=${second.id}&amp;search=%E0%B8%AA%E0%B8%A1&amp;status=PROVISIONED&amp;staffCursor=staff-cursor&amp;osmCursor=osm-cursor"`);
    expect(html).toContain(`href="/app/workforce/staff/${row.id}"`);
  });

  it("renders all three URL-backed tabs and retains the existing search, status and cursors", () => {
    const html = render();
    expect(html).toContain("บุคลากร");
    expect(html).toContain("อสม.");
    expect(html).toContain("รอเปิดใช้งาน (3)");
    expect(html).toContain(`href="/app/workforce?hospitalId=${second.id}&amp;tab=osm&amp;search=%E0%B8%AA%E0%B8%A1&amp;status=PROVISIONED&amp;staffCursor=staff-cursor&amp;osmCursor=osm-cursor"`);
    expect(html).toMatch(/name="tab" value="staff"/u);
    expect(html).toContain('name="search"');
    expect(html).toContain('name="status"');
  });

  it("shows pending people in their tab and sends issuance to person detail", () => {
    const pending: WorkforceListRow = {
      ...row,
      id: "pending-relationship",
      userId: "pending-user",
      displayName: "รอเปิดใช้งาน",
      relationshipStatus: MembershipStatus.PROVISIONED,
      accountStatus: UserStatus.PROVISIONED,
      activationRequired: true,
      activationStatus: "PENDING",
    };
    const html = render([pending], "pending");
    expect(html).toContain("รอเปิดใช้งาน");
    expect(html).toContain('href="/app/workforce/staff/pending-relationship"');
    expect(html).not.toContain("ออกลิงก์ใหม่</button>");
    expect(html).not.toContain("สมาชิกโรงพยาบาล");
  });

  it("shows the empty roster state without MEMBER-only workspace copy", () => {
    const html = render([], "osm", { staffCursor: null, osmCursor: null, staffNextCursor: null, osmNextCursor: null });
    expect(html).toContain("ไม่พบรายการในหน้านี้หรือไม่ตรงกับการค้นหา");
    expect(html).toContain("เพิ่มบุคลากร / อสม.");
    expect(html).not.toContain("มุมมองสำหรับสมาชิกโรงพยาบาล");
    expect(html).not.toContain("สมาชิกโรงพยาบาล</span>");
  });
});
