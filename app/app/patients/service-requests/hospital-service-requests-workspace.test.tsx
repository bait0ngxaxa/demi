import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientServiceMutationActionState } from "@/modules/patient-service-requests/transport/action-state";
import type { HospitalPatientServiceRequestPage, HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

const hooks = vi.hoisted(() => ({ state: { status: "IDLE" } as PatientServiceMutationActionState, pending: false, action: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: () => [hooks.state, hooks.action, hooks.pending],
}));
vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({
  confirmPatientServiceRequestAction: vi.fn(),
  rejectPatientServiceRequestAction: vi.fn(),
}));

import { HospitalPatientServiceRequestsWorkspace } from "./hospital-service-requests-workspace";
import { HospitalPatientServiceRequestReviewControls } from "./hospital-service-request-controls";

const request: HospitalPatientServiceRequestView = {
  requestId: "11111111-1111-4111-8111-111111111111",
  appointmentId: null,
  relationshipId: "22222222-2222-4222-8222-222222222222",
  hospitalId: "33333333-3333-4333-8333-333333333333",
  hospitalName: "โรงพยาบาล ก ที่มีชื่อยาวสำหรับทดสอบ",
  hospitalCode: "H-A",
  patientName: "สมใจ ผู้ป่วยชื่อภาษาไทย",
  serviceCode: "SCREENING",
  status: "PENDING",
  preferredOsmName: "สมชาย อสม.",
  preferredOsmUserId: "77777777-7777-4777-8777-777777777777",
  currentOsmUserId: "99999999-9999-4999-8999-999999999999",
  currentOsmName: "สมศรี อสม.",
  osmChoices: [
    { userId: "77777777-7777-4777-8777-777777777777", displayName: "สมชาย อสม." },
    { userId: "99999999-9999-4999-8999-999999999999", displayName: "สมศรี อสม." },
  ],
  preferredDate: "2026-11-02",
  preferredSlot: "AFTERNOON",
  note: "สะดวกหลังบ่ายสอง",
  rejectionReason: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};
const nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function render(requests: readonly HospitalPatientServiceRequestView[], extra: Partial<HospitalPatientServiceRequestPage> = {}): string {
  const submissionNonces = Object.fromEntries(requests.map(({ requestId }) => [requestId, nonce]));
  return renderToStaticMarkup(<HospitalPatientServiceRequestsWorkspace page={{ requests, group: "PENDING", after: undefined, nextCursor: null, ...extra }} submissionNonces={submissionNonces} />);
}

