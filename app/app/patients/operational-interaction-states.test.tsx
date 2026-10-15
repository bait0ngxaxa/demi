// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  complete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  noShow: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  profile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
  vitals: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions", () => ({
  savePatientHealthHistoryAction: vi.fn(),
  saveStaffPatientHospitalProfileAction: (_relationshipId: string, ...args: unknown[]) => mocks.profile(...args),
}));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({
  recordPatientProgramRoundReviewAction: vi.fn(),
  recordPatientProgramRoundVitalsAction: mocks.vitals,
}));
vi.mock("@/modules/appointments/transport/server-actions", () => ({
  cancelAppointmentAction: mocks.cancel,
  completeAppointmentAction: mocks.complete,
  markAppointmentNoShowAction: mocks.noShow,
}));

import { HospitalPatientEditForm } from "./[relationshipId]/hospital-patient-edit-form";
import { AppointmentMutationControls } from "./[relationshipId]/appointments/[appointmentId]/appointment-mutation-controls";
import { RoundVitalsForm } from "./[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-vitals-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

function input(name: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

describe("Hospital patient profile edit", () => {
  beforeEach(() => {
    render(
      createElement(HospitalPatientEditForm, {
        health: false,
        relationshipId: "relationship-1",
        values: { phoneNumber: "0800000000" },
        version: 3,
      }),
    );
  });

  it("keeps edited values when the server rejects the save", async () => {
    mocks.profile.mockResolvedValue({ status: "ERROR", message: "ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว" });
    input("phoneNumber").value = "0811111111";
    input("province").value = "เชียงใหม่";

    await click(buttonByText("บันทึกข้อมูล"));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว");
    expect(input("phoneNumber").value).toBe("0811111111");
    expect(input("province").value).toBe("เชียงใหม่");
  });

  it("blocks another save when the save outcome cannot be confirmed", async () => {
    mocks.profile.mockRejectedValue(new TypeError("Failed to fetch"));

    await click(buttonByText("บันทึกข้อมูล"));

    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(buttonByText("บันทึกข้อมูล").disabled).toBe(true);
    expect(input("phoneNumber").disabled).toBe(true);
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });
});

describe("Program round vitals", () => {
  beforeEach(() => {
    render(
      createElement(RoundVitalsForm, {
        heightEditable: true,
        latestHeightCm: null,
        occupation: null,
        patientDisplayName: "สมชาย ใจดี",
        patientHospitalRelationshipId: "relationship-1",
        patientProgramId: "program-1",
        roundNumber: 1,
        submissionNonce: "nonce-1",
        todayServiceDate: "2026-10-15",
      }),
    );
  });

  it("keeps entered measurements after a validation error and clears them after a confirmed save", async () => {
    mocks.vitals.mockResolvedValueOnce({ status: "ERROR", code: "INVALID_INPUT", message: "ค่าความดันไม่ถูกต้อง" });
    input("systolicBloodPressure").value = "120";
    input("bloodSugar").value = "98";

    await click(buttonByText("บันทึกสัญญาณชีพ"));

    expect(container.textContent).toContain("ค่าความดันไม่ถูกต้อง");
    expect(input("systolicBloodPressure").value).toBe("120");
    expect(input("bloodSugar").value).toBe("98");

    mocks.vitals.mockResolvedValueOnce({ status: "SUCCESS" });
    await click(buttonByText("บันทึกสัญญาณชีพ"));

    expect(mocks.vitals.mock.calls[1]?.[1]).toBeInstanceOf(FormData);
    expect((mocks.vitals.mock.calls[1]?.[1] as FormData).get("systolicBloodPressure")).toBe("120");
    expect(input("systolicBloodPressure").value).toBe("");
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

describe("Appointment management controls", () => {
  it("blocks every appointment action after an unconfirmed no-show mark", async () => {
    mocks.noShow.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      createElement(AppointmentMutationControls, {
        appointmentId: "appointment-1",
        canManage: true,
        expectedUpdatedAt: "2026-10-15T00:00:00.000Z",
        relationshipId: "relationship-1",
        status: "SCHEDULED",
      }),
    );

    await click(buttonByText("ทำเครื่องหมายว่าไม่มาตามนัด"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>("form button[type=submit]"))) {
      expect(button.disabled).toBe(true);
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
