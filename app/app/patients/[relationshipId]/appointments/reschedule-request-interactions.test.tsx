// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import type { PatientAppointmentRescheduleRequest } from "@prisma/client";
import type { RescheduleRequestActionState } from "@/modules/appointments/transport/reschedule-request-actions";
import { deferred, findButton, installDialogSupport, restoreDialogSupport, settle } from "../../../workforce/[kind]/[relationshipId]/controls-test-support";

const mocks = vi.hoisted(() => ({
  submit: vi.fn<(state: RescheduleRequestActionState, formData: FormData) => Promise<RescheduleRequestActionState>>(),
  reject: vi.fn<(state: RescheduleRequestActionState, formData: FormData) => Promise<RescheduleRequestActionState>>(),
}));

vi.mock("@/modules/appointments/transport/reschedule-request-actions", () => ({
  submitRescheduleRequestAction: mocks.submit,
  rejectRescheduleRequestAction: mocks.reject,
}));

import { RescheduleRequestForm } from "./reschedule-request-form";
import { RescheduleRequestHistory } from "./reschedule-request-history";
import { RescheduleRequestSection } from "./reschedule-request-section";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const headingId = `reschedule-requests-heading-${appointmentId}`;
const appointmentSummary = "โรงพยาบาล ก · วันพุธที่ 14 ตุลาคม 2569 เวลา 10:00";
const requestContext = {
  requester: "ผู้ป่วย",
  submittedAt: "13 ต.ค. 2569 10:00",
  reason: "ติดธุระส่วนตัว",
  preferredDatetimes: ["14 ต.ค. 2569 10:00", "15 ต.ค. 2569 13:00"],
};
const submittedAt = new Date("2026-10-13T03:00:00.000Z");
const appointmentRequest = (overrides: Partial<PatientAppointmentRescheduleRequest> = {}): PatientAppointmentRescheduleRequest => ({
  id: requestId,
  appointmentId,
  sourceAppointmentUpdatedAt: submittedAt,
  submittedByUserId: "44444444-4444-4444-8444-444444444444",
  source: "PATIENT_SELF",
  submissionNonce: "55555555-5555-4555-8555-555555555555",
  status: "PENDING",
  submittedAt,
  resolvedByUserId: null,
  resolvedAt: null,
  preferredDatetimes: [new Date("2026-10-14T03:00:00.000Z"), new Date("2026-10-15T06:00:00.000Z")],
  reason: "ติดธุระส่วนตัว",
  rejectionReason: null,
  ...overrides,
});
type RescheduleHistory = Awaited<ReturnType<typeof getAppointmentRescheduleHistory>>;

function rescheduleHistory(overrides: Partial<RescheduleHistory> = {}): RescheduleHistory {
  return {
    requests: [],
    canRequest: false,
    canReview: false,
    updatedAt: submittedAt,
    scheduled: true,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogSupport();
});

afterAll(() => restoreDialogSupport());

beforeEach(() => {
  mocks.submit.mockReset().mockResolvedValue({ status: "SUCCESS", message: "ส่งคำขอเลื่อนนัดแล้ว รอเจ้าหน้าที่พิจารณา" });
  mocks.reject.mockReset().mockResolvedValue({ status: "SUCCESS", message: "ปฏิเสธคำขอแล้ว" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<>
    <h2 id={headingId} tabIndex={-1}>คำขอเลื่อนนัด</h2>
    <RescheduleRequestForm
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      expectedUpdatedAt="2026-10-13T03:00:00.000Z"
      nonce="stable-reschedule-nonce"
      relationshipId={relationshipId}
      returnFocusHeadingId={headingId}
    />
  </>));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

function setValue(selector: string, value: string): void {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!field) throw new Error(`Missing field: ${selector}`);
  field.value = value;
}

async function submit(label: string): Promise<void> {
  const button = findButton(container, label);
  const form = button.form;
  if (!form) throw new Error(`Missing form for button: ${label}`);
  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
  });
}

