// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function mount(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(PatientSelfMeasurementWorkspace, {
    items: [],
    nonce: "11111111-1111-4111-8111-111111111111",
    defaultMeasuredAt: "2026-10-16T12:00",
    nextCursor: null,
    hasCursor: false,
  })));
}

function query<T extends Element>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

describe("PatientSelfMeasurementWorkspace unknown outcome recovery", () => {
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
    expect(query('[role="alert"]').textContent).toContain("ตรวจสอบผลด้วยคำขอเดิม");

    await act(async () => query<HTMLButtonElement>('[role="alert"] button').click());

    const firstPayload = mocks.create.mock.calls[0]?.[1];
    const resentPayload = mocks.create.mock.calls[1]?.[1];
    expect(firstPayload).toBeDefined();
    expect(resentPayload?.get("submissionNonce")).toBe(firstPayload?.get("submissionNonce"));
    expect(resentPayload?.get("bloodSugar")).toBe("110");
    expect(records.size).toBe(1);
    expect(query('[role="status"]').textContent).toContain("บันทึกแล้ว");
    expect(container.querySelector('[role="alert"]')).toBeNull();
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
