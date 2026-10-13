import { MembershipStatus, MembershipType, Profession, UserStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import type { WorkforceProvisionActionState } from "@/modules/workforce/transport/action-state";

const hooks = vi.hoisted(() => ({ actionState: vi.fn() }));
vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), useActionState: hooks.actionState }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: vi.fn(), provisionOsmAction: vi.fn(),
  provisionWorkforceBulkAction: vi.fn(),
  regenerateWorkforceActivationAction: vi.fn(), startAssistedWorkforceActivationAction: vi.fn(),
}));

import { WorkforceWorkspace } from "./workforce-workspace";

const hospital = { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาล ก", hospitalCode: "H-001", scope: "OWNER" as const };
const second = { ...hospital, id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ข", hospitalCode: "H-002" };
const row: WorkforceListRow = {
  id: "33333333-3333-4333-8333-333333333333", userId: "user", displayName: "บุคลากรทดสอบ",
  kind: "HOSPITAL_MEMBER", membershipType: MembershipType.MEMBER, profession: Profession.NURSE,
  relationshipStatus: MembershipStatus.ACTIVE, accountStatus: UserStatus.ACTIVE,
  activationRequired: false, activationStatus: null, activationExpiresAt: null, activationMode: null,
};
function render(rows: WorkforceListRow[] = [row], viewerScope: "OWNER" | "MEMBER" = "OWNER"): string {
  return renderToStaticMarkup(<WorkforceWorkspace hospitals={[hospital, { ...second, scope: viewerScope }]} selectedHospitalId={second.id} workforce={{ hospital: second, viewerScope, rows }} />);
}

describe("Hospital workforce operational continuity", () => {
  beforeEach(() => hooks.actionState.mockReset().mockReturnValue([{ status: "IDLE" }, vi.fn(), false]));

  it("puts the current roster before provisioning and keeps exact Hospital context", () => {
    const html = render();
    expect(html.indexOf(row.displayName)).toBeLessThan(html.indexOf("เพิ่มบุคลากรโรงพยาบาล</h2>"));
    expect(html).toContain(`href="/app#hospital-workspace-${second.id}"`);
    expect(html).toContain(`value="${second.id}" selected=""`);
    expect(html).toContain("โรงพยาบาล ข · H-002 เท่านั้น");
    expect(html).toContain("ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ");
    expect(html).toContain("วิชาชีพไม่ให้สิทธิ์เจ้าของโรงพยาบาล");
    expect(html).toContain(`href="/app/workforce/staff/${row.id}"`);
    expect(html).not.toContain(`/app/workforce/staff/${row.userId}`);
    expect(html.match(new RegExp(`name="targetHospitalId"[^>]*value="${second.id}"`, "g"))).toHaveLength(3);
    expect(html).not.toMatch(/งานค้าง|ครบกำหนด|ล่าช้า|เปอร์เซ็นต์/);
    expect(html).toContain('href="#workforce-roster"');
    expect(html).toContain('href="#workforce-provision"');
  });

  it("keeps an empty roster separate from the available add operations", () => {
    const html = render([]);
    expect(html.match(/ยังไม่มีรายการในโรงพยาบาลนี้/g)).toHaveLength(2);
    expect(html).toContain("เพิ่มบุคลากร</button>");
    expect(html).toContain("เพิ่ม อสม.</button>");
    expect(html).toContain("ยังไม่มีการกำหนดพื้นที่หรือผู้ป่วย");
  });

  it("preserves activation availability and terminal relationship display", () => {
    const html = render([{ ...row, relationshipStatus: MembershipStatus.SUSPENDED }, { ...row, id: "osm-relationship", kind: "OSM", membershipType: null, profession: null, relationshipStatus: MembershipStatus.PROVISIONED, accountStatus: UserStatus.PROVISIONED, activationRequired: true, activationStatus: "PENDING" }]);
    expect(html).toContain("ถูกระงับ");
    expect(html).toContain("รอเปิดใช้งาน");
    expect(html).toContain('href="/app/workforce/osm/osm-relationship"');
    expect(html).toContain("ออกลิงก์ใหม่");
    expect(html).not.toContain("มอบหมายผู้ป่วย</button>");
  });

  it("keeps sibling submissions disabled during pending work", () => {
    hooks.actionState.mockReturnValue([{ status: "IDLE" }, vi.fn(), true]);
    const html = render();
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
  });

  it("keeps success continuation bound to the persisted result Hospital and relationship", () => {
    const state: WorkforceProvisionActionState = { status: "SUCCESS", result: {
      kind: "HOSPITAL_MEMBER", userId: "new-user", hospitalId: second.id, relationshipId: "persisted-membership",
      accountStatus: "ACTIVE", relationshipStatus: "ACTIVE", activationRequired: false, activationToken: null,
      activationExpiresAt: null, activationMode: null, reusedExistingUser: true, idempotent: false,
    } };
    hooks.actionState.mockReturnValueOnce([state, vi.fn(), false]);
    const html = render();
    expect(html).toContain("เพิ่มสิทธิ์เรียบร้อยแล้ว");
    expect(html).toContain('href="/app/workforce/staff/persisted-membership"');
    expect(html).toContain(`href="/app/patients?hospitalId=${second.id}"`);
    expect(html).not.toContain("สร้างผู้ป่วยแล้ว");
  });

  it("preserves safe conflict feedback without a false success", () => {
    hooks.actionState.mockReturnValueOnce([{ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง" }, vi.fn(), false]);
    const html = render();
    expect(html).toContain("ข้อมูลเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง");
    expect(html).not.toContain("เพิ่มสิทธิ์เรียบร้อยแล้ว");
  });

  it("shows assisted activation failures beside the roster operations", () => {
    hooks.actionState.mockReturnValueOnce([{ status: "IDLE" }, vi.fn(), false])
      .mockReturnValueOnce([{ status: "IDLE" }, vi.fn(), false])
      .mockReturnValueOnce([{ status: "IDLE" }, vi.fn(), false])
      .mockReturnValueOnce([{ status: "ERROR", code: "CONFLICT", message: "ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้" }, vi.fn(), false]);
    const html = render();
    expect(html).toContain("ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้");
    expect(html.indexOf("ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้")).toBeLessThan(html.indexOf(row.displayName));
    expect(html).not.toContain("สร้างบุคลากรแล้ว");
  });

  it("shows a MEMBER only the OSM roster and form, never staff management", () => {
    const osmRow: WorkforceListRow = { ...row, id: "osm-1", userId: "osm-user", kind: "OSM", membershipType: null, profession: null };
    const html = render([osmRow], "MEMBER");
    expect(html).toContain("สมาชิกโรงพยาบาล");
    expect(html).toContain("เพิ่ม อสม.</button>");
    expect(html).not.toContain("เพิ่มบุคลากรโรงพยาบาล</h2>");
    expect(html).not.toContain("เพิ่มบุคลากร</button>");
    expect(html).not.toContain("บุคลากรโรงพยาบาล</h2>");
    expect(html).not.toContain('value="HOSPITAL_MEMBER"');
  });

  it("lists pending people with status, latest expiry and the print action", () => {
    const expiry = new Date("2026-10-20T03:00:00.000Z");
    const pendingOsm: WorkforceListRow = {
      ...row, id: "osm-pending", userId: "pending-user", displayName: "รออสม", kind: "OSM", membershipType: null,
      profession: null, relationshipStatus: MembershipStatus.PROVISIONED, accountStatus: UserStatus.PROVISIONED,
      activationRequired: true, activationStatus: "PENDING", activationExpiresAt: expiry,
    };
    const expiredOsm: WorkforceListRow = { ...pendingOsm, id: "osm-expired", userId: "expired-user", displayName: "หมดอายุอสม", activationStatus: "EXPIRED" };
    const html = render([pendingOsm, expiredOsm]);
    expect(html).toContain('id="workforce-pending"');
    expect(html).toContain("รอเปิดใช้งาน</span>");
    expect(html).toContain("ลิงก์หมดอายุ</span>");
    expect(html).toContain('action="/app/workforce/slips"');
    expect(html).toContain('method="post"');
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*value="pending-user"/);
    expect(html).toMatch(/<input[^>]*form="slip-form-OSM"[^>]*name="userId"/);
    expect(html).toContain("พิมพ์ใบเปิดใช้งาน (0)");
  });

  it("offers the multi-row add with the staff option only for an OWNER", () => {
    expect(render([row], "OWNER")).toContain("เพิ่มหลายคน");
    expect(render([row], "OWNER")).toContain('value="HOSPITAL_MEMBER"');
    expect(render([], "MEMBER")).toContain("เพิ่มหลายคน");
    expect(render([], "MEMBER")).not.toContain('value="HOSPITAL_MEMBER"');
  });
});
