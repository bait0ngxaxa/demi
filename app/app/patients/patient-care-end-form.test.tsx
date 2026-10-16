// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedEndAction, mockedVerifyAction, mockedUseMutationActionState, mockedDispatch } = vi.hoisted(() => ({
  mockedEndAction: vi.fn(),
  mockedVerifyAction: vi.fn(),
  mockedUseMutationActionState: vi.fn(),
  mockedDispatch: vi.fn(),
}));

vi.mock("@/components/ui/mutation-action-state", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/mutation-action-state")>();
  return { ...original, useMutationActionState: mockedUseMutationActionState };
});
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
    mockedDispatch,
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

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(({ textContent }) => textContent?.includes(text));
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

function mountForm(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(PatientCareEndForm, {
    relationshipId: "11111111-1111-4111-8111-111111111111",
    hospitalId: "22222222-2222-4222-8222-222222222222",
    hospitalName: "โรงพยาบาลทดสอบ",
  })));
}

describe("PatientCareEndForm unknown outcome recovery", () => {
  it("offers the exact Hospital directory after confirming the relationship ended", async () => {
    mountForm();
    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockedVerifyAction).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(mockedEndAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ยืนยันแล้วว่าการดูแลสิ้นสุดแล้ว");
    const directoryLink = container.querySelector<HTMLAnchorElement>("a");
    expect(directoryLink?.textContent).toContain("กลับไปรายชื่อผู้ป่วย");
    expect(directoryLink?.getAttribute("href")).toBe("/app/patients?hospitalId=22222222-2222-4222-8222-222222222222");
    expect(container.querySelector('button[type="submit"]')).toBeNull();
  });

  it.each([
    ["ACTIVE", "ขณะตรวจสอบยังพบว่าการดูแลดำเนินอยู่"],
    ["UNRESOLVED", "ยังยืนยันสถานะไม่ได้"],
  ] as const)("handles a %s verification result without resubmitting automatically", async (status, expectedMessage) => {
    mockedVerifyAction.mockResolvedValue(status);
    mountForm();
    await act(async () => {
      buttonByText("ตรวจสอบสถานะการสิ้นสุดการดูแล").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(expectedMessage);
    expect(mockedEndAction).not.toHaveBeenCalled();

    const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submitButton).toBeDefined();
    if (status === "ACTIVE") {
      expect(submitButton?.disabled).toBe(false);
      const reason = container.querySelector<HTMLTextAreaElement>('textarea[name="endReason"]');
      const confirmRetention = container.querySelector<HTMLInputElement>('input[name="confirmRetention"]');
      expect(reason?.disabled).toBe(false);
      expect(confirmRetention?.disabled).toBe(false);
      if (!submitButton || !reason || !confirmRetention) {
        throw new Error("Expected the care-end form to be available after ACTIVE verification");
      }

      reason.value = "ย้ายออกจากพื้นที่รับผิดชอบ";
      confirmRetention.checked = true;
      await act(async () => {
        submitButton.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockedDispatch).toHaveBeenCalledTimes(1);
      const submittedPayload: unknown = mockedDispatch.mock.calls[0]?.[0];
      expect(submittedPayload).toBeInstanceOf(FormData);
      if (!(submittedPayload instanceof FormData)) {
        throw new Error("Expected care-end form data after the user submits");
      }
      expect(submittedPayload.get("endReason")).toBe("ย้ายออกจากพื้นที่รับผิดชอบ");
      expect(submittedPayload.get("confirmRetention")).toBe("true");
    } else {
      expect(submitButton?.disabled).toBe(true);
      expect(mockedDispatch).not.toHaveBeenCalled();
    }
  });
});
