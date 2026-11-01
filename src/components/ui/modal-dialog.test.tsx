// @vitest-environment jsdom

import { act, createElement, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ModalDialog } from "./modal-dialog";

type HarnessProps = {
  open: boolean;
  triggerVisible?: boolean;
  stepKey?: string;
  focusOnStepChange?: boolean;
  initialFocus?: boolean;
  preferredFocusDisabled?: boolean;
  dismissible?: boolean;
  returnFocusTarget?: () => HTMLElement | null;
  onRequestClose?: () => void;
  onClosed?: () => void;
};

function Harness({
  open,
  triggerVisible = true,
  stepKey = "initial",
  focusOnStepChange = false,
  initialFocus = false,
  preferredFocusDisabled = false,
  dismissible = true,
  returnFocusTarget,
  onRequestClose = () => undefined,
  onClosed,
}: HarnessProps): React.JSX.Element {
  const preferredFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {triggerVisible ? <button type="button">เปิดหน้าต่าง</button> : null}
      <button id="logical-return-target" type="button">กลับไปทำงานต่อ</button>
      {open ? (
        <ModalDialog
          dismissible={dismissible}
          focusOnStepChange={focusOnStepChange}
          initialFocusRef={initialFocus ? preferredFocusRef : undefined}
          onClosed={onClosed}
          onRequestClose={onRequestClose}
          returnFocusTarget={returnFocusTarget}
          size="fullscreen"
          stepKey={stepKey}
          title="แก้ไขข้อมูล"
          description="ตรวจสอบข้อมูลที่ต้องการแก้ไข"
        >
          <label>
            ข้อมูล
            <input aria-label="ข้อมูล" />
          </label>
          <button disabled={preferredFocusDisabled} ref={preferredFocusRef} type="button">ดำเนินการต่อ</button>
        </ModalDialog>
      ) : null}
    </>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
const showModalCalls = vi.fn<(dialog: HTMLDialogElement) => void>();
const closeCalls = vi.fn<(dialog: HTMLDialogElement) => void>();

function render(props: HarnessProps): void {
  act(() => {
    root?.render(createElement(Harness, props));
  });
}

function mount(props: HarnessProps): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  render(props);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = container?.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      showModalCalls(this);
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      if (!this.open) return;
      closeCalls(this);
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
});

afterEach(async () => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  await flushMicrotasks();
  container?.remove();
  container = null;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  showModalCalls.mockClear();
  closeCalls.mockClear();
});

describe("ModalDialog", () => {
  it("opens natively, focuses its heading, and restores trigger and document scroll styles", () => {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "scroll";
    mount({ open: false });
    const trigger = requiredElement<HTMLButtonElement>("button");
    const triggerFocus = vi.spyOn(trigger, "focus");
    act(() => trigger.focus());

    render({ open: true });

    const dialog = requiredElement<HTMLDialogElement>("dialog");
    expect(showModalCalls).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector("h2"));
    expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h2")?.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(dialog.querySelector("header div div")?.id);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(dialog.className).toContain("max-sm:h-[100dvh]");
    expect(dialog.className).toContain("env(safe-area-inset-bottom,0px)");

    render({ open: false });

    expect(closeCalls).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(trigger);
    expect(triggerFocus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("uses the preferred initial focus and a logical fallback when the trigger is removed", () => {
    mount({ open: false });
    const trigger = requiredElement<HTMLButtonElement>("button");
    const fallback = requiredElement<HTMLButtonElement>("#logical-return-target");
    const fallbackFocus = vi.spyOn(fallback, "focus");
    act(() => trigger.focus());
    render({
      open: true,
      initialFocus: true,
      returnFocusTarget: () => fallback,
    });

    const preferredAction = requiredElement<HTMLButtonElement>("dialog button:not([aria-label])");
    expect(document.activeElement).toBe(preferredAction);

    render({ open: true, triggerVisible: false, initialFocus: true, returnFocusTarget: () => fallback });
    render({ open: false, triggerVisible: false, returnFocusTarget: () => fallback });

    expect(document.activeElement).toBe(fallback);
    expect(fallbackFocus).toHaveBeenLastCalledWith({ preventScroll: false });
  });

  it("falls back to the heading when a preferred initial target is disabled", () => {
    mount({ open: true, initialFocus: true, preferredFocusDisabled: true });

    const dialog = requiredElement<HTMLDialogElement>("dialog");
    expect(document.activeElement).toBe(dialog.querySelector("h2"));
  });

  it("does not steal focus on an ordinary step key change unless the owner requests it", () => {
    mount({ open: true, stepKey: "review" });
    const field = requiredElement<HTMLInputElement>("input[aria-label='ข้อมูล']");
    const dialog = requiredElement<HTMLDialogElement>("dialog");
    const body = Array.from(dialog.children).find((child) => child.tagName === "DIV");
    if (!body) throw new Error("Missing dialog content region");
    body.scrollTop = 80;
    act(() => field.focus());

    render({ open: true, stepKey: "review-updated" });

    expect(document.activeElement).toBe(field);
    expect(body.scrollTop).toBe(0);

    render({ open: true, stepKey: "result", focusOnStepChange: true });

    expect(document.activeElement).toBe(dialog.querySelector("h2"));
  });

  it("ignores Strict Mode effect cleanup as a close notification and closes once on real unmount", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onClosed = vi.fn();
    act(() => {
      root?.render(createElement(StrictMode, null, createElement(Harness, { open: true, onClosed })));
    });
    await flushMicrotasks();

    expect(requiredElement<HTMLDialogElement>("dialog").open).toBe(true);
    expect(showModalCalls).toHaveBeenCalledTimes(2);
    expect(closeCalls).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();

    act(() => root?.unmount());
    root = null;
    await flushMicrotasks();

    expect(closeCalls).toHaveBeenCalledTimes(2);
    expect(onClosed).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("requests close once for a native close and reopens when dismissal is blocked", () => {
    const onRequestClose = vi.fn();
    mount({ open: true, onRequestClose });
    const dialog = requiredElement<HTMLDialogElement>("dialog");
    act(() => dialog.close());

    expect(onRequestClose).toHaveBeenCalledOnce();

    render({ open: false, onRequestClose });
    render({ open: true, dismissible: false, onRequestClose });
    const busyDialog = requiredElement<HTMLDialogElement>("dialog");
    act(() => busyDialog.close());

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(busyDialog.open).toBe(true);
  });
});
