// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  readHospitalContactForOwnerAction: mocks.read,
  updateHospitalContactAction: mocks.update,
}));

import type {
  HospitalContactEditorProjection,
  HospitalContactOwnerHospital,
} from "@/modules/hospital-contact/types/hospital-contact-projections";
import { HospitalContactWorkspace } from "./hospital-contact-workspace";

const hospital: HospitalContactOwnerHospital = {
  id: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  name: "โรงพยาบาลทดสอบ",
};
const secondHospital: HospitalContactOwnerHospital = {
  id: "22222222-2222-4222-8222-222222222222",
  hospitalCode: "H-002",
  name: "โรงพยาบาลตัวอย่าง 2",
};
const updatedAt = "2026-10-05T02:03:04.005Z";

function contact(overrides: Partial<HospitalContactEditorProjection> = {}): HospitalContactEditorProjection {
  return {
    hospital,
    addressText: "ที่อยู่เดิม",
    phoneNumber: "02-000-0000",
    expectedUpdatedAt: updatedAt,
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function field<T extends HTMLElement>(id: string): T {
  const found = container?.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Missing field ${id}`);
  return found;
}

function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing native value setter");
  setter.call(element, value);
  act(() => element.dispatchEvent(new Event("input", { bubbles: true })));
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
  if (originalShowModal) {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  }
  if (originalClose) {
    Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  }
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

beforeEach(() => {
  mocks.push.mockReset();
  mocks.read.mockReset().mockResolvedValue({ status: "SUCCESS", contact: contact() });
  mocks.update.mockReset().mockResolvedValue({
    status: "SUCCESS",
    result: { outcome: "UPDATED", contact: contact() },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(HospitalContactWorkspace, {
      hospitals: [hospital, secondHospital],
      selectedHospitalId: hospital.id,
      contact: contact(),
    }));
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("Hospital Contact event lifecycle regression", () => {
  it.each([
    {
      id: "hospital-contact-address",
      nextValue: "ที่อยู่ใหม่",
      otherId: "hospital-contact-phone",
      otherValue: "02-000-0000",
    },
    {
      id: "hospital-contact-phone",
      nextValue: "02-123-4567 ต่อ 8",
      otherId: "hospital-contact-address",
      otherValue: "ที่อยู่เดิม",
    },
  ])("updates $id without losing the other draft field or throwing", ({ id, nextValue, otherId, otherValue }) => {
    const input = field<HTMLInputElement | HTMLTextAreaElement>(id);

    expect(() => setTextValue(input, nextValue)).not.toThrow();
    expect(input.value).toBe(nextValue);
    expect(field<HTMLInputElement | HTMLTextAreaElement>(otherId).value).toBe(otherValue);
  });

  it("saves the current address and phone draft values", async () => {
    setTextValue(field<HTMLTextAreaElement>("hospital-contact-address"), "ที่อยู่สำหรับบันทึก");
    setTextValue(field<HTMLInputElement>("hospital-contact-phone"), "02-555-0188");
    mocks.update.mockResolvedValue({
      status: "SUCCESS",
      result: {
        outcome: "UPDATED",
        contact: contact({ addressText: "ที่อยู่สำหรับบันทึก", phoneNumber: "02-555-0188" }),
      },
    });

    const form = container?.querySelector("form");
    if (!form) throw new Error("Missing contact form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.update).toHaveBeenCalledWith({
      hospitalId: hospital.id,
      expectedUpdatedAt: updatedAt,
      addressText: "ที่อยู่สำหรับบันทึก",
      phoneNumber: "02-555-0188",
    });
  });

  it("keeps an unsaved contact draft on cancel and follows the chosen hospital after approval", () => {
    setTextValue(field<HTMLTextAreaElement>("hospital-contact-address"), "ที่อยู่ที่ยังไม่บันทึก");
    const selector = field<HTMLSelectElement>("hospital-contact-hospital");
    selector.value = secondHospital.id;
    act(() => selector.dispatchEvent(new Event("change", { bubbles: true })));

    const dialog = container?.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("โรงพยาบาลตัวอย่าง 2");
    expect(mocks.push).not.toHaveBeenCalled();

    const cancelButton = Array.from(dialog?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent?.includes("ยกเลิก"));
    if (!cancelButton) throw new Error("Missing cancel button");
    act(() => cancelButton.click());
    expect(container?.querySelector("dialog")).toBeNull();
    expect(field<HTMLTextAreaElement>("hospital-contact-address").value).toBe("ที่อยู่ที่ยังไม่บันทึก");
    expect(selector.value).toBe(hospital.id);
    expect(mocks.push).not.toHaveBeenCalled();

    selector.value = secondHospital.id;
    act(() => selector.dispatchEvent(new Event("change", { bubbles: true })));
    const confirmButton = Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
      .find((button) => button.textContent?.includes("เปลี่ยนโรงพยาบาล"));
    if (!confirmButton) throw new Error("Missing confirmation button");
    act(() => confirmButton.click());

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      `/app/hospitals/contact?hospitalId=${secondHospital.id}`,
    );
    expect(mocks.push.mock.calls.join(" ")).not.toContain("ที่อยู่ที่ยังไม่บันทึก");
  });
});
