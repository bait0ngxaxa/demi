// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("@/modules/patient-activation/transport/server-actions", () => ({
  issuePatientActivationAction: mocks.issue,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { PatientActivationHandoff } from "./patient-activation-handoff";

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
  act(() => {
    root.render(createElement(PatientActivationHandoff, { patientAccessRequestId: "request-1" }));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function result(outcome: string, activationToken: string | null) {
  return {
    status: "SUCCESS",
    result: {
      outcome,
      userId: "user-1",
      patientProfileId: "profile-1",
      hospitalId: "hospital-1",
      activationToken,
      activationUrl: activationToken
        ? `https://canonical.example/activate/patient#${encodeURIComponent(activationToken)}`
        : null,
      activationExpiresAt: "2026-10-20T00:00:00.000Z",
    },
  };
}

async function submit(): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>("form button[type=submit]")!.click();
  });
}

describe("Access-request linked activation", () => {
  it("sends only the request id and shows one success Toast for an issued link", async () => {
    mocks.issue.mockResolvedValue(result("ISSUED", "linked-secret-token"));

    await submit();

    const formData = mocks.issue.mock.calls[0][1] as FormData;
    expect(formData.get("patientAccessRequestId")).toBe("request-1");
    expect(formData.get("userId")).toBeNull();
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("ออกลิงก์เปิดใช้งานแล้ว");
    expect(JSON.stringify(mocks.notifySuccess.mock.calls)).not.toContain("linked-secret-token");
    expect(container.textContent).toContain("linked-secret-token");
  });

  it("warns before unload only while an unhandled one-time link is on screen", async () => {
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    mocks.issue.mockResolvedValue(result("ISSUED", "linked-secret-token"));
    expect(leave()).toBe(false);

    await submit();
    expect(leave()).toBe(true);

    act(() => root.unmount());
    root = createRoot(container);
    expect(leave()).toBe(false);
  });

  it("explains an already-active account inline without a Toast", async () => {
    mocks.issue.mockResolvedValue(result("ALREADY_ACTIVE", null));

    await submit();

    expect(container.textContent).toContain("บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว");
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it("does not replace an existing valid link automatically", async () => {
    mocks.issue.mockResolvedValue(result("ALREADY_ISSUED", null));

    await submit();

    expect(container.textContent).toContain("มีลิงก์เปิดใช้งานที่ยังใช้ได้แล้ว");
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it("treats a returned UNAVAILABLE as unconfirmed and offers no second issue", async () => {
    mocks.issue.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" });

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบอาจออกลิงก์แล้ว");
    expect(container.querySelector("form")).toBeNull();
    expect(mocks.notifyError).not.toHaveBeenCalled();
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });
});
