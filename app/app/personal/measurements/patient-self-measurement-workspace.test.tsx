// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OwnPatientSelfMeasurement } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";

type ActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string; loginHref?: string };

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
} = {}): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(PatientSelfMeasurementWorkspace, {
    items: options.items ?? [],
    nonce,
    defaultMeasuredAt: "2026-10-16T12:00",
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

describe("PatientSelfMeasurementWorkspace unknown outcome recovery", () => {
  it("starts with an open create form and a useful empty history state", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    expect(disclosure().open).toBe(true);
    expect(query("summary").textContent).toContain("บันทึกค่าใหม่");
    expect(query('[aria-labelledby="measurement-history"]').textContent).toContain("ยังไม่มีรายการที่บันทึกเอง");
    expect(container.querySelector('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"]')).toBeNull();
  });

  it("puts persisted records first and labels only values that were recorded", () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    const history = query('[aria-labelledby="measurement-history"]');
    const details = disclosure();
    expect(history.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("keeps the form mounted and preserves a dirty draft and submission nonce across collapse", async () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    const weight = query<HTMLInputElement>('input[name="weight"]');
    const nonceInput = query<HTMLInputElement>('input[name="submissionNonce"]');
    weight.value = "70.2";
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

    query<HTMLInputElement>('input[name="bloodSugar"]').value = "110";
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());

    expect(records.size).toBe(1);
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]').textContent).toContain("ตรวจสอบผลด้วยคำขอเดิม");
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);

    await act(async () => query<HTMLButtonElement>('[role="alert"] button').click());

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

  it("keeps validation feedback visible and allows another explicit submission", async () => {
    mocks.create.mockResolvedValueOnce({ status: "ERROR", message: "กรุณาตรวจสอบค่าวัด" });
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount({ items: [partialMeasurement] });

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(disclosure().open).toBe(true);
    expect(query('[role="alert"]').textContent).toContain("กรุณาตรวจสอบค่าวัด");
    act(() => query<HTMLElement>("summary").click());
    expect(disclosure().open).toBe(true);
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
  });

  it("keeps confirmed feedback and the form mounted when the authoritative history refreshes", async () => {
    mocks.create.mockResolvedValue({ status: "SUCCESS", message: "บันทึกแล้ว" });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();
    const form = query<HTMLFormElement>("form");
    const details = disclosure();

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    const refreshedNonce = "33333333-3333-4333-8333-333333333333";
    await act(async () => root.render(createElement(PatientSelfMeasurementWorkspace, {
      items: [partialMeasurement],
      nonce: refreshedNonce,
      defaultMeasuredAt: "2026-10-16T13:00",
      nextCursor: null,
      hasCursor: false,
    })));

    expect(query<HTMLFormElement>("form")).toBe(form);
    expect(disclosure()).toBe(details);
    expect(details.open).toBe(true);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    expect(query<HTMLInputElement>('input[name="submissionNonce"]').value).toBe(refreshedNonce);
    expect(container.querySelectorAll('ul[aria-label="ประวัติค่าวัดที่บันทึกเอง"] > li')).toHaveLength(1);
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
      loginHref: "/login",
    });
    mocks.delete.mockResolvedValue({ status: "IDLE" });
    mount();

    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(query('[role="alert"]').textContent).toContain("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(query<HTMLAnchorElement>('[role="alert"] a').getAttribute("href")).toBe("/login");

    mocks.create.mockResolvedValueOnce({
      status: "ERROR",
      message: "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้",
    });
    await act(async () => query<HTMLButtonElement>('button[type="submit"]').click());
    expect(query('[role="alert"]').textContent).toContain("บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้");
    expect(container.querySelector('[role="alert"] a')).toBeNull();
  });
});
