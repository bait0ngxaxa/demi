// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { HospitalPatientServiceRequestPage, HospitalPatientServiceRequestView } from "@/modules/patient-service-requests/services/patient-service-request-service";

const serverActions = vi.hoisted(() => ({
  confirm: vi.fn(),
  reject: vi.fn(),
  // SR-D2: the confirm dialog searches the request's Hospital อสม. on the server; the current one is pinned.
  searchOsm: vi.fn(async () => ({
    status: "OK",
    items: [{ id: "77777777-7777-4777-8777-777777777777", displayName: "สมชาย อสม." }],
    page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false,
  })),
}));

vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({
  confirmPatientServiceRequestAction: serverActions.confirm,
  rejectPatientServiceRequestAction: serverActions.reject,
  searchServiceRequestOsmCandidatesAction: serverActions.searchOsm,
}));

import { HospitalPatientServiceRequestsWorkspace } from "./hospital-service-requests-workspace";

const request: HospitalPatientServiceRequestView = {
  requestId: "11111111-1111-4111-8111-111111111111",
  appointmentId: null,
  relationshipId: "22222222-2222-4222-8222-222222222222",
  hospitalId: "33333333-3333-4333-8333-333333333333",
  hospitalName: "โรงพยาบาล ก",
  hospitalCode: "H-A",
  patientName: "สมใจ ผู้ป่วยชื่อภาษาไทย",
  serviceCode: "SCREENING",
  status: "PENDING",
  preferredOsmName: "สมชาย อสม.",
  preferredOsmUserId: "77777777-7777-4777-8777-777777777777",
  currentOsmUserId: "99999999-9999-4999-8999-999999999999",
  currentOsmName: "สมศรี อสม.",
  preferredOsmEligible: true,
  currentOsmEligible: true,
  preferredDate: "2026-11-02",
  preferredSlot: "AFTERNOON",
  note: "สะดวกหลังบ่ายสอง",
  rejectionReason: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

const nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const page: HospitalPatientServiceRequestPage = {
  requests: [request],
  group: "PENDING",
  after: undefined,
  nextCursor: null,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

function mount(requests: readonly HospitalPatientServiceRequestView[] = [request]): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const currentPage = { ...page, requests };
  act(() => root?.render(createElement(HospitalPatientServiceRequestsWorkspace, {
    page: currentPage,
    submissionNonces: Object.fromEntries(requests.map(({ requestId }) => [requestId, nonce])),
  })));
}

function button(label: string, parent: ParentNode = container ?? document): HTMLButtonElement {
  const found = Array.from(parent.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function typeValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

function getForm(id: string): HTMLFormElement {
  const form = container?.querySelector<HTMLFormElement>(`#${id}`);
  if (!form) throw new Error(`Missing form: ${id}`);
  return form;
}

function submit(form: HTMLFormElement): void {
  act(() => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })));
}

async function settle(): Promise<void> {
  await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  else globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  for (const [prototype, key, descriptor] of [
    [HTMLDialogElement.prototype, "showModal", originalShowModal],
    [HTMLDialogElement.prototype, "close", originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor);
    else Reflect.deleteProperty(prototype, key);
  }
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  serverActions.confirm.mockReset();
  serverActions.reject.mockReset();
});

