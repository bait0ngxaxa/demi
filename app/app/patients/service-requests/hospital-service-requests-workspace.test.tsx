import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientServiceMutationActionState } from "@/modules/patient-service-requests/transport/action-state";
import type { HospitalPatientServiceRequestPage, HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

const hooks = vi.hoisted(() => ({ state: { status: "IDLE" } as PatientServiceMutationActionState, pending: false, action: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: () => [hooks.state, hooks.action, hooks.pending],
}));
vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({ reviewPatientServiceRequestAction: vi.fn() }));

import { HospitalPatientServiceRequestsWorkspace } from "./hospital-service-requests-workspace";
import { HospitalPatientServiceRequestReviewControls } from "./hospital-service-request-controls";

const request: HospitalPatientServiceRequestView = {
  requestId: "11111111-1111-4111-8111-111111111111",
  relationshipId: "22222222-2222-4222-8222-222222222222",
  hospitalId: "33333333-3333-4333-8333-333333333333",
  hospitalName: "โรงพยาบาล ก ที่มีชื่อยาวสำหรับทดสอบ",
  hospitalCode: "H-A",
  patientName: "สมใจ ผู้ป่วยชื่อภาษาไทย",
  serviceCode: "SCREENING",
  status: "PENDING",
  preferredOsmName: "สมชาย อสม.",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

function render(requests: readonly HospitalPatientServiceRequestView[], extra: Partial<HospitalPatientServiceRequestPage> = {}): string {
  return renderToStaticMarkup(<HospitalPatientServiceRequestsWorkspace page={{ requests, group: "PENDING", after: undefined, nextCursor: null, ...extra }} />);
}

beforeEach(() => {
  hooks.state = { status: "IDLE" };
  hooks.pending = false;
});

describe("Hospital request review workspace", () => {
  it("prioritizes reviewable navigation and keeps empty groups discoverable without false totals", () => {
    const markup = render([]);
    expect(markup.indexOf('group=PENDING')).toBeLessThan(markup.indexOf('group=APPROVED'));
    expect(markup.indexOf('group=APPROVED')).toBeLessThan(markup.indexOf('group=HISTORY'));
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("ไม่มีคำขอรอตรวจสอบในกลุ่มนี้");
    expect(markup).toContain("รวมคำขอจากทุกโรงพยาบาล");
    expect(markup).toContain("หน้านี้ไม่ได้เลือกกรองโรงพยาบาล");
    expect(markup).not.toContain("พบ 0");
    expect(markup).not.toContain("hospitalId=");
  });

  it.each([
    ["APPROVED", "ไม่มีคำขอที่อยู่ในสถานะอนุมัติแล้ว"],
    ["HISTORY", "ยังไม่มีคำขอที่เริ่มให้บริการ"],
  ] as const)("explains empty %s", (group, copy) => {
    expect(render([], { group })).toContain(copy);
  });

  it.each([
    ["PENDING", ["APPROVE", "REJECT"]],
    ["APPROVED", ["START"]],
    ["STARTED", []],
    ["REJECTED", []],
    ["WITHDRAWN", []],
  ] as const)("exposes exactly the persisted %s actions", (status, actions) => {
    const markup = renderToStaticMarkup(<HospitalPatientServiceRequestReviewControls action={hooks.action} pending={false} requestId={request.requestId} status={status} />);
    const decisions = [...markup.matchAll(/<button\b[^>]*>/g)]
      .filter(([tag]) => tag.includes('name="decision"'))
      .map(([tag]) => tag.match(/value="([A-Z]+)"/)?.[1]);
    expect(decisions).toEqual(actions);
    if (actions.length > 0) {
      expect(markup).toContain(`value="${request.requestId}"`);
      expect(markup).toContain(`aria-describedby="review-help-${request.requestId}"`);
    } else {
      expect(markup).toBe("");
    }
  });

  it("keeps the same Patient distinct across Hospitals and uses exact relationship care links", () => {
    const other = { ...request, requestId: "44444444-4444-4444-8444-444444444444", relationshipId: "55555555-5555-4555-8555-555555555555", hospitalId: "66666666-6666-4666-8666-666666666666", hospitalName: "โรงพยาบาล ข", hospitalCode: "H-B", status: "STARTED" as const };
    const markup = render([{ ...request, status: "STARTED" }, other], { group: "HISTORY" });
    expect(markup).toContain(request.hospitalName);
    expect(markup).toContain(other.hospitalName);
    expect(markup).toContain("H-A");
    expect(markup).toContain("H-B");
    for (const row of [request, other]) {
      expect(markup).toContain(`href="/app/patients/${row.relationshipId}#patient-care"`);
      expect(markup).toContain(`id="service-request-${row.requestId}"`);
      expect(markup).not.toContain(`href="/app/patients/${row.requestId}`);
    }
    expect(markup).not.toContain("/programs/");
    expect(markup).not.toContain("nationalId");
  });

  it.each(["APPROVED", "STARTED"] as const)("keeps %s handoff truthful and preference separate from assignment", (status) => {
    const markup = render([{ ...request, status }], { group: status === "APPROVED" ? "APPROVED" : "HISTORY" });
    expect(markup).toContain("ไม่สร้าง Program การมอบหมาย อสม. แบบประเมิน หรือบันทึกติดตามอัตโนมัติ");
    expect(markup).toContain("ไม่ได้ยืนยันว่าบันทึกการดูแลเกิดจากคำขอนี้");
    expect(markup).toContain("ไม่ใช่ผู้รับผิดชอบที่ได้รับมอบหมายหรือการตอบรับงาน");
    expect(markup).toContain('href="/app/patients/22222222-2222-4222-8222-222222222222#patient-care"');
    if (status === "STARTED") expect(markup).toContain("ไม่ใช่หลักฐานว่าบริการเสร็จสิ้น");
  });

  it.each(["STARTED", "REJECTED", "WITHDRAWN"] as const)("renders %s history read-only", (status) => {
    const markup = render([{ ...request, status }], { group: "HISTORY" });
    expect(markup).toContain("ประวัติคำขอ · อ่านอย่างเดียว");
    expect(markup).not.toContain('name="decision"');
    if (status !== "STARTED") expect(markup).not.toContain("#patient-care");
  });

  it("disables every review button during a mutation without attributing pending to APPROVE", () => {
    hooks.pending = true;
    const markup = render([request, { ...request, requestId: "other" }]);
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("กำลังบันทึกผลการดำเนินการ");
  });

  it("preserves success feedback when readback removes the acted-on card", () => {
    hooks.state = { status: "SUCCESS", message: "อนุมัติคำขอแล้ว" };
    const markup = render([]);
    expect(markup).toContain("อนุมัติคำขอแล้ว");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('name="decision"');
  });

  it("distinguishes conflicts from ordinary errors and renders fresh status without stale actions", () => {
    hooks.state = { status: "ERROR", conflict: true, message: "กรุณาตรวจสอบรายการอีกครั้ง" };
    const conflict = render([]);
    expect(conflict).toContain("สถานะคำขอเปลี่ยนไปแล้ว");
    expect(conflict).toContain("อ่านสถานะล่าสุดจากระบบแล้ว");
    expect(conflict).not.toContain('name="decision"');
    hooks.state = { status: "ERROR", message: "ไม่มีสิทธิ์" };
    const denied = render([request]);
    expect(denied).toContain("บันทึกไม่สำเร็จ");
    expect(denied).toContain('role="alert"');
    expect(denied).not.toContain("อ่านสถานะล่าสุด");
  });

  it("retains group in cursor navigation and offers recovery for an empty later page", () => {
    const after = { createdAt: request.createdAt.toISOString(), requestId: request.requestId };
    const markup = render([], { group: "HISTORY", after, nextCursor: after });
    expect(markup).toContain("ไม่มีคำขอถัดจากตำแหน่งนี้");
    expect(markup).toContain("กลับหน้าแรกของกลุ่ม");
    expect(markup).toContain("group=HISTORY&amp;afterDate=");
    expect(markup).toContain(`afterId=${request.requestId}`);
  });
});
