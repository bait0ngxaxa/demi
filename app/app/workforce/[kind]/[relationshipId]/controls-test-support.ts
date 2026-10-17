import { act } from "react";
import { vi } from "vitest";

/** Shared jsdom plumbing for the relationship control tests; mocks themselves stay in each test file. */
type Restorable = [object, string, PropertyDescriptor | undefined];

let restorables: Restorable[] = [];

export function installDialogSupport(): void {
  const define = (target: object, key: string, value: unknown): void => {
    restorables.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { configurable: true, value });
  };
  define(HTMLElement.prototype, "scrollTo", () => undefined);
  define(HTMLDialogElement.prototype, "showModal", function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  });
  define(HTMLDialogElement.prototype, "close", function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
  define(
    HTMLFormElement.prototype,
    "requestSubmit",
    function requestSubmit(this: HTMLFormElement, submitter?: HTMLButtonElement | HTMLInputElement): void {
      this.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter ?? null }));
    },
  );
}

export function restoreDialogSupport(): void {
  for (const [target, key, descriptor] of restorables) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
  restorables = [];
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export function findButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

export function formOf(container: ParentNode, buttonLabel: string): HTMLFormElement {
  const form = findButton(container, buttonLabel).closest("form");
  if (!form) throw new Error(`Missing form for button: ${buttonLabel}`);
  return form;
}

export function submitForm(container: ParentNode, buttonLabel: string): void {
  const button = findButton(container, buttonLabel);
  const form = button.closest("form");
  if (!form) throw new Error(`Missing form for button: ${buttonLabel}`);
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

export type ToastSpies = {
  success: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
};

export function toastCalls(spies: ToastSpies): unknown[][] {
  return [...spies.success.mock.calls, ...spies.warning.mock.calls, ...spies.error.mock.calls];
}