describe("RescheduleRequestForm task dialog", () => {
  it("opens without mutation, focuses the first date, and preserves the draft when cancelled", async () => {
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    const dialog = container.querySelector("dialog");
    const firstDate = dialog?.querySelector<HTMLInputElement>("input[name='preferredDatetimes']");
    if (!dialog || !firstDate) throw new Error("Missing reschedule dialog or first date field");

    expect(dialog.textContent).toContain(appointmentSummary);
    expect(document.activeElement).toBe(firstDate);
    expect(firstDate.required).toBe(true);
    expect(dialog.querySelectorAll("form form")).toHaveLength(0);
    expect(mocks.submit).not.toHaveBeenCalled();

    firstDate.value = "2026-10-20T10:00";
    setValue("textarea[name='reason']", "ต้องไปพบแพทย์");
    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(findButton(container, "ขอเลื่อนนัด"));
    expect(mocks.submit).not.toHaveBeenCalled();

    act(() => findButton(container, "ขอเลื่อนนัด").click());
    expect(container.querySelector<HTMLInputElement>("input[name='preferredDatetimes']")?.value).toBe("2026-10-20T10:00");
    expect(container.querySelector<HTMLTextAreaElement>("textarea[name='reason']")?.value).toBe("ต้องไปพบแพทย์");
  });

  it.each([
    ["validation", "กรุณาเลือกวันเวลาในอนาคตไม่เกิน 366 วัน พร้อมเหตุผลไม่เกิน 500 ตัวอักษร"],
    ["conflict", "นัดหมายเปลี่ยนแปลงหรือมีคำขอค้างอยู่แล้ว กรุณาโหลดหน้าใหม่"],
    ["forbidden", "ดำเนินการไม่ได้ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง"],
  ])("keeps %s feedback and the typed payload in the dialog after a confirmed error", async (_category, message) => {
    mocks.submit.mockResolvedValueOnce({ status: "ERROR", message });
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    setValue("input[name='preferredDatetimes']", "2026-10-20T10:00");
    setValue("textarea[name='reason']", "ต้องไปพบแพทย์");

    await submit("ส่งคำขอเลื่อนนัด");

    expect(container.querySelector("dialog")).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(container.querySelector<HTMLTextAreaElement>("textarea[name='reason']")?.value).toBe("ต้องไปพบแพทย์");
    const submitted = mocks.submit.mock.calls[0]?.[1];
    expect(submitted?.get("patientHospitalRelationshipId")).toBe(relationshipId);
    expect(submitted?.get("appointmentId")).toBe(appointmentId);
    expect(submitted?.get("expectedUpdatedAt")).toBe("2026-10-13T03:00:00.000Z");
    expect(submitted?.get("submissionNonce")).toBe("stable-reschedule-nonce");
    expect(submitted?.getAll("preferredDatetimes")).toEqual(["2026-10-20T10:00", "", ""]);
    expect(submitted?.get("reason")).toBe("ต้องไปพบแพทย์");

    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing dialog after confirmed error");
    act(() => findButton(dialog, "ยกเลิก").click());
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    expect(container.querySelector<HTMLTextAreaElement>("textarea[name='reason']")?.value).toBe("ต้องไปพบแพทย์");
    expect(container.querySelector("dialog [role='alert']")?.textContent).toContain(message);
  });

  it("blocks a rapid duplicate submit while the first request is pending", async () => {
    const pending = deferred<RescheduleRequestActionState>();
    mocks.submit.mockReturnValueOnce(pending.promise);
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    setValue("input[name='preferredDatetimes']", "2026-10-20T10:00");
    setValue("textarea[name='reason']", "ต้องไปพบแพทย์");
    const button = findButton(container, "ส่งคำขอเลื่อนนัด");
    const form = button.form;
    if (!form) throw new Error("Missing reschedule form");

    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    pending.resolve({ status: "SUCCESS", message: "ส่งคำขอเลื่อนนัดแล้ว รอเจ้าหน้าที่พิจารณา" });
    await settle();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("ส่งคำขอเลื่อนนัดแล้ว");
  });

  it("resends the exact uncertain payload only after the user chooses recovery", async () => {
    mocks.submit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    setValue("input[name='preferredDatetimes']", "2026-10-20T10:00");
    setValue("textarea[name='reason']", "ต้องไปพบแพทย์");

    await submit("ส่งคำขอเลื่อนนัด");

    expect(container.querySelector("dialog")).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(findButton(container, "ยกเลิก").disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);

    await act(async () => {
      const recovery = findButton(container, "ตรวจสอบผลด้วยคำขอเดิม");
      recovery.click();
      recovery.click();
    });
    await settle();

    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[1]?.[1]).toBe(mocks.submit.mock.calls[0]?.[1]);
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("ส่งคำขอเลื่อนนัดแล้ว");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("ขอเลื่อนนัด"))).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('[role="status"]'));
  });

  it("keeps an uncertain rejection tied to the same request and reason during explicit recovery", async () => {
    mocks.reject.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => root.render(<>
      <h2 id={headingId} tabIndex={-1}>คำขอเลื่อนนัด</h2>
      <RescheduleRequestForm
        appointmentId={appointmentId}
        appointmentSummary={appointmentSummary}
        relationshipId={relationshipId}
        requestContext={requestContext}
        requestId={requestId}
        returnFocusHeadingId={headingId}
      />
    </>));
    act(() => findButton(container, "ปฏิเสธคำขอพร้อมเหตุผล").click());
    setValue("textarea[name='rejectionReason']", "ไม่มีเวลาว่างตามที่เสนอ");

    await submit("ยืนยันปฏิเสธคำขอ");
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(mocks.reject).toHaveBeenCalledTimes(1);
    const originalPayload = mocks.reject.mock.calls[0]?.[1];

    await act(async () => findButton(container, "ตรวจสอบผลด้วยคำขอเดิม").click());

    expect(mocks.reject).toHaveBeenCalledTimes(2);
    expect(mocks.reject.mock.calls[1]?.[1]).toBe(originalPayload);
    expect(originalPayload?.get("requestId")).toBe(requestId);
    expect(originalPayload?.get("rejectionReason")).toBe("ไม่มีเวลาว่างตามที่เสนอ");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("ปฏิเสธคำขอแล้ว");
  });

  it("returns focus to the request list when the dialog trigger is removed", async () => {
    act(() => findButton(container, "ขอเลื่อนนัด").click());
    act(() => root.render(<h2 id={headingId} tabIndex={-1}>คำขอเลื่อนนัด</h2>));
    await settle();
    expect(document.activeElement).toBe(container.querySelector(`#${headingId}`));
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("shows the selected request context and requires a reason before rejection", async () => {
    act(() => root.render(<>
      <h2 id={headingId} tabIndex={-1}>คำขอเลื่อนนัด</h2>
      <RescheduleRequestForm
        appointmentId={appointmentId}
        appointmentSummary={appointmentSummary}
        relationshipId={relationshipId}
        requestContext={requestContext}
        requestId={requestId}
        returnFocusHeadingId={headingId}
      />
    </>));
    act(() => findButton(container, "ปฏิเสธคำขอพร้อมเหตุผล").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing rejection dialog");
    expect(document.activeElement).toBe(findButton(dialog, "ยกเลิก"));
    expect(dialog.textContent).toContain(appointmentSummary);
    expect(dialog.textContent).toContain("ติดธุระส่วนตัว");
    expect(dialog.textContent).toContain("14 ต.ค. 2569 10:00");
    expect(dialog.textContent).toContain("คำขอเดิมจะไม่กลับเป็นสถานะรอพิจารณา");
    expect(dialog.querySelector<HTMLInputElement>("input[name='requestId']")?.value).toBe(requestId);
    expect(dialog.querySelector<HTMLTextAreaElement>("textarea[name='rejectionReason']")?.required).toBe(true);
    expect(mocks.reject).not.toHaveBeenCalled();

    setValue("textarea[name='rejectionReason']", "ไม่มีเวลาว่างตามที่เสนอ");
    await submit("ยืนยันปฏิเสธคำขอ");

    expect(mocks.reject).toHaveBeenCalledTimes(1);
    expect(mocks.reject.mock.calls[0]?.[1].get("patientHospitalRelationshipId")).toBe(relationshipId);
    expect(mocks.reject.mock.calls[0]?.[1].get("appointmentId")).toBe(appointmentId);
    expect(mocks.reject.mock.calls[0]?.[1].get("requestId")).toBe(requestId);
    expect(mocks.reject.mock.calls[0]?.[1].get("rejectionReason")).toBe("ไม่มีเวลาว่างตามที่เสนอ");
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("ปฏิเสธคำขอแล้ว");
    await settle();
    expect(document.activeElement).toBe(container.querySelector('[role="status"]'));
  });
});

describe("reschedule request readback", () => {
  it("shows empty history and keeps every saved status, source, date, and long request detail read-only", () => {
    const empty = renderToStaticMarkup(<RescheduleRequestHistory requests={[]} />);
    expect(empty).toContain("ยังไม่มีคำขอเลื่อนนัด");
    expect(empty).not.toMatch(/<form|<button|<a\b/);

    const longReason = "ต้องเลื่อนนัดเนื่องจากติดภารกิจส่วนตัว ".repeat(24);
    const longRejection = "ไม่มีช่วงเวลาที่โรงพยาบาลจัดได้ในคำขอนี้ ".repeat(24);
    const requests = [
      appointmentRequest({ status: "PENDING", source: "PATIENT_SELF", reason: longReason }),
      appointmentRequest({ id: "approved-request", status: "APPROVED", source: "OSM_PROXY", resolvedAt: submittedAt, rejectionReason: null }),
      appointmentRequest({ id: "rejected-request", status: "REJECTED", resolvedAt: submittedAt, rejectionReason: longRejection }),
      appointmentRequest({ id: "superseded-request", status: "SUPERSEDED", resolvedAt: submittedAt }),
    ];
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<RescheduleRequestHistory requests={requests} />);

    for (const label of ["รอพิจารณา", "อนุมัติและแก้นัดแล้ว", "ปฏิเสธ", "นัดหมายเปลี่ยนแปลงแล้ว", "ผู้ป่วย", "อสม. แทนผู้ป่วย", "เหตุผลที่ขอเลื่อนนัด", "วันและเวลาที่เสนอ", "เหตุผลที่ปฏิเสธ"]) {
      expect(host.textContent).toContain(label);
    }
    expect(host.querySelectorAll("section > ul > li")).toHaveLength(4);
    expect(host.querySelectorAll('p time[datetime="2026-10-13T03:00:00.000Z"]')).toHaveLength(4);
    expect(host.textContent).toContain(longReason);
    expect(host.textContent).toContain(longRejection);
    expect(host.querySelector('time[datetime="2026-10-14T03:00:00.000Z"]')).not.toBeNull();
    expect(host.querySelector('time[datetime="2026-10-15T06:00:00.000Z"]')).not.toBeNull();
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(host.querySelectorAll("form, button, a")).toHaveLength(0);
  });

  it("shows review controls only for a scheduled pending request and keeps its new-request surface separate", () => {
    const pending = appointmentRequest();
    const unauthorized = renderToStaticMarkup(<RescheduleRequestSection
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      history={rescheduleHistory({ requests: [pending], canRequest: true })}
      relationshipId={relationshipId}
    />);
    expect(unauthorized).not.toContain("อนุมัติโดยแก้ไขวันเวลานัดหมาย");
    expect(unauthorized).not.toContain("ปฏิเสธคำขอพร้อมเหตุผล");
    expect(unauthorized).not.toContain("ส่งคำขอเลื่อนนัดใหม่");
    expect(unauthorized).not.toContain("ขอเลื่อนนัด</button>");

    const authorizedHost = document.createElement("div");
    authorizedHost.innerHTML = renderToStaticMarkup(<RescheduleRequestSection
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      history={rescheduleHistory({ requests: [pending], canRequest: true, canReview: true })}
      relationshipId={relationshipId}
    />);
    expect(authorizedHost.querySelector(`a[href="/app/patients/${relationshipId}/appointments/${appointmentId}/edit?requestId=${requestId}"]`)).not.toBeNull();
    expect(authorizedHost.textContent).toContain("ปฏิเสธคำขอพร้อมเหตุผล");
    expect(authorizedHost.textContent).not.toContain("ส่งคำขอเลื่อนนัดใหม่");
    expect(authorizedHost.querySelectorAll('button[type="button"]')).toHaveLength(1);
    expect(authorizedHost.querySelectorAll('button[type="button"]')[0]?.textContent).toBe("ปฏิเสธคำขอพร้อมเหตุผล");

    const endedAppointment = renderToStaticMarkup(<RescheduleRequestSection
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      history={rescheduleHistory({ requests: [pending], canReview: true, scheduled: false })}
      relationshipId={relationshipId}
    />);
    expect(endedAppointment).not.toContain("อนุมัติโดยแก้ไขวันเวลานัดหมาย");
    expect(endedAppointment).not.toContain("ปฏิเสธคำขอพร้อมเหตุผล");
  });

  it("renders one separate new-request entry when no request is pending", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<RescheduleRequestSection
      appointmentId={appointmentId}
      appointmentSummary={appointmentSummary}
      history={rescheduleHistory({
        requests: [appointmentRequest({ status: "APPROVED", resolvedAt: submittedAt })],
        canRequest: true,
      })}
      relationshipId={relationshipId}
    />);

    expect(host.querySelector("#reschedule-requests-heading-22222222-2222-4222-8222-222222222222-new")).not.toBeNull();
    expect(host.querySelectorAll('button[type="button"]')).toHaveLength(1);
    expect(host.querySelector('button[type="button"]')?.textContent).toBe("ขอเลื่อนนัด");
    expect(host.querySelectorAll('a[href*="requestId="]')).toHaveLength(0);
    expect(host.textContent).not.toContain("ปฏิเสธคำขอพร้อมเหตุผล");
  });
});
