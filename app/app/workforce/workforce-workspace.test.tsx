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
  regenerateWorkforceActivationAction: vi.fn(), startAssistedWorkforceActivationAction: vi.fn(),
}));

import { WorkforceWorkspace } from "./workforce-workspace";

const hospital = { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาล ก", hospitalCode: "H-001" };
const second = { ...hospital, id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ข", hospitalCode: "H-002" };
const row: WorkforceListRow = {
  id: "33333333-3333-4333-8333-333333333333", userId: "user", displayName: "บุคลากรทดสอบ",
  kind: "HOSPITAL_MEMBER", membershipType: MembershipType.MEMBER, profession: Profession.NURSE,
  relationshipStatus: MembershipStatus.ACTIVE, accountStatus: UserStatus.ACTIVE,
  activationRequired: false, activationExpiresAt: null, activationMode: null,
};
function render(rows: WorkforceListRow[] = [row]): string {
  return renderToStaticMarkup(<WorkforceWorkspace hospitals={[hospital, second]} selectedHospitalId={second.id} workforce={{ hospital: second, rows }} />);
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
    expect(html.match(new RegExp(`name="targetHospitalId"[^>]*value="${second.id}"`, "g"))).toHaveLength(2);
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
    const html = render([{ ...row, relationshipStatus: MembershipStatus.SUSPENDED }, { ...row, id: "osm-relationship", kind: "OSM", membershipType: null, profession: null, relationshipStatus: MembershipStatus.PROVISIONED, accountStatus: UserStatus.PROVISIONED, activationRequired: true }]);
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
    expect(buttons).toHaveLength(2);
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
});
