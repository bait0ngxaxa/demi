// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info } }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({ updateWorkforceContactPhoneAction: mocks.update }));

import type { WorkforceContactPhoneActionState } from "@/modules/workforce/transport/server-actions";
import {
  findButton,
  installDialogSupport,
  restoreDialogSupport,
  settle,
  submitForm,
} from "./controls-test-support";
import { WorkforceContactPhoneControl } from "./workforce-contact-phone-control";

const RELATIONSHIP_ID = "relationship-private-1";
const HOSPITAL_ID = "hospital-private-1";
const V1 = "2026-10-01T00:00:00.000Z";
const V2 = "2026-10-02T00:00:00.000Z";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogSupport();
});

afterAll(() => restoreDialogSupport());

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(): void {
  act(() => root.render(createElement(WorkforceContactPhoneControl, {
    kind: "osm",
    relationshipId: RELATIONSHIP_ID,
    targetHospitalId: HOSPITAL_ID,
    expectedUpdatedAt: V1,
    contactPhone: "0891234567",
    ended: false,
  })));
}

function success(): WorkforceContactPhoneActionState {
  return { status: "SUCCESS", result: { relationshipId: RELATIONSHIP_ID, hospitalId: HOSPITAL_ID, updatedAt: V2 } };
}

function openDialog(): HTMLDialogElement {
  act(() => findButton(container, "แก้ไขเบอร์ติดต่อ").click());
  const dialog = container.querySelector("dialog");
  if (!dialog) throw new Error("Missing contact phone edit dialog");
  return dialog;
}

function phoneInput(dialog: ParentNode): HTMLInputElement {
  const input = dialog.querySelector<HTMLInputElement>("input[name='contactPhone']");
  if (!input) throw new Error("Missing contact phone field");
  return input;
}

describe("WorkforceContactPhoneControl task dialog", () => {
  it("shows the current number, preserves a canceled draft, and submits the original scoped version", async () => {
    mocks.update.mockResolvedValueOnce(success());
    render();
    expect(container.textContent).toContain("0891234567");
    expect(container.querySelector("form")).toBeNull();

    const trigger = findButton(container, "แก้ไขเบอร์ติดต่อ");
    const dialog = openDialog();
    const input = phoneInput(dialog);
    expect(input.value).toBe("0891234567");
    expect(document.activeElement).toBe(input);
    expect(dialog.querySelectorAll("form")).toHaveLength(1);
    expect(mocks.update).not.toHaveBeenCalled();

    input.value = "0812345678";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    act(() => findButton(dialog, "ยกเลิก").click());
    expect(document.activeElement).toBe(trigger);

    const reopened = openDialog();
    expect(phoneInput(reopened).value).toBe("0812345678");
    await act(async () => submitForm(reopened, "บันทึกเบอร์ติดต่อ"));
    await settle();

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0]?.[1].get("kind")).toBe("osm");
    expect(mocks.update.mock.calls[0]?.[1].get("relationshipId")).toBe(RELATIONSHIP_ID);
    expect(mocks.update.mock.calls[0]?.[1].get("targetHospitalId")).toBe(HOSPITAL_ID);
    expect(mocks.update.mock.calls[0]?.[1].get("expectedUpdatedAt")).toBe(V1);
    expect(mocks.update.mock.calls[0]?.[1].get("contactPhone")).toBe("0812345678");
    expect(container.querySelector("dialog")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a confirmed error and the draft visible in the dialog", async () => {
    mocks.update.mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด" });
    render();
    const dialog = openDialog();
    const input = phoneInput(dialog);
    input.value = "0812345678";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => submitForm(dialog, "บันทึกเบอร์ติดต่อ"));
    await settle();

    expect(container.querySelector("dialog")).not.toBeNull();
    expect(phoneInput(dialog).value).toBe("0812345678");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("uses native validity for an invalid Thai phone number and does not dispatch", async () => {
    render();
    const dialog = openDialog();
    const input = phoneInput(dialog);
    input.value = "123";
    const reportValidity = vi.spyOn(input, "reportValidity").mockReturnValue(false);

    await act(async () => submitForm(dialog, "บันทึกเบอร์ติดต่อ"));

    expect(reportValidity).toHaveBeenCalledOnce();
    expect(input.validationMessage).toContain("กรุณากรอกเบอร์มือถือไทย");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")).not.toBeNull();
  });

  it("keeps an unknown outcome recoverable and prevents resubmission", async () => {
    mocks.update.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "private detail" });
    render();
    const dialog = openDialog();
    const input = phoneInput(dialog);
    input.value = "0812345678";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => submitForm(dialog, "บันทึกเบอร์ติดต่อ"));
    await settle();

    expect(dialog.textContent).toContain("กรุณาตรวจสอบเบอร์ติดต่อล่าสุดก่อนบันทึกอีกครั้ง");
    expect(dialog.textContent).not.toContain("private detail");
    expect(phoneInput(dialog).disabled).toBe(true);
    expect(findButton(dialog, "บันทึกเบอร์ติดต่อ").disabled).toBe(true);
    await act(async () => submitForm(dialog, "บันทึกเบอร์ติดต่อ"));
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
