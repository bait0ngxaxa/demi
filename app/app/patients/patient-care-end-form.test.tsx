// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedEndAction, mockedVerifyAction, mockedUseMutationActionState } = vi.hoisted(() => ({
  mockedEndAction: vi.fn(),
  mockedVerifyAction: vi.fn(),
  mockedUseMutationActionState: vi.fn(),
}));

vi.mock("@/components/ui/mutation-action-state", () => ({
  unknownOutcomeMessage: "ระบบยังยืนยันผลการดำเนินการไม่ได้",
  submitPreservingInput: vi.fn(() => vi.fn()),
  useMutationActionState: mockedUseMutationActionState,
}));
vi.mock("@/modules/patient-hospital-relationship/transport/server-actions", () => ({
  endPatientHospitalRelationshipAction: mockedEndAction,
  verifyPatientHospitalRelationshipEndAction: mockedVerifyAction,
}));

import { PatientCareEndForm } from "./patient-care-end-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseMutationActionState.mockReturnValue([
    { status: "IDLE", message: "" },
    vi.fn(),
    false,
    true,
    vi.fn(),
  ]);
  mockedVerifyAction.mockResolvedValue("ENDED");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PatientCareEndForm unknown outcome recovery", () => {
  it("verifies status in place without replaying the mutation or navigating to the ended Patient", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(PatientCareEndForm, {
      relationshipId: "11111111-1111-4111-8111-111111111111",
      hospitalName: "โรงพยาบาลทดสอบ",
    })));

    const verifyButton = [...container.querySelectorAll("button")].find(({ textContent }) => textContent?.includes("ตรวจสอบสถานะการสิ้นสุดการดูแล"));
    expect(verifyButton).toBeDefined();
    expect(container.querySelector("a")).toBeNull();
    if (!verifyButton) return;

    await act(async () => {
      verifyButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockedVerifyAction).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(mockedEndAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว");
  });

  it.each([
    ["ACTIVE", "ขณะตรวจสอบยังพบว่าการดูแลดำเนินอยู่"],
    ["UNRESOLVED", "ยังยืนยันสถานะไม่ได้"],
  ] as const)("reports %s distinctly without resubmitting", async (status, expectedMessage) => {
    mockedVerifyAction.mockResolvedValue(status);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(PatientCareEndForm, {
      relationshipId: "11111111-1111-4111-8111-111111111111",
      hospitalName: "โรงพยาบาลทดสอบ",
    })));

    const verifyButton = [...container.querySelectorAll("button")].find(({ textContent }) => textContent?.includes("ตรวจสอบสถานะการสิ้นสุดการดูแล"));
    expect(verifyButton).toBeDefined();
    if (!verifyButton) return;

    await act(async () => {
      verifyButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(expectedMessage);
    expect(mockedEndAction).not.toHaveBeenCalled();
  });
});
