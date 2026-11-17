// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  recordPatientProgramRoundVitalsAction: mocks.record,
}));

import { RoundVitalsForm } from "./round-vitals-form";

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
  act(() => root.render(createElement(RoundVitalsForm, {
    heightEditable: true,
    latestHeightCm: null,
    nextHref: "/next",
    occupation: "ค้าขาย",
    patientDisplayName: "สมชาย ผู้ป่วย",
    patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111",
    patientProgramId: "22222222-2222-4222-8222-222222222222",
    profile: null,
    roundNumber: 2,
    submissionNonce: "33333333-3333-4333-8333-333333333333",
    todayServiceDate: "2026-10-14",
  })));
}

function input(name: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!element) throw new Error(`Missing input ${name}`);
  return element;
}

function setValue(name: string, value: string): void {
  const element = input(name);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
  await act(async () => button?.click());
}

describe("Round vitals form clinical value limits (N3)", () => {
  it("shows a Thai field-level error for an out-of-range value and does not submit", async () => {
    mocks.record.mockResolvedValue({ status: "IDLE" });
    mount();
    setValue("diastolicBloodPressure", "250");

    await submit();

    const diastolic = input("diastolicBloodPressure");
    const errorId = diastolic.getAttribute("aria-describedby");
    expect(diastolic.min).toBe("20");
    expect(diastolic.max).toBe("200");
    expect(diastolic.getAttribute("aria-invalid")).toBe("true");
    expect(errorId ? document.getElementById(errorId)?.textContent : null).toBe(
      "ความดันตัวล่างต้องอยู่ระหว่าง 20–200 มม.ปรอท",
    );
    expect(document.activeElement).toBe(diastolic);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("bounds every vitals input by the shared clinical limits", () => {
    mount();

    expect([input("weight").min, input("weight").max]).toEqual(["1", "500"]);
    expect([input("heightCm").min, input("heightCm").max]).toEqual(["30", "250"]);
    expect([input("waistCircumference").min, input("waistCircumference").max]).toEqual(["20", "300"]);
    expect([input("systolicBloodPressure").min, input("systolicBloodPressure").max]).toEqual(["40", "300"]);
    expect([input("bloodSugar").min, input("bloodSugar").max]).toEqual(["10", "1000"]);
  });
});
