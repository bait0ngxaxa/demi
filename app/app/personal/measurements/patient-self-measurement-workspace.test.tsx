// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OwnPatientSelfMeasurement } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";

type ActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string; recovery: "RECOVERABLE" | "CRITICAL"; loginHref?: string };

const mocks = vi.hoisted(() => ({
  create: vi.fn<(previous: ActionState, formData: FormData) => Promise<ActionState>>(),
  delete: vi.fn<(previous: ActionState, formData: FormData) => Promise<ActionState>>(),
}));

vi.mock("@/modules/patient-self-measurements/transport/server-actions", () => ({
  createOwnPatientSelfMeasurementAction: mocks.create,
  deleteOwnPatientSelfMeasurementAction: mocks.delete,
}));

import { PatientSelfMeasurementWorkspace } from "./patient-self-measurement-workspace";

let container: HTMLDivElement;
let root: Root;
const nonce = "11111111-1111-4111-8111-111111111111";
const measuredAt = new Date("2026-10-16T12:30:00.000Z");
const partialMeasurement: OwnPatientSelfMeasurement = {
  measurementId: "22222222-2222-4222-8222-222222222222",
  measuredAt,
  createdAt: measuredAt,
  weight: 67.5,
  bloodSugar: null,
  systolicBloodPressure: 121,
  diastolicBloodPressure: null,
  note: "วัดหลังพัก 5 นาที",
  canDelete: false,
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function mount(options: {
  items?: readonly OwnPatientSelfMeasurement[];
  nextCursor?: string | null;
  hasCursor?: boolean;
  nonce?: string;
} = {}): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(PatientSelfMeasurementWorkspace, {
    items: options.items ?? [],
    nonce: options.nonce ?? nonce,
    defaultMeasuredAt: "2026-10-16T12:00",
    nextCursor: options.nextCursor ?? null,
    hasCursor: options.hasCursor ?? false,
  })));
}