describe("Hospital service request decision dialogs", () => {
  it("opens confirmation without mutation, shows the bound request context, and cancels without mutation", () => {
    mount();
    const trigger = button("ยืนยันนัด");
    trigger.focus();
    act(() => trigger.click());

    const dialog = container?.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain(request.patientName);
    expect(dialog?.textContent).toContain(request.hospitalName);
    expect(dialog?.textContent).toContain("คัดกรอง");
    expect(dialog?.textContent).toContain("2 พฤศจิกายน 2569 · บ่าย");
    expect(dialog?.textContent).toContain("อสม. ที่ผู้ป่วยต้องการ");
    expect(dialog?.textContent).toContain("อสม. ผู้ดูแลปัจจุบัน");
    expect(serverActions.confirm).not.toHaveBeenCalled();

    act(() => button("ยกเลิก", dialog ?? document).click());

    expect(container?.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(serverActions.confirm).not.toHaveBeenCalled();
  });

  it("submits the exact appointment fields with Bangkok datetime conversion and closes on confirmed success", async () => {
    serverActions.confirm.mockImplementation(async (_previous: unknown, formData: FormData) => ({
      status: "SUCCESS",
      message: "ยืนยันนัดแล้ว",
      appointment: { relationshipId: request.relationshipId, appointmentId: "appointment-1" },
      payload: Object.fromEntries(formData.entries()),
    }));
    mount();
    act(() => button("ยืนยันนัด").click());

    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing confirmation dialog");
    await settle();
    expect(serverActions.searchOsm).toHaveBeenCalledWith(request.requestId, "", 1);
    const osm = dialog.querySelector<HTMLInputElement>('input[name="osmUserId"]');
    const osmRadio = (userId: string | null) =>
      dialog.querySelector<HTMLInputElement>(`input[name="osm-candidate-${request.requestId}"][value="${userId}"]`);
    const dateTime = dialog.querySelector<HTMLInputElement>(`#confirm-at-${request.requestId}`);
    const duration = dialog.querySelector<HTMLInputElement>(`#confirm-duration-${request.requestId}`);
    const location = dialog.querySelector<HTMLInputElement>(`#confirm-location-${request.requestId}`);
    const note = dialog.querySelector<HTMLTextAreaElement>(`#confirm-note-${request.requestId}`);
    if (!osm || !dateTime || !duration || !location || !note) throw new Error("Missing appointment fields");
    expect(osm.value).toBe(request.preferredOsmUserId);
    expect(dateTime.value).toBe("2026-11-02T13:00");
    expect(dateTime.required).toBe(true);
    expect(osmRadio(request.preferredOsmUserId)?.checked).toBe(true);
    expect(dialog.textContent).toContain("ผู้ดูแลปัจจุบัน · สมศรี อสม.");
    expect(duration.value).toBe("30");
    expect(getForm(`confirm-request-${request.requestId}`).checkValidity()).toBe(true);

    act(() => osmRadio(request.currentOsmUserId)?.click());
    expect(osm.value).toBe(request.currentOsmUserId);
    expect(dialog.textContent).not.toContain("อสม. ที่เลือกจะปฏิบัติงานเฉพาะการเยี่ยมครั้งนี้");
    act(() => {
      osmRadio(request.preferredOsmUserId)?.click();
      typeValue(dateTime, "2026-11-03T15:45");
      typeValue(duration, "45");
      typeValue(location, "อาคารชุมชน");
      typeValue(note, "โทรก่อนถึง");
    });
    expect(dialog.textContent).toContain("อสม. ที่เลือกจะปฏิบัติงานเฉพาะการเยี่ยมครั้งนี้");
    expect(dialog.textContent).toContain("ผู้ดูแลปัจจุบัน (สมศรี อสม.) ยังคงเดิม");

    submit(getForm(`confirm-request-${request.requestId}`));
    await settle();

    expect(serverActions.confirm).toHaveBeenCalledOnce();
    const payload = serverActions.confirm.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(payload.entries())).toEqual({
      requestId: request.requestId,
      submissionNonce: nonce,
      scheduledAt: "2026-11-03T15:45:00+07:00",
      osmUserId: request.preferredOsmUserId,
      durationMinutes: "45",
      locationDetail: "อาคารชุมชน",
      note: "โทรก่อนถึง",
    });
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector('[role="status"]')?.textContent).toContain("ยืนยันนัดแล้ว");
    expect(container?.querySelector('a[href*="appointments/appointment-1"]')).not.toBeNull();
    expect(document.activeElement).toBe(container?.querySelector('[aria-live="polite"]'));
  });

  it("requires and clearly identifies a rejection reason the patient will see", async () => {
    serverActions.reject.mockImplementation(async (_previous: unknown, formData: FormData) => ({
      status: "SUCCESS",
      message: "ไม่อนุมัติคำขอแล้ว",
      payload: Object.fromEntries(formData.entries()),
    }));
    mount();
    act(() => button("ไม่อนุมัติคำขอ").click());
    const dialog = container?.querySelector("dialog");
    const form = getForm(`reject-request-${request.requestId}`);
    const reason = form.querySelector<HTMLTextAreaElement>('textarea[name="reason"]');
    if (!dialog || !reason) throw new Error("Missing rejection dialog or reason");
    expect(dialog.textContent).toContain(request.patientName);
    expect(dialog.textContent).toContain(request.hospitalName);
    expect(dialog.textContent).toContain("เหตุผลที่ระบุด้านล่างจะแสดงให้ผู้ป่วยเห็น");
    expect(reason.required).toBe(true);
    expect(form.checkValidity()).toBe(false);
    expect(serverActions.reject).not.toHaveBeenCalled();

    act(() => typeValue(reason, "ไม่สามารถจัดทีมเยี่ยมในช่วงเวลานี้ได้"));
    act(() => button("ยกเลิก", dialog).click());
    expect(container?.querySelector("dialog")).toBeNull();
    expect(serverActions.reject).not.toHaveBeenCalled();

    act(() => button("ไม่อนุมัติคำขอ").click());
    const reopenedForm = getForm(`reject-request-${request.requestId}`);
    const reopenedReason = reopenedForm.querySelector<HTMLTextAreaElement>('textarea[name="reason"]');
    expect(reopenedReason?.value).toBe("ไม่สามารถจัดทีมเยี่ยมในช่วงเวลานี้ได้");
    expect(reopenedForm.checkValidity()).toBe(true);
    submit(reopenedForm);
    await settle();

    expect(serverActions.reject).toHaveBeenCalledOnce();
    const payload = serverActions.reject.mock.calls[0]?.[1] as FormData;
    expect(payload.get("requestId")).toBe(request.requestId);
    expect(payload.get("reason")).toBe("ไม่สามารถจัดทีมเยี่ยมในช่วงเวลานี้ได้");
    expect(container?.querySelector("dialog")).toBeNull();
  });

  it("shares a synchronous lock across cards after dispatch and keeps unknown outcomes recoverable", async () => {
    let rejectRequest: (() => void) | null = null;
    serverActions.confirm.mockImplementation(() => new Promise((_resolve, reject) => { rejectRequest = () => reject(new TypeError("Failed to fetch")); }));
    const otherRequest = { ...request, requestId: "44444444-4444-4444-8444-444444444444", patientName: "ผู้ป่วยอีกคน" };
    mount([request, otherRequest]);
    const firstCard = container?.querySelector(`[aria-labelledby="service-request-${request.requestId}"]`);
    const trigger = button("ยืนยันนัด", firstCard ?? document);
    act(() => trigger.click());
    const form = getForm(`confirm-request-${request.requestId}`);
    act(() => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
    expect(serverActions.confirm).toHaveBeenCalledOnce();
    expect(button("ยืนยันนัด", container ?? document).disabled).toBe(true);
    expect(Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
      .find((candidate) => candidate.textContent?.includes("ยืนยันนัดและสร้างนัดหมาย"))?.disabled).toBe(true);

    await act(async () => {
      rejectRequest?.();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(container?.querySelector("dialog")?.open).toBe(true);
    expect(container?.querySelector("dialog")?.textContent).toContain("ยังยืนยันผลรายการนี้ไม่ได้");
    expect(container?.querySelector<HTMLButtonElement>('dialog button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    expect(button("ยืนยันนัด", container ?? document).disabled).toBe(true);
    expect(serverActions.confirm).toHaveBeenCalledOnce();
  });
});
