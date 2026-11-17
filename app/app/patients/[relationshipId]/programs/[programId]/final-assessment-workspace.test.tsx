// @vitest-environment jsdom

import { PatientProgramStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PatientFinalAssessmentProjection } from "@/modules/patient-final-assessment/services/patient-final-assessment-query-service";
import type { PatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/patient-final-assessment/transport/server-actions", () => ({
  createPatientFinalAssessmentAction: mocks.create,
}));

import { PatientProgramFinalAssessmentWorkspace } from "./final-assessment-workspace";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const recordedAt = new Date("2026-08-22T05:00:00.000Z");

const detail = {
  programId,
  patientHospitalRelationshipId: relationshipId,
  status: PatientProgramStatus.ACTIVE,
  startedAt: recordedAt,
  completedAt: null,
  createdAt: recordedAt,
  createdBy: { id: "44444444-4444-4444-8444-444444444444", displayName: "ผู้เปิดโปรแกรม" },
  initialBaseline: null,
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
  },
  canManage: true,
  serviceOne: [],
} satisfies PatientProgramDetail;

const projection = {
  patientProgramId: programId,
  patientHospitalRelationshipId: relationshipId,
  programStatus: PatientProgramStatus.ACTIVE,
  finalAssessment: null,
} satisfies PatientFinalAssessmentProjection;

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
  act(() => root.render(createElement(PatientProgramFinalAssessmentWorkspace, {
    detail,
    finalAssessment: projection,
    todayServiceDate: "2026-08-21",
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

describe("Final Assessment form clinical value limits (N3)", () => {
  it("shows a Thai field-level error for an out-of-range value and does not submit", async () => {
    mocks.create.mockResolvedValue({ status: "IDLE" });
    mount();
    setValue("bloodSugar", "1200");

    await submit();

    const bloodSugar = input("bloodSugar");
    const describedBy = bloodSugar.getAttribute("aria-describedby")?.split(" ") ?? [];
    const errorText = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(bloodSugar.min).toBe("10");
    expect(bloodSugar.max).toBe("1000");
    expect(bloodSugar.getAttribute("aria-invalid")).toBe("true");
    expect(errorText).toContain("น้ำตาลในเลือดต้องอยู่ระหว่าง 10–1000 มก./ดล.");
    expect(errorText).toContain("เว้นว่างได้ หากไม่มีค่ารายการนี้");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the CVD risk score on its own 0–100 bounds", () => {
    mount();

    expect(input("cvdRiskScore").min).toBe("0");
    expect(input("cvdRiskScore").max).toBe("100");
  });
});
