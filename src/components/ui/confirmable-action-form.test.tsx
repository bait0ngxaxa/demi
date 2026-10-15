// @vitest-environment jsdom

import { act, createElement, useActionState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { Alert } from "./alert";
import { Button } from "./button";
import { ConfirmableActionForm, type ConfirmableActionOutcome } from "./confirmable-action-form";
import { useMutationActionState } from "./mutation-action-state";

type ActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; code: "FORBIDDEN" | "CONFLICT"; message: string };

type ActionRunner = (formData: FormData) => Promise<ActionState>;

const initialState: ActionState = { status: "IDLE" };

function outcomeFor(state: ActionState): ConfirmableActionOutcome {
  if (state.status === "SUCCESS") return "success";
  if (state.status === "ERROR") return "error";
  return "idle";
}

function Harness({ runAction, withRequiredField = false }: { runAction: ActionRunner; withRequiredField?: boolean }): React.JSX.Element {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (_previous, formData) => runAction(formData),
    initialState,
  );

  return (
    <ConfirmableActionForm
      action={action}
      confirmation={{
        title: "ยืนยันการเปลี่ยนแปลง",
        description: "ตรวจสอบข้อมูลก่อนดำเนินการ",
        confirmLabel: "ยืนยันรายการ",
      }}
      outcome={outcomeFor(state)}
      pending={pending}
      resultKey={state}
    >
      <input name="hospitalId" type="hidden" value="hospital-1" />
      <label>
        หมายเหตุ
        <input defaultValue="ฉบับร่างที่เก็บไว้" name="note" />
      </label>
      {withRequiredField ? (
        <label>
          ข้อมูลที่จำเป็น
          <input data-testid="required-field" defaultValue="พร้อมส่ง" name="requiredField" required />
        </label>
      ) : null}
      <Button data-testid="submit-action" type="submit">ดำเนินการ</Button>
      {state.status === "SUCCESS" ? <Alert role="status">{state.message}</Alert> : null}
      {state.status === "ERROR" ? <Alert role="alert">{state.message}</Alert> : null}
    </ConfirmableActionForm>
  );
}

function GuardedHarness({ runAction }: { runAction: ActionRunner }): React.JSX.Element {
  const [state, action, pending, unknownOutcome] = useMutationActionState<ActionState, FormData>(
    async (_previous, formData) => runAction(formData),
    initialState,
  );

  return (
    <ConfirmableActionForm
      action={action}
      confirmation={{ title: "ยืนยันการเปลี่ยนแปลง", confirmLabel: "ยืนยันรายการ" }}
      outcome={unknownOutcome ? "unknown" : outcomeFor(state)}
      pending={pending}
      resultKey={state}
    >
      <Button data-testid="submit-action" type="submit">ดำเนินการ</Button>
    </ConfirmableActionForm>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalRequestSubmit: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function mount(runAction: ActionRunner, withRequiredField = false): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Harness, { runAction, withRequiredField }));
  });
}

