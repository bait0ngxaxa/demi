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
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
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
      hospitals: [hospital],
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
});