function rerender(options: {
  items?: readonly OwnPatientSelfMeasurement[];
  nextCursor?: string | null;
  hasCursor?: boolean;
  nonce?: string;
} = {}): void {
  act(() => root.render(createElement(PatientSelfMeasurementWorkspace, {
    items: options.items ?? [],
    nonce: options.nonce ?? nonce,
    defaultMeasuredAt: "2026-10-16T13:00",
    nextCursor: options.nextCursor ?? null,
    hasCursor: options.hasCursor ?? false,
  })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function disclosure(): HTMLDetailsElement {
  return query<HTMLDetailsElement>("details");
}

function setValue(name: string, value: string): void {
  const control = query<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error(`Missing value setter for ${name}`);
  act(() => {
    setter.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("PatientSelfMeasurementWorkspace unknown outcome recovery", () => {
  it("starts with an open create form and a useful empty history state", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    expect(disclosure().open).toBe(true);
    expect(query("summary").textContent).toContain("บันทึกค่าใหม่");
    expect(query('[aria-labelledby="measurement-history"]').textContent).toContain("ยังไม่มีรายการที่บันทึกเอง");
    expect(query('[aria-labelledby="measurement-history"]').textContent).toContain("จากส่วนด้านบน");
    expect(container.querySelector('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"]')).toBeNull();
  });

  it("places the collapsed creation disclosure before persisted history and labels only recorded values", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    const history = query('[aria-labelledby="measurement-history"]');
    const details = disclosure();
    expect(details.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.open).toBe(false);
    const record = query<HTMLLIElement>('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"] > li');
    expect(record.querySelector("h3")?.textContent).toContain("วัดเมื่อ");
    expect(record.querySelector("time")?.dateTime).toBe(measuredAt.toISOString());
    expect(record.textContent).toContain("ผู้ป่วยบันทึกเอง");
    expect([...record.querySelectorAll("dt")].map((label) => label.textContent)).toEqual(["น้ำหนัก", "ความดันตัวบน"]);
    expect(record.textContent).toContain("67.5 กก.");
    expect(record.textContent).toContain("121 mmHg");
    expect(record.textContent).toContain("วัดหลังพัก 5 นาที");
    expect(record.textContent).not.toContain("ความดันตัวล่าง");
    expect(record.textContent).not.toContain("mg/dL");
    expect(record.textContent).not.toContain("-");
    expect(record.querySelector("form, button")).toBeNull();
  });

  it("keeps the create action immediately below the header with 50 saved records", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    const items = Array.from({ length: 50 }, (_, index) => ({
      ...partialMeasurement,
      measurementId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    mount({ items });

    const workspace = container.firstElementChild;
    const header = query("header");
    const details = disclosure();
    const creation = details.parentElement;
    const history = query('[aria-labelledby="measurement-history"]');
    expect(workspace?.children[0]).toBe(header);
    expect(workspace?.children[1]).toBe(creation);
    expect(workspace?.children[2]).toBe(history);
    expect(details.open).toBe(false);
    expect(container.querySelectorAll('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"] > li')).toHaveLength(50);

    const summary = query<HTMLElement>("summary");
    summary.focus();
    expect(document.activeElement).toBe(summary);
    act(() => summary.click());
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(summary);
  });

  it("keeps the form mounted and preserves a dirty draft and submission nonce across collapse", async () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    const weight = query<HTMLInputElement>('input[name="weight"]');
    const nonceInput = query<HTMLInputElement>('input[name="submissionNonce"]');
    setValue("weight", "70.2");
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(false);
    expect(query<HTMLInputElement>('input[name="weight"]')).toBe(weight);
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("70.2");
    expect(query<HTMLInputElement>('input[name="submissionNonce"]')).toBe(nonceInput);
    expect(nonceInput.value).toBe(nonce);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not allow a pending submission to be hidden", async () => {
    let resolve: (state: ActionState) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(disclosure().open).toBe(true);
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);
    expect(query<HTMLButtonElement>('button[type="submit"]').textContent).toContain("กำลังบันทึก");

    await act(async () => resolve({ status: "SUCCESS", message: "บันทึกแล้ว" }));
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(false);
  });

  it("resends the committed request with its original nonce after the response is lost", async () => {
    const records = new Map<string, string>();
    let loseResponse = true;
    mocks.create.mockImplementation(async (_previous, formData) => {
      const nonce = formData.get("submissionNonce");
      const bloodSugar = formData.get("bloodSugar");
      if (typeof nonce !== "string" || typeof bloodSugar !== "string") {
        throw new Error("Expected the original measurement form payload");
      }
      records.set(nonce, bloodSugar);

      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Failed to fetch");
      }

      return { status: "SUCCESS", message: "บันทึกแล้ว" };
    });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    setValue("bloodSugar", "110");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());

    expect(records.size).toBe(1);
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]').textContent).toContain("ตรวจสอบผลด้วยคำขอเดิม");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);

    await act(async () => query<HTMLButtonElement>('[role="alert"] button').click());

    expect(mocks.create).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.create.mock.calls[0]?.[1];
    const resentPayload = mocks.create.mock.calls[1]?.[1];
    expect(firstPayload).toBeDefined();
    expect(resentPayload?.get("submissionNonce")).toBe(firstPayload?.get("submissionNonce"));
    expect(resentPayload?.get("bloodSugar")).toBe("110");
    expect(records.size).toBe(1);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"]')).toBeNull();
  });

  it("allows a validation error to collapse and reopen with the same draft and feedback", async () => {
    mocks.create.mockResolvedValueOnce({ status: "ERROR", message: "กรุณาตรวจสอบค่าวัด", recovery: "RECOVERABLE" });
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });
    const form = query<HTMLFormElement>("form");
    setValue("weight", "70");

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]').textContent).toContain("กรุณาตรวจสอบค่าวัด");
    const error = query('[role="alert"]');
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(false);
    expect(query<HTMLFormElement>("form")).toBe(form);
    expect(container.querySelector('[role="alert"]')).toBe(error);
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]')).toBe(error);
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("70");

    setValue("weight", "71");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("preserves the second draft and hides the previous success while the next request is pending", async () => {
    let resolveSecond: (state: ActionState) => void = () => undefined;
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกครั้งแรกแล้ว" });
    mocks.create.mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    setValue("weight", "70");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(query('[role="status"]').textContent).toContain("บันทึกครั้งแรกแล้ว");

    const refreshedNonce = "33333333-3333-4333-8333-333333333333";
    rerender({ items: [partialMeasurement], nonce: refreshedNonce });
    setValue("weight", "71");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("71");
    expect(disclosure().open).toBe(true);
    expect(query<HTMLButtonElement>('button[type="submit"]').textContent).toContain("กำลังบันทึก");

    const duplicateSubmit = new Event("submit", { bubbles: true, cancelable: true });
    act(() => query<HTMLFormElement>("form").dispatchEvent(duplicateSubmit));
    expect(duplicateSubmit.defaultPrevented).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);

    await act(async () => resolveSecond({ status: "ERROR", message: "กรุณาตรวจสอบค่าวัด", recovery: "RECOVERABLE" }));
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("71");
    expect(query('[role="alert"]').textContent).toContain("กรุณาตรวจสอบค่าวัด");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps a newer draft edited during a pending submission after confirmed success", async () => {
    let resolve: (state: ActionState) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    setValue("weight", "70");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    const weight = query<HTMLInputElement>('input[name="weight"]');
    weight.value = "71";
    await act(async () => resolve({ status: "SUCCESS", message: "บันทึกแล้ว" }));

    expect(weight.value).toBe("71");
  });

  it("resends an unknown second request with its original payload and nonce, without stale success", async () => {
    mocks.create
      .mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกครั้งแรกแล้ว" })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกครั้งที่สองแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    setValue("weight", "70");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    const secondNonce = "33333333-3333-4333-8333-333333333333";
    rerender({ nonce: secondNonce });
    setValue("bloodSugar", "110");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(query('[role="alert"]').textContent).toContain("ตรวจสอบผลด้วยคำขอเดิม");
    const originalPayload = mocks.create.mock.calls[1]?.[1];
    expect(originalPayload?.get("submissionNonce")).toBe(secondNonce);
    expect(originalPayload?.get("weight")).toBe("70");
    expect(originalPayload?.get("bloodSugar")).toBe("110");

    await act(async () => query<HTMLButtonElement>('[role="alert"] button').click());
    expect(mocks.create).toHaveBeenCalledTimes(3);
    const resentPayload = mocks.create.mock.calls[2]?.[1];
    expect(resentPayload?.get("submissionNonce")).toBe(originalPayload?.get("submissionNonce"));
    expect(resentPayload?.get("weight")).toBe(originalPayload?.get("weight"));
    expect(resentPayload?.get("bloodSugar")).toBe(originalPayload?.get("bloodSugar"));
    expect(query('[role="status"]').textContent).toContain("บันทึกครั้งที่สองแล้ว");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps the confirmed form mounted and uses the fresh server nonce for a new payload", async () => {
    mocks.create.mockResolvedValue({ status: "SUCCESS", message: "บันทึกแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();
    const form = query<HTMLFormElement>("form");
    const details = disclosure();

    setValue("weight", "70");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("70");
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);

    const refreshedNonce = "33333333-3333-4333-8333-333333333333";
    rerender({ items: [partialMeasurement], nonce: refreshedNonce });

    expect(query<HTMLFormElement>("form")).toBe(form);
    expect(disclosure()).toBe(details);
    expect(details.open).toBe(true);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    expect(query<HTMLInputElement>('input[name="submissionNonce"]').value).toBe(refreshedNonce);
    expect(container.querySelectorAll('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"] > li')).toHaveLength(1);

    const startNewRecord = query<HTMLButtonElement>('button[type="button"]');
    expect(startNewRecord.textContent).toContain("เริ่มบันทึกครั้งใหม่");
    await act(async () => startNewRecord.click());
    expect(query<HTMLFormElement>("form")).toBe(form);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("");

    setValue("weight", "71");
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false);
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0]?.[1].get("submissionNonce")).toBe(nonce);
    expect(mocks.create.mock.calls[1]?.[1].get("submissionNonce")).toBe(refreshedNonce);
    expect(mocks.create.mock.calls[1]?.[1].get("weight")).toBe("71");
  });

  it("blocks an independent create with a consumed nonce until the server supplies a new one", async () => {
    mocks.create.mockResolvedValue({ status: "SUCCESS", message: "บันทึกแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();
    const form = query<HTMLFormElement>("form");

    setValue("weight", "70");
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(query<HTMLInputElement>('input[name="submissionNonce"]').value).toBe(nonce);

    setValue("weight", "71");
    const blockedSubmit = new Event("submit", { bubbles: true, cancelable: true });
    act(() => form.dispatchEvent(blockedSubmit));

    expect(blockedSubmit.defaultPrevented).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(query<HTMLInputElement>('input[name="submissionNonce"]').value).toBe(nonce);
    expect(query<HTMLInputElement>('input[name="weight"]').value).toBe("71");
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    expect(query('[role="status"]').textContent).toContain("รหัสใหม่");
    expect(container.querySelector('button[type="button"]')).toBeNull();
  });

  it("shows the delete action only when allowed", async () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });
    expect(container.querySelector('button[type="submit"][class*="danger"]')).toBeNull();

    await act(async () => root.render(createElement(PatientSelfMeasurementWorkspace, {
      items: [{ ...partialMeasurement, canDelete: true }],
      nonce,
      defaultMeasuredAt: "2026-10-16T12:00",
      nextCursor: null,
      hasCursor: false,
    })));
    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find((button) => button.textContent === "ลบ");
    expect(deleteButton).toBeDefined();
    expect(deleteButton?.closest("form")).not.toBeNull();
  });

  it("preserves cursor navigation links", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement], nextCursor: "older-cursor", hasCursor: true });
    expect(query<HTMLAnchorElement>('a[href="/app/personal/measurements#measurement-history"]').textContent).toContain("กลับไปรายการล่าสุด");
    expect(query<HTMLAnchorElement>('a[href="/app/personal/measurements?cursor=older-cursor#measurement-history"]').textContent).toContain("ดูรายการเก่ากว่า");
  });

  it("renders session expiry with sign-in and keeps forbidden access copy", async () => {
    mocks.create.mockResolvedValueOnce({
      status: "ERROR",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
      recovery: "CRITICAL",
      loginHref: "/login",
    });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]').textContent).toContain("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(query<HTMLAnchorElement>('[role="alert"] a').getAttribute("href")).toBe("/login");
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);

    mocks.create.mockResolvedValueOnce({
      status: "ERROR",
      message: "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้",
      recovery: "CRITICAL",
    });
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(query('[role="alert"]').textContent).toContain("บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้");
    expect(container.querySelector('[role="alert"] a')).toBeNull();
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);
  });
});