function controls(overrides: Partial<HospitalPatientServiceRequestView> = {}): string {
  return renderToStaticMarkup(
    <HospitalPatientServiceRequestReviewControls confirmAction={hooks.action} pending={false} rejectAction={hooks.action} request={{ ...request, ...overrides }} submissionNonce={nonce} />,
  );
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
    ["HISTORY", "ยังไม่มีคำขอที่ยืนยันนัด"],
  ] as const)("explains empty %s", (group, copy) => {
    expect(render([], { group })).toContain(copy);
  });

  it.each([
    ["PENDING", ["ยืนยันนัด", "ไม่อนุมัติคำขอ"]],
    ["APPROVED", ["ยืนยันนัด"]],
    ["STARTED", []],
    ["REJECTED", []],
    ["WITHDRAWN", []],
  ] as const)("exposes exactly the persisted %s actions (ADR-0023)", (status, actions) => {
    const markup = controls({ status });
    const buttons = [...markup.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map(([, label]) => label);
    expect(buttons).toEqual(actions);
    if (actions.length > 0) {
      expect(markup).toContain(`value="${request.requestId}"`);
      expect(markup).toContain(`name="submissionNonce" value="${nonce}"`);
      expect(markup).toContain(`aria-describedby="review-help-${request.requestId}"`);
    } else {
      expect(markup).toBe("");
    }
    expect(markup).not.toContain("confirmReassignment");
  });

  it("prefills the preferred date and slot, preselects the preferred อสม. and requires a rejection reason", () => {
    const markup = controls();
    expect(markup).toContain('value="2026-11-02T13:00"');
    expect(markup).toContain('value="2026-11-02T13:00:00+07:00"');
    expect(markup).toContain('<option value="77777777-7777-4777-8777-777777777777" selected="">สมชาย อสม.</option>');
    expect(markup).toContain("สมศรี อสม. (ผู้ดูแลปัจจุบัน)");
    expect(markup).toContain("เยี่ยมครั้งเดียว");
    expect(markup).toMatch(/<textarea[^>]*name="reason"[^>]*required=""/);
  });

  it("preselects the assigned อสม. when the patient left the choice to the hospital", () => {
    const markup = controls({ preferredOsmUserId: null, preferredOsmName: null });
    expect(markup).toContain('<option value="99999999-9999-4999-8999-999999999999" selected="">สมศรี อสม. (ผู้ดูแลปัจจุบัน)</option>');
    expect(markup).not.toContain("เยี่ยมครั้งเดียว");
  });

  it("keeps the same Patient distinct across Hospitals and links a started request to its exact appointment", () => {
    const other = { ...request, requestId: "44444444-4444-4444-8444-444444444444", relationshipId: "55555555-5555-4555-8555-555555555555", hospitalId: "66666666-6666-4666-8666-666666666666", hospitalName: "โรงพยาบาล ข", hospitalCode: "H-B", status: "STARTED" as const, appointmentId: "88888888-8888-4888-8888-888888888888" };
    const markup = render([{ ...request, status: "STARTED" }, other], { group: "HISTORY" });
    expect(markup).toContain(request.hospitalName);
    expect(markup).toContain(other.hospitalName);
    for (const row of [request, other]) {
      expect(markup).toContain(`id="service-request-${row.requestId}"`);
      expect(markup).not.toContain(`href="/app/patients/${row.requestId}`);
    }
    expect(markup).toContain(`href="/app/patients/${other.relationshipId}/appointments/${other.appointmentId}"`);
    expect(markup).not.toContain("/programs/");
    expect(markup).not.toContain("nationalId");
  });

  it.each(["APPROVED", "STARTED"] as const)("keeps %s handoff truthful and preference separate from assignment", (status) => {
    const markup = render([{ ...request, status }], { group: status === "APPROVED" ? "APPROVED" : "HISTORY" });
    expect(markup).toContain(status === "APPROVED" ? "ยืนยันนัดเพื่อสร้างนัดหมายให้ อสม." : "ยืนยันนัดจากคำขอนี้แล้ว");
    expect(markup).toContain("ไม่ใช่ผู้รับผิดชอบที่ได้รับมอบหมายหรือการตอบรับงาน");
    expect(markup).toContain("2 พฤศจิกายน 2569 · บ่าย");
    expect(markup).toContain("สะดวกหลังบ่ายสอง");
    // ADR-0023: no separate "create appointment from this request" step any more.
    expect(markup).not.toContain("appointments/new?serviceRequestId=");
    if (status === "STARTED") expect(markup).toContain("สถานะไม่ได้ยืนยันว่าบริการเสร็จสิ้น");
  });

  it("shows the rejection reason on a rejected request", () => {
    const markup = render([{ ...request, status: "REJECTED", rejectionReason: "ไม่มี อสม. ว่าง" }], { group: "HISTORY" });
    expect(markup).toContain("เหตุผลที่ไม่อนุมัติ");
    expect(markup).toContain("ไม่มี อสม. ว่าง");
  });

  it.each(["STARTED", "REJECTED", "WITHDRAWN"] as const)("renders %s history read-only", (status) => {
    const markup = render([{ ...request, status }], { group: "HISTORY" });
    expect(markup).toContain("ประวัติคำขอ · อ่านอย่างเดียว");
    expect(markup).not.toContain("<button");
    if (status !== "STARTED") expect(markup).not.toContain("#patient-care");
  });

  it("disables every review control during a mutation", () => {
    hooks.pending = true;
    const markup = render([request, { ...request, requestId: "other" }]);
    // Per card: date, อสม., duration, location, note, confirm button, reason, reject button.
    expect(markup.match(/disabled=""/g)).toHaveLength(16);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("กำลังบันทึกผลการดำเนินการ");
  });

  it("preserves success feedback when readback removes the acted-on card", () => {
    hooks.state = { status: "SUCCESS", message: "อนุมัติคำขอแล้ว" };
    const markup = render([]);
    expect(markup).toContain("อนุมัติคำขอแล้ว");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("<button");
  });

  it("distinguishes conflicts from ordinary errors and renders fresh status without stale actions", () => {
    hooks.state = { status: "ERROR", conflict: true, message: "กรุณาตรวจสอบรายการอีกครั้ง" };
    const conflict = render([]);
    expect(conflict).toContain("สถานะคำขอเปลี่ยนไปแล้ว");
    expect(conflict).toContain("อ่านสถานะล่าสุดจากระบบแล้ว");
    expect(conflict).not.toContain("<button");
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
