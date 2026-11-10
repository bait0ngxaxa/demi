// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(previous: unknown, formData: FormData) => Promise<unknown>>(),
  replace: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({
  createPatientBaselineAction: mocks.create,
}));

import { PatientBaselineForm } from "../../../../app/app/patients/[relationshipId]/baseline/baseline-form";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "22222222-2222-4222-8222-222222222222", name: "โรงพยาบาล ก" },
};
const success = {
  status: "SUCCESS",
  result: { patientBaselineId: "33333333-3333-4333-8333-333333333333", patientHospitalRelationshipId: relationshipId, recordedOn: "2026-10-30" },
};

let container: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

beforeEach(async () => {
  mocks.create.mockReset();
  mocks.replace.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(PatientBaselineForm, { patient, relationshipId }));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function field(id: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!element) throw new Error(`Missing field ${id}`);
  return element;
}

async function type(id: string, value: string): Promise<void> {
  const element = field(id);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(text: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

function dialog(): HTMLDialogElement | null {
  return container.querySelector("dialog");
}

function reviewValue(label: string): HTMLElement {
  const term = Array.from(dialog()?.querySelectorAll("dt") ?? []).find((item) => item.textContent === label);
  const value = term?.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`Missing review value: ${label}`);
  return value;
}

async function openReview(): Promise<void> {
  await act(async () => button("ตรวจสอบข้อมูลก่อนบันทึก").click());
}

async function confirm(): Promise<void> {
  await act(async () => button("ยืนยันบันทึกข้อมูลตั้งต้น", dialog() ?? container).click());
}

describe("Patient Baseline review dialog", () => {
  it("opens the review without dispatching and keeps the entry form on the page", async () => {
    await openReview();

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(dialog()?.closest("form")).not.toBeNull();
    expect(dialog()?.querySelector("form")).toBeNull();
    expect(container.querySelector("#baseline-weight")?.closest("dialog")).toBeNull();
    expect(dialog()?.textContent).toContain("สมชาย ผู้ป่วย");
    expect(dialog()?.textContent).toContain("โรงพยาบาล ก");
    expect(dialog()?.textContent).toContain("HN-001");
    expect(dialog()?.textContent).toContain("อ่านอย่างเดียว");
    expect(document.activeElement).toBe(button("กลับไปแก้ไข", dialog() ?? container));
  });

  it("summarizes the entered values exactly and distinguishes blank fields from recorded ones", async () => {
    await type("baseline-recorded-on", "2026-10-30");
    await type("baseline-weight", "72.50");
    await type("baseline-blood-pressure-systolic", "0.01");
    await type("baseline-confidence-score", "0");
    await type("baseline-summary", "บรรทัดแรก\nบรรทัดสอง");
    await openReview();

    expect(dialog()?.querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-30");
    expect(reviewValue("น้ำหนัก (kg)").textContent).toBe("72.50");
    expect(reviewValue("น้ำหนัก (kg)").dataset.recorded).toBe("true");
    expect(reviewValue("ความดันตัวบน (mmHg)").textContent).toBe("0.01");
    expect(reviewValue("คะแนนความมั่นใจ (0–10)").textContent).toBe("0");
    expect(reviewValue("สรุปข้อมูลตั้งต้น").textContent).toBe("บรรทัดแรก\nบรรทัดสอง");
    for (const blank of ["ส่วนสูง (cm)", "HbA1c (%)", "CVD risk score (%)", "อุปสรรค", "คำแนะนำ"]) {
      expect(reviewValue(blank).textContent).toBe("ไม่ได้บันทึก");
      expect(reviewValue(blank).dataset.recorded).toBe("false");
    }
    for (const section of ["ข้อมูลสุขภาพตั้งต้น", "การปรับตัว / สภาพเริ่มต้น", "ความมั่นใจ", "สรุป"]) {
      expect(dialog()?.querySelector(`section[aria-label="${section}"]`)).not.toBeNull();
    }
    // No derived measurement (for example BMI) or interpretation is added to the review.
    expect(dialog()?.textContent).not.toMatch(/BMI|ดัชนีมวลกาย|ความเสี่ยงสูง|ปกติ/u);
  });

  it("returns to editing with the draft intact and focus on the review trigger", async () => {
    await type("baseline-weight", "70");
    await type("baseline-adaptation-summary", "ร่างเดิม");
    await openReview();
    await act(async () => button("กลับไปแก้ไข", dialog() ?? container).click());

    expect(dialog()).toBeNull();
    expect(field("baseline-weight").value).toBe("70");
    expect(field("baseline-adaptation-summary").value).toBe("ร่างเดิม");
    expect(document.activeElement).toBe(button("ตรวจสอบข้อมูลก่อนบันทึก"));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("closes on Escape while idle without dispatching", async () => {
    await openReview();
    await act(async () => {
      dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(dialog()).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps native validation in front of the review", async () => {
    await type("baseline-recorded-on", "");
    await openReview();
    expect(dialog()).toBeNull();

    await type("baseline-recorded-on", "2026-10-30");
    await type("baseline-cvd-risk-score", "101");
    await openReview();
    expect(dialog()).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("confirms exactly once with the original form payload and navigates only after a confirmed success", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    await type("baseline-recorded-on", "2026-10-30");
    await type("baseline-weight", "72.5");
    await openReview();

    await act(async () => {
      const confirmButton = button("ยืนยันบันทึกข้อมูลตั้งต้น", dialog() ?? container);
      confirmButton.click();
      confirmButton.form?.requestSubmit(confirmButton);
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mock.calls[0][1];
    expect(payload.get("patientHospitalRelationshipId")).toBe(relationshipId);
    expect(payload.get("recordedOn")).toBe("2026-10-30");
    expect(payload.get("weight")).toBe("72.5");
    expect(payload.get("heightCm")).toBe("");
    const keys = [...payload.keys()].filter((key) => !key.startsWith("$ACTION"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(17);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(button("กลับไปแก้ไข", dialog() ?? container).disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);

    await act(async () => {
      dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(dialog()?.hasAttribute("open")).toBe(true);

    await act(async () => resolve(success));
    // useActionState would queue a second accepted submit behind the first; none may follow.
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(`/app/patients/${relationshipId}/baseline`);
    expect(dialog()?.textContent).toContain("บันทึกแล้ว กำลังเปิดรายการที่บันทึก");
  });

  it.each([
    ["INVALID_INPUT", "กรุณาตรวจสอบวันที่และข้อมูลตั้งต้นก่อนบันทึกอีกครั้ง"],
    ["CONFLICT", "ข้อมูลตั้งต้นของความสัมพันธ์ผู้ป่วยนี้มีอยู่แล้ว"],
    ["FORBIDDEN", "ไม่มีสิทธิ์บันทึก"],
  ])("closes the review on a confirmed %s, keeps the draft and focuses the error", async (code, message) => {
    mocks.create.mockResolvedValue({ status: "ERROR", code, message });
    await type("baseline-weight", "68");
    await type("baseline-recommendations", "ข้อความเดิม");
    await openReview();
    await confirm();

    expect(dialog()).toBeNull();
    expect(container.textContent).toContain(message);
    expect(field("baseline-weight").value).toBe("68");
    expect(field("baseline-recommendations").value).toBe("ข้อความเดิม");
    expect(container.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toContain(message);
    expect(mocks.replace).not.toHaveBeenCalled();

    await openReview();
    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("locks the review on an unknown outcome and only resends the original payload explicitly", async () => {
    mocks.create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await type("baseline-weight", "80");
    await openReview();
    await confirm();

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(dialog()?.textContent).toContain("ตรวจสอบผลของรายการ");
    expect(button("ยืนยันบันทึกข้อมูลตั้งต้น", dialog() ?? container).disabled).toBe(true);
    expect(button("กลับไปแก้ไข", dialog() ?? container).disabled).toBe(true);
    await act(async () => {
      dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(dialog()?.hasAttribute("open")).toBe(true);

    // An ordinary submit attempt cannot start a second create.
    await act(async () => {
      const form = container.querySelector("form");
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);

    mocks.create.mockResolvedValueOnce(success);
    await act(async () => button("ตรวจสอบผลของรายการ", dialog() ?? container).click());

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][1]).toBe(mocks.create.mock.calls[0][1]);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery after a resend that is still unconfirmed", async () => {
    mocks.create.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await openReview();
    await confirm();
    await act(async () => button("ตรวจสอบผลของรายการ", dialog() ?? container).click());

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][1]).toBe(mocks.create.mock.calls[0][1]);
    expect(dialog()?.textContent).toContain("ตรวจสอบผลของรายการ");
    expect(button("ตรวจสอบผลของรายการ", dialog() ?? container).disabled).toBe(false);
  });
});