function getButton(selector: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button: ${selector}`);
  return button;
}

function clickButton(button: HTMLButtonElement): void {
  act(() => button.click());
}

function submit(button: HTMLButtonElement): void {
  const form = button.closest("form");
  if (!form) throw new Error("Missing action form");
  const submitEvent = new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter: button,
  });
  act(() => form.dispatchEvent(submitEvent));
}

function getConfirmationButton(): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
    .find((item) => item.textContent?.includes("ยืนยันรายการ"));
  if (!button) throw new Error("Missing confirmation button");
  return button;
}

async function settleAction(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function withNativeRequestSubmit(callback: () => void): void {
  const currentDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "requestSubmit");
  if (!originalRequestSubmit || typeof originalRequestSubmit.value !== "function") {
    throw new Error("Missing native requestSubmit implementation");
  }

  Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", originalRequestSubmit);
  try {
    callback();
  } finally {
    if (currentDescriptor) {
      Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", currentDescriptor);
    }
  }
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalRequestSubmit = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "requestSubmit");
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
  Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
    configurable: true,
    value(this: HTMLFormElement, submitter?: HTMLButtonElement | HTMLInputElement): void {
      this.dispatchEvent(new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: submitter ?? null,
      }));
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
  for (const [prototype, key, descriptor] of [
    [HTMLDialogElement.prototype, "showModal", originalShowModal],
    [HTMLDialogElement.prototype, "close", originalClose],
    [HTMLFormElement.prototype, "requestSubmit", originalRequestSubmit],
    [HTMLElement.prototype, "scrollTo", originalScrollTo],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(prototype, key, descriptor);
    } else {
      Reflect.deleteProperty(prototype, key);
    }
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

describe("ConfirmableActionForm", () => {
  it("preserves entered values when cancelled and submits once after confirmation", async () => {
    const runAction = vi.fn<ActionRunner>(async () => ({ status: "SUCCESS", message: "บันทึกแล้ว" }));
    mount(runAction);
    const submitButton = getButton("[data-testid='submit-action']");
    const note = container?.querySelector<HTMLInputElement>("input[name='note']");
    if (!note) throw new Error("Missing note field");
    note.value = "แบบร่างที่ผู้ใช้แก้ไข";

    submit(submitButton);
    expect(container?.querySelector("dialog")).not.toBeNull();
    expect(runAction).not.toHaveBeenCalled();
    clickButton(Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
      .find((button) => button.textContent?.includes("ยกเลิก")) ?? submitButton);
    expect(container?.querySelector("dialog")).toBeNull();
    expect(runAction).not.toHaveBeenCalled();
    expect(note.value).toBe("แบบร่างที่ผู้ใช้แก้ไข");

    submit(submitButton);
    const confirmButton = getConfirmationButton();
    act(() => confirmButton.click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    const sentData = runAction.mock.calls[0]?.[0];
    expect(sentData?.get("hospitalId")).toBe("hospital-1");
    expect(sentData?.get("note")).toBe("แบบร่างที่ผู้ใช้แก้ไข");
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector('[role="status"]')?.textContent).toBe("บันทึกแล้ว");
  });

  it("shows pending state, blocks dismissal, and ignores a rapid second confirmation", async () => {
    let resolveAction: ((state: ActionState) => void) | null = null;
    const runAction = vi.fn<ActionRunner>(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    mount(runAction);
    submit(getButton("[data-testid='submit-action']"));

    const confirmButton = getConfirmationButton();
    act(() => {
      confirmButton.click();
      confirmButton.click();
    });

    expect(runAction).toHaveBeenCalledOnce();
    expect(confirmButton.disabled).toBe(true);
    expect(confirmButton.getAttribute("aria-busy")).toBe("true");
    expect(Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? []).find((button) => button.textContent?.includes("ยกเลิก"))?.disabled).toBe(true);
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);
    expect(container?.querySelector("dialog")).not.toBeNull();

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", message: "บันทึกแล้ว" });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(container?.querySelector("dialog")).toBeNull();
  });

  it("recovers when native constraint validation rejects confirmation and requires confirmation again", async () => {
    const runAction = vi.fn<ActionRunner>(async () => ({ status: "SUCCESS", message: "บันทึกแล้ว" }));
    mount(runAction, true);
    const submitButton = getButton("[data-testid='submit-action']");
    const form = submitButton.closest("form");
    const requiredField = container?.querySelector<HTMLInputElement>("[data-testid='required-field']");
    if (!form || !requiredField) throw new Error("Missing required-field test controls");

    act(() => {
      withNativeRequestSubmit(() => form.requestSubmit(submitButton));
    });
    const confirmButton = getConfirmationButton();
    requiredField.value = "";

    act(() => {
      withNativeRequestSubmit(() => confirmButton.click());
    });

    expect(runAction).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector("fieldset")?.disabled).toBe(false);
    expect(requiredField.value).toBe("");
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบข้อมูล");

    requiredField.value = "ข้อมูลครบถ้วน";
    submit(submitButton);
    expect(getConfirmationButton()).not.toBeNull();
    expect(runAction).not.toHaveBeenCalled();
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    expect(runAction.mock.calls[0]?.[0].get("requiredField")).toBe("ข้อมูลครบถ้วน");
  });

  it("recovers when requestSubmit throws and requires confirmation again", async () => {
    const runAction = vi.fn<ActionRunner>(async () => ({ status: "SUCCESS", message: "บันทึกแล้ว" }));
    mount(runAction);
    const submitButton = getButton("[data-testid='submit-action']");
    submit(submitButton);
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {
      throw new Error("dispatch failed");
    });

    act(() => getConfirmationButton().click());

    expect(requestSubmit).toHaveBeenCalledOnce();
    expect(runAction).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector("fieldset")?.disabled).toBe(false);
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบข้อมูล");

    requestSubmit.mockRestore();
    submit(submitButton);
    expect(getConfirmationButton()).not.toBeNull();
    expect(runAction).not.toHaveBeenCalled();
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
  });

  it.each([
    { code: "FORBIDDEN" as const, message: "ไม่มีสิทธิ์จัดการรายการนี้" },
    { code: "CONFLICT" as const, message: "สถานะรายการเปลี่ยนแปลงแล้ว กรุณาตรวจสอบอีกครั้ง" },
  ])("surfaces a $code server error without reporting success", async ({ code, message }) => {
    const runAction = vi.fn<ActionRunner>(async () => ({ status: "ERROR", code, message }));
    mount(runAction);
    submit(getButton("[data-testid='submit-action']"));
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(container?.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps an uncertain outcome visible and blocks a retry", async () => {
    const runAction = vi.fn<ActionRunner>(async () => initialState);
    mount(runAction);
    submit(getButton("[data-testid='submit-action']"));
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    expect(container?.querySelector("dialog")).not.toBeNull();
    expect(getConfirmationButton().disabled).toBe(true);
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain("ยังยืนยันผลการดำเนินการไม่ได้");
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);
  });

  it("treats a request that fails before the server answers as an uncertain outcome", async () => {
    const runAction = vi.fn<ActionRunner>(async () => {
      throw new TypeError("Failed to fetch");
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(GuardedHarness, { runAction }));
    });
    submit(getButton("[data-testid='submit-action']"));
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    expect(getConfirmationButton().disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ยังยืนยันผลการดำเนินการไม่ได้");
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);
  });
});
