// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { HospitalNetworkActionState } from "@/modules/hospital-service-areas/transport/action-state";
import { NetworkMutationForm } from "./network-mutation-form";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() } }));

type Action = (_previous: HospitalNetworkActionState, formData: FormData) => Promise<HospitalNetworkActionState>;

function Harness({ action }: { action: Action }): React.JSX.Element {
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState("version-before-open");
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <h2 id="logical-return-target" tabIndex={-1}>รายการลูกข่าย</h2>
      <button onClick={() => setExpectedUpdatedAt("version-after-open")} type="button">เปลี่ยนข้อมูลจากแหล่งอื่น</button>
      <NetworkMutationForm
        action={action}
        hidden={{ parentHospitalId: "parent-1", childHospitalId: "child-1", expectedUpdatedAt }}
        taskDialog={{
          title: "เปลี่ยนชื่อหน่วยบริการ",
          triggerLabel: "เปลี่ยนชื่อ",
          initialFocusRef: nameRef,
          returnFocusTarget: () => document.getElementById("logical-return-target"),
        }}
        submitLabel="บันทึกชื่อ"
      >
        <label htmlFor="facility-name">ชื่อหน่วยบริการ</label>
        <input defaultValue="รพ.สต.บ้านใหม่" id="facility-name" maxLength={200} name="name" ref={nameRef} required />
      </NetworkMutationForm>
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
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
  if (originalActEnvironment === undefined) Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  else globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

function render(action: Action): void {
  act(() => root.render(<Harness action={action} />));
}

function button(label: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("NetworkMutationForm task dialog", () => {
  it("does not mutate on open or cancel, preserves a changed draft, and submits the opening version once", async () => {
    const action = vi.fn<Action>(async () => ({ status: "SUCCESS", message: "บันทึกชื่อหน่วยบริการแล้ว", completedAt: 1 }));
    render(action);

    act(() => button("เปลี่ยนชื่อ").click());
    const dialog = container.querySelector("dialog");
    const input = dialog?.querySelector<HTMLInputElement>("input[name='name']");
    if (!dialog || !input) throw new Error("Missing edit dialog or name field");
    expect(document.activeElement).toBe(input);
    expect(action).not.toHaveBeenCalled();

    input.value = "รพ.สต.บ้านใหม่ที่แก้ไข";
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button("ยกเลิก", dialog).click();
    });
    expect(action).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")).toBeNull();

    act(() => button("เปลี่ยนข้อมูลจากแหล่งอื่น").click());
    act(() => button("เปลี่ยนชื่อ").click());
    const reopened = container.querySelector("dialog");
    const preservedInput = reopened?.querySelector<HTMLInputElement>("input[name='name']");
    if (!reopened || !preservedInput) throw new Error("Missing reopened edit dialog");
    expect(preservedInput.value).toBe("รพ.สต.บ้านใหม่ที่แก้ไข");

    await act(async () => button("บันทึกชื่อ", reopened).click());
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0]?.[1].get("parentHospitalId")).toBe("parent-1");
    expect(action.mock.calls[0]?.[1].get("childHospitalId")).toBe("child-1");
    expect(action.mock.calls[0]?.[1].get("expectedUpdatedAt")).toBe("version-before-open");
    expect(action.mock.calls[0]?.[1].get("name")).toBe("รพ.สต.บ้านใหม่ที่แก้ไข");
    expect(container.querySelector("dialog")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(container.querySelector("#logical-return-target"));
  });

  it("keeps a confirmed conflict visible in the dialog and does not retry automatically", async () => {
    const action = vi.fn<Action>(async () => ({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด" }));
    render(action);
    act(() => button("เปลี่ยนชื่อ").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing edit dialog");

    await act(async () => button("บันทึกชื่อ", dialog).click());

    expect(action).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(dialog.textContent).toContain("ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด");
  });
});
