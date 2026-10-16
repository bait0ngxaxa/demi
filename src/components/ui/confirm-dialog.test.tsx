// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

type HarnessProps = {
  onConfirm: () => void;
  pending?: boolean;
};

function Harness({ onConfirm, pending = false }: HarnessProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button data-testid="dialog-trigger" onClick={() => setOpen(true)}>เปิดหน้าต่าง</Button>
      <ConfirmDialog
        confirmLabel="ระงับรายการ"
        confirmVariant="destructive"
        description="ยืนยันการระงับรายการนี้"
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        pending={pending}
        title="ยืนยันการระงับ"
      />
    </>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function mount(onConfirm: () => void, pending = false): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Harness, { onConfirm, pending }));
  });
}

function openDialog(): HTMLDialogElement {
  act(() => findButton("เปิดหน้าต่าง").click());
  const dialog = container?.querySelector("dialog");
  if (!dialog) throw new Error("Missing confirmation dialog");
  return dialog;
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

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("ConfirmDialog", () => {
  it("waits for explicit confirmation and does nothing when cancelled", () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    openDialog();

    expect(onConfirm).not.toHaveBeenCalled();
    act(() => findButton("ยกเลิก").click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog")).toBeNull();
  });

  it("runs confirmation once across rapid repeated clicks", () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    openDialog();
    const confirmButton = findButton("ระงับรายการ");

    act(() => {
      confirmButton.click();
      confirmButton.click();
    });

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("locks dismissal and shows a spinner while pending", () => {
    const onConfirm = vi.fn();
    mount(onConfirm, true);
    const dialog = openDialog();
    const confirmButton = findButton("ระงับรายการ");

    expect(confirmButton.disabled).toBe(true);
    expect(confirmButton.getAttribute("aria-busy")).toBe("true");
    expect(dialog.querySelector<HTMLButtonElement>("button[aria-label='ปิดหน้าต่าง']")?.disabled).toBe(true);
    expect(findButton("ยกเลิก").disabled).toBe(true);

    const cancelEvent = new Event("cancel", { cancelable: true });
    act(() => dialog.dispatchEvent(cancelEvent));
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(container?.querySelector("dialog")).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog, restores it after Escape, and fits narrow screens", () => {
    const onConfirm = vi.fn();
    mount(onConfirm);
    const trigger = findButton("เปิดหน้าต่าง");
    act(() => trigger.focus());
    const dialog = openDialog();

    expect(document.activeElement).toBe(dialog.querySelector("h2"));
    expect(dialog.className).toContain("w-[min(32rem,calc(100vw-2rem))]");
    expect(dialog.querySelector("footer > div")?.className).toContain("flex-col");
    expect(findButton("ยกเลิก").className).toContain("w-full sm:w-auto");

    const cancelEvent = new Event("cancel", { cancelable: true });
    act(() => dialog.dispatchEvent(cancelEvent));

    expect(container?.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
