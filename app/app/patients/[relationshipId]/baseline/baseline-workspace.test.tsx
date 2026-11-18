// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientBaselineProjection } from "@/modules/patient-baseline/services/patient-baseline-query-service";

import { installFormContractEnvironment } from "../../../../../tests/support/form-contract";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  update: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({
  createPatientBaselineAction: mocks.create,
  updatePatientBaselineAction: mocks.update,
}));

import { PatientBaselineWorkspace } from "./baseline-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ก" },
};
const baseline: PatientBaselineProjection = {
  id: "33333333-3333-4333-8333-333333333333",
  patientHospitalRelationshipId: relationshipId,
  recordedOn: new Date("2026-11-01T00:00:00.000Z"),
  recorder: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้บันทึก" },
  measurements: {
    weight: 72.4,
    heightCm: 168,
    waistCircumference: null,
    bloodPressureSystolic: 132,
    bloodPressureDiastolic: 84,
    bloodSugarDtx: 118,
    hba1c: 6.8,
    cvdRiskScore: 12.5,
  },
  adaptation: { summary: null, obstacles: null, opportunities: null },
  confidence: { score: null, improvementPlan: null },
  summary: null,
  recommendations: null,
  createdAt: new Date("2026-11-01T05:00:00.000Z"),
  updatedAt: new Date("2026-11-02T03:04:05.678Z"),
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  installFormContractEnvironment();
  window.scrollTo = () => undefined;
});

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.refresh.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(state: { canEdit: boolean; lockedByProgram: boolean }): Promise<void> {
  await act(async () => {
    root.render(createElement(PatientBaselineWorkspace, { baseline, patient, relationshipId, ...state }));
  });
}

function findButton(text: string, scope: ParentNode = container): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
}

async function click(text: string, scope: ParentNode = container): Promise<void> {
  const target = findButton(text, scope);
  if (!target) throw new Error(`Missing button: ${text}`);
  await act(async () => target.click());
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!element) throw new Error(`Missing field ${name}`);
  return element;
}

async function type(name: string, value: string): Promise<void> {
  const element = field(name);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Baseline page: edit until a Program links the Baseline", () => {
  it("offers the edit action only to an actor who may edit an unlinked Baseline", async () => {
    await render({ canEdit: true, lockedByProgram: false });
    expect(findButton("แก้ไขข้อมูลตั้งต้น")).toBeDefined();
    expect(container.textContent).toContain("แก้ไขได้จนกว่าจะเปิดโปรแกรม");
    expect(container.textContent).not.toContain("เปิดโปรแกรมแล้ว ข้อมูลตั้งต้นแก้ไขไม่ได้");
  });

  it("shows the locked notice instead of the edit action once a Program links the Baseline", async () => {
    await render({ canEdit: false, lockedByProgram: true });
    expect(findButton("แก้ไขข้อมูลตั้งต้น")).toBeUndefined();
    expect(container.textContent).toContain("เปิดโปรแกรมแล้ว ข้อมูลตั้งต้นแก้ไขไม่ได้");
  });

  it("keeps a read-only actor on the view without an edit action", async () => {
    await render({ canEdit: false, lockedByProgram: false });
    expect(findButton("แก้ไขข้อมูลตั้งต้น")).toBeUndefined();
    expect(container.textContent).toContain("ข้อมูลอ้างอิงเริ่มต้น (อ่านอย่างเดียว)");
  });

  it("opens the same form prefilled, with Thai range errors, and cancels back to the view", async () => {
    await render({ canEdit: true, lockedByProgram: false });
    await click("แก้ไขข้อมูลตั้งต้น");

    expect(container.querySelector("h1")?.textContent).toContain("แก้ไขข้อมูลตั้งต้น");
    expect([field("recordedOn").value, field("weight").value, field("waistCircumference").value, field("cvdRiskScore").value])
      .toEqual(["2026-11-01", "72.4", "", "12.5"]);
    expect(field("expectedUpdatedAt").value).toBe("2026-11-02T03:04:05.678Z");

    await type("bloodPressureSystolic", "350");
    await click("ตรวจสอบข้อมูลก่อนบันทึก");
    const systolic = field("bloodPressureSystolic");
    const errorId = systolic.getAttribute("aria-describedby");
    expect(systolic.getAttribute("aria-invalid")).toBe("true");
    expect(errorId ? document.getElementById(errorId)?.textContent : null).toBe("ความดันตัวบนต้องอยู่ระหว่าง 40–300 มม.ปรอท");
    expect(container.querySelector("dialog")).toBeNull();

    await click("ยกเลิกการแก้ไข");
    expect(findButton("แก้ไขข้อมูลตั้งต้น")).toBeDefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves through the update action and returns to the view, refreshing in place", async () => {
    mocks.update.mockResolvedValue({
      status: "SUCCESS",
      result: { patientBaselineId: baseline.id, patientHospitalRelationshipId: relationshipId, recordedOn: "2026-11-01" },
    });
    await render({ canEdit: true, lockedByProgram: false });
    await click("แก้ไขข้อมูลตั้งต้น");
    await type("weight", "71");
    await click("ตรวจสอบข้อมูลก่อนบันทึก");
    await click("ยืนยันบันทึกการแก้ไข", document.body);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(findButton("แก้ไขข้อมูลตั้งต้น")).toBeDefined();
  });
});
