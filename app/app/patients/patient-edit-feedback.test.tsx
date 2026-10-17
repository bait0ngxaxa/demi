// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  health: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  name: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions", () => ({
  correctPatientNameAction: (_relationshipId: string, ...args: unknown[]) => mocks.name(...args),
  savePatientHealthHistoryAction: (_relationshipId: string, ...args: unknown[]) => mocks.health(...args),
  saveStaffPatientHospitalProfileAction: (_relationshipId: string, ...args: unknown[]) => mocks.profile(...args),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { HospitalPatientEditForm } from "./[relationshipId]/hospital-patient-edit-form";
import { PatientNameCorrectionForm } from "./patient-name-correction-form";

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

const profileForm = (relationshipId = "relationship-1") =>
  createElement(HospitalPatientEditForm, { health: false, relationshipId, values: { phoneNumber: "0800000000" }, version: 3 });
const healthForm = () =>
  createElement(HospitalPatientEditForm, { health: true, relationshipId: "relationship-1", values: {}, version: 1 });
const nameForm = (relationshipId = "relationship-1") =>
  createElement(PatientNameCorrectionForm, { relationshipId, version: 2, givenName: "สมชาย", familyName: "ใจดี" });

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

function field(name: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

async function submit(): Promise<void> {
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
  });
}

function allToasts(): string {
  return JSON.stringify([mocks.notifySuccess.mock.calls, mocks.notifyWarning.mock.calls, mocks.notifyError.mock.calls]);
}

const success = { status: "SUCCESS", message: "บันทึกข้อมูลสำหรับโรงพยาบาลนี้แล้ว" };

describe.each([
  ["profile", () => profileForm(), mocks.profile, "บันทึกข้อมูลผู้ป่วยแล้ว"],
  ["health history", () => healthForm(), mocks.health, "บันทึกประวัติสุขภาพแล้ว"],
  ["name correction", () => nameForm(), mocks.name, "แก้ไขชื่อ-สกุลแล้ว"],
] as const)("%s save feedback", (_label, element, action, successToast) => {
  it("shows one static success Toast, keeps the inline message, and never replays", async () => {
    action.mockResolvedValue(success);
    render(element());

    await submit();

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith(successToast);
    render(element());
    render(element());
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps validation inline without a Toast", async () => {
    action.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "ข้อมูลไม่ถูกต้อง" });
    render(element());

    await submit();

    expect(container.textContent).toContain("ข้อมูลไม่ถูกต้อง");
    expect(allToasts()).toBe("[[],[],[]]");
  });

  it("warns on a version conflict and reports FORBIDDEN as an error", async () => {
    action.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว" });
    render(element());
    await submit();
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();

    action.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
    await submit();
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["returned UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }],
    ["returned IDLE", { status: "IDLE", message: "" }],
  ])("treats %s as unconfirmed: no Toast, reload recovery, locked", async (_name, response) => {
    action.mockResolvedValue(response);
    render(element());

    await submit();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(container.querySelector<HTMLButtonElement>("form button[type=submit]")!.disabled).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown request as unconfirmed without a Toast", async () => {
    action.mockRejectedValue(new TypeError("Failed to fetch"));
    render(element());

    await submit();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
  });

  it("sends one request for two synchronous submits", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    action.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(element());

    await act(async () => {
      const form = container.querySelector("form")!;
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(success);
    });
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("gives no Toast when unmounted before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    action.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(element());
    await submit();

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      resolve(success);
    });

    expect(allToasts()).toBe("[[],[],[]]");
  });
});

describe("draft and scope handling", () => {
  it("keeps the edited draft while pending and after a confirmed save", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.profile.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(profileForm());
    field("phoneNumber").value = "0811111111";

    await submit();
    expect(field("phoneNumber").disabled).toBe(true);
    expect(field("phoneNumber").value).toBe("0811111111");

    await act(async () => {
      resolve(success);
    });
    expect(field("phoneNumber").value).toBe("0811111111");
  });

  it("gives no Toast when the form now shows another relationship", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.profile.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(profileForm("relationship-1"));
    await submit();

    render(profileForm("relationship-2"));
    await act(async () => {
      resolve(success);
    });

    expect(allToasts()).toBe("[[],[],[]]");
  });

  it("never puts submitted names or clinical values in a Toast", async () => {
    mocks.health.mockResolvedValue(success);
    render(healthForm());
    field("otherConditions").value = "โรคหัวใจ";

    await submit();

    expect(allToasts()).not.toContain("โรคหัวใจ");
    expect(allToasts()).not.toContain("สมชาย");
  });
});
