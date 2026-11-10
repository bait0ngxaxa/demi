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
import { UnknownOutcomeAlert, type UnknownOutcomeRecovery } from "./unknown-outcome-alert";

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

function Harness({ runAction, withRequiredField = false, onSubmitted }: { runAction: ActionRunner; withRequiredField?: boolean; onSubmitted?: () => void }): React.JSX.Element {
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
        pendingLabel: "กำลังยืนยันรายการ",
      }}
      onSubmitted={onSubmitted}
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
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<ActionState, FormData>(
    async (_previous, formData) => runAction(formData),
    initialState,
  );

  return (
    <>
      <ConfirmableActionForm
        action={action}
        confirmation={{ title: "ยืนยันการเปลี่ยนแปลง", confirmLabel: "ยืนยันรายการ" }}
        recovery={
          <UnknownOutcomeAlert
            active={unknownOutcome}
            recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }}
          />
        }
        outcome={unknownOutcome ? "unknown" : outcomeFor(state)}
        pending={pending}
        resultKey={state}
      >
        <input name="requestId" type="hidden" value="original-request" />
        <input name="submissionNonce" type="hidden" value="original-nonce" />
        <input name="description" type="hidden" value="original payload" />
        <Button data-testid="submit-action" type="submit">ดำเนินการ</Button>
      </ConfirmableActionForm>
    </>
  );
}

function RecoveryStrategyHarness({
  kind,
  onVerify,
  runAction,
}: {
  kind: UnknownOutcomeRecovery["kind"];
  onVerify: (verificationId: string) => void;
  runAction: ActionRunner;
}): React.JSX.Element {
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<ActionState, FormData>(
    async (_previous, formData) => runAction(formData),
    initialState,
  );
  const recovery: UnknownOutcomeRecovery = kind === "resend"
    ? { kind, onResend: resendUnconfirmed, resending: pending }
    : kind === "reload"
      ? { kind, label: "ดูข้อมูลล่าสุด", message: "ตรวจสอบสถานะล่าสุดก่อนทำรายการใหม่" }
      : kind === "verify"
        ? { kind, label: "ตรวจสอบสถานะ", message: "ตรวจสอบรายการด้วยหมายเลขเดิม", onVerify: () => onVerify("original-verification-identity"), verifying: false }
        : kind === "review"
          ? { kind, label: "ตรวจสอบรายการก่อนทำรายการใหม่" }
          : { kind, message: "ยังยืนยันผลไม่ได้", note: "ตรวจสอบกับผู้ดูแลก่อนทำรายการใหม่" };

  return (
    <ConfirmableActionForm
      action={action}
      confirmation={{ title: "ยืนยันการเปลี่ยนแปลง", confirmLabel: "ยืนยันรายการ" }}
      outcome={unknownOutcome ? "unknown" : outcomeFor(state)}
      pending={pending}
      recovery={<UnknownOutcomeAlert active={unknownOutcome} recovery={recovery} />}
      resultKey={state}
    >
      <input name="requestId" type="hidden" value="original-request" />
      <input name="submissionNonce" type="hidden" value="original-nonce" />
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

function mount(runAction: ActionRunner, withRequiredField = false, onSubmitted?: () => void): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Harness, { runAction, withRequiredField, onSubmitted }));
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
    const dialog = container?.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Expected the generic reload fallback dialog to remain open");
    expect(getConfirmationButton().disabled).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("ยังยืนยันผลรายการนี้ไม่ได้");
    expect(Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent?.includes("ดูข้อมูลล่าสุด"))).toBe(true);
    expect(dialog.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container?.querySelectorAll("[aria-hidden='true'] [role='alert']")).toHaveLength(1);
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);

    const fallbackAction = container?.querySelector<HTMLButtonElement>("[aria-hidden='true'] button");
    if (!fallbackAction) throw new Error("Missing mounted fallback recovery action");
    const closeButton = Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
      .find((button) => button.textContent?.includes("ปิดหน้าต่าง"));
    if (!closeButton) throw new Error("Missing unknown-outcome close action");
    clickButton(closeButton);
    expect(container?.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(fallbackAction);
    expect(container?.querySelectorAll('[role="alert"]')).toHaveLength(1);
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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ยังยืนยันผลรายการนี้ไม่ได้");
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);
  });

  it("keeps the unknown state locked until a recovered request returns a new confirmed result", async () => {
    const runAction = vi.fn<ActionRunner>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "สถานะเปลี่ยนแล้ว" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(GuardedHarness, { runAction }));
    });

    const submitButton = getButton("[data-testid='submit-action']");
    submit(submitButton);
    act(() => getConfirmationButton().click());
    await settleAction();

    expect(runAction).toHaveBeenCalledOnce();
    expect(getConfirmationButton().disabled).toBe(true);
    expect(submitButton.matches(":disabled")).toBe(true);

    const closeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("dialog button"))
      .find((button) => button.textContent?.includes("ปิดหน้าต่าง"));
    if (!closeButton) throw new Error("Missing unknown-outcome close action");
    clickButton(closeButton);
    expect(container.querySelector("dialog")).toBeNull();

    const resend = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("ตรวจสอบผลของรายการ"));
    if (!resend) throw new Error("The caller's resend action should remain available after closing");
    clickButton(resend);
    await settleAction();

    expect(runAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector("dialog")).toBeNull();
    expect(submitButton.matches(":disabled")).toBe(false);

    submit(submitButton);
    expect(getConfirmationButton().disabled).toBe(false);
    expect(runAction).toHaveBeenCalledTimes(2);
  });

  it("uses only the caller resend after an uncertain confirmation and preserves its original payload", async () => {
    const runAction = vi.fn<ActionRunner>()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "สถานะเปลี่ยนแล้ว" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(GuardedHarness, { runAction })));

    const submitButton = getButton("[data-testid='submit-action']");
    submitButton.focus();
    submit(submitButton);
    act(() => getConfirmationButton().click());
    await settleAction();

    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Expected the uncertain confirmation dialog to remain open");
    expect(dialog.querySelector("h2")?.textContent).toBe("ยังยืนยันผลรายการนี้ไม่ได้");
    expect(dialog.textContent).toContain("ปิดหน้าต่างนี้เพื่อดำเนินการตรวจสอบผลด้วยวิธีที่ระบบเตรียมไว้");
    expect(dialog.querySelector("[role='alert'], [role='status']")).toBeNull();
    expect([...dialog.querySelectorAll("button")].some((button) => button.textContent?.includes("ดูข้อมูลล่าสุด"))).toBe(false);
    expect(getConfirmationButton().disabled).toBe(true);
    expect(submitButton.matches(":disabled")).toBe(true);
    expect(runAction).toHaveBeenCalledOnce();
    const resendAlert = container.querySelector<HTMLElement>("[data-navigation-guard='unknown-outcome']");
    expect(resendAlert?.closest("[aria-hidden='true']")).not.toBeNull();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(beforeUnload));
    expect(beforeUnload.defaultPrevented).toBe(true);

    const closeButton = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("ปิดหน้าต่าง"));
    if (!closeButton) throw new Error("Missing safe close action");
    clickButton(closeButton);
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(resendAlert?.querySelector("button"));
    expect(resendAlert?.closest("[aria-hidden='true']")).toBeNull();
    expect(submitButton.matches(":disabled")).toBe(true);
    expect(runAction).toHaveBeenCalledOnce();

    const resend = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("ตรวจสอบผลของรายการ"));
    if (!resend) throw new Error("The caller's resend action should remain available after closing");
    clickButton(resend);
    await settleAction();

    expect(runAction).toHaveBeenCalledTimes(2);
    const originalPayload = runAction.mock.calls[0]?.[0];
    const resentPayload = runAction.mock.calls[1]?.[0];
    expect(originalPayload).toBe(resentPayload);
    expect(originalPayload).toBeInstanceOf(FormData);
    if (!(originalPayload instanceof FormData)) throw new Error("The request payload was not FormData");
    expect(Object.fromEntries(originalPayload.entries())).toEqual({
      requestId: "original-request",
      submissionNonce: "original-nonce",
      description: "original payload",
    });
    expect(submitButton.matches(":disabled")).toBe(false);
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')).toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it.each(["reload", "verify", "review", "note"] as const)("keeps explicit %s recovery distinct from reload and resend", async (kind) => {
    const runAction = vi.fn<ActionRunner>(async () => { throw new TypeError("connection lost"); });
    const onVerify = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(RecoveryStrategyHarness, { kind, onVerify, runAction })));

    submit(getButton("[data-testid='submit-action']"));
    act(() => getConfirmationButton().click());
    await settleAction();

    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Expected the unknown outcome to stay in the confirmation dialog");
    expect(getConfirmationButton().disabled).toBe(true);
    expect([...dialog.querySelectorAll("button")].some((button) => button.textContent?.includes("ดูข้อมูลล่าสุด"))).toBe(false);
    expect([...dialog.querySelectorAll("button")].some((button) => button.textContent?.includes("ตรวจสอบผลของรายการ"))).toBe(false);
    if (kind === "verify") {
      expect(container.querySelector("[data-navigation-guard='unknown-outcome']")?.closest("[aria-hidden='true']")).not.toBeNull();
    } else {
      expect(container.querySelector("[data-navigation-guard='unknown-outcome']")).toBeNull();
    }

    const closeButton = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("ปิดหน้าต่าง"));
    if (!closeButton) throw new Error("Missing safe close action");
    clickButton(closeButton);
    expect(container.querySelector("dialog")).toBeNull();
    expect(runAction).toHaveBeenCalledOnce();
    expect(getButton("[data-testid='submit-action']").matches(":disabled")).toBe(true);

    if (kind === "note") {
      const recoveryAlert = container.querySelector<HTMLElement>("[role='alert']");
      expect(document.activeElement).toBe(recoveryAlert?.parentElement);
    }

    if (kind === "verify") {
      const verify = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "ตรวจสอบสถานะ");
      if (!verify) throw new Error("The caller's verify action should remain available");
      clickButton(verify);
      expect(onVerify).toHaveBeenCalledExactlyOnceWith("original-verification-identity");
      expect(runAction).toHaveBeenCalledOnce();
    } else if (kind === "review") {
      expect([...container.querySelectorAll("button")].some((button) => button.textContent === "ตรวจสอบรายการก่อนทำรายการใหม่")).toBe(true);
      expect(runAction).toHaveBeenCalledOnce();
    } else if (kind === "note") {
      expect(container.textContent).toContain("ตรวจสอบกับผู้ดูแลก่อนทำรายการใหม่");
      expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("ดูข้อมูลล่าสุด"))).toBe(false);
      expect(runAction).toHaveBeenCalledOnce();
    } else {
      expect([...container.querySelectorAll("button")].some((button) => button.textContent === "ดูข้อมูลล่าสุด")).toBe(true);
      expect(runAction).toHaveBeenCalledOnce();
    }
  });

  it("reports a dispatched confirmation synchronously, never on open, cancel or a rejected submit", async () => {
    let resolveAction: ((state: ActionState) => void) | null = null;
    const runAction = vi.fn<ActionRunner>(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    const onSubmitted = vi.fn();
    mount(runAction, true, onSubmitted);
    const submitButton = getButton("[data-testid='submit-action']");

    submit(submitButton);
    clickButton(Array.from(container?.querySelectorAll<HTMLButtonElement>("dialog button") ?? [])
      .find((button) => button.textContent?.includes("ยกเลิก")) ?? submitButton);
    expect(onSubmitted).not.toHaveBeenCalled();

    submit(submitButton);
    const requiredField = container?.querySelector<HTMLInputElement>("[data-testid='required-field']");
    if (!requiredField) throw new Error("Missing required field");
    requiredField.value = "";
    withNativeRequestSubmit(() => act(() => getConfirmationButton().click()));
    expect(onSubmitted).not.toHaveBeenCalled();

    requiredField.value = "พร้อมส่ง";
    submit(submitButton);
    act(() => getConfirmationButton().click());
    expect(onSubmitted).toHaveBeenCalledOnce();
    await settleAction();
    expect(container?.querySelector("dialog")?.textContent).toContain("กำลังยืนยันรายการ");

    await act(async () => {
      resolveAction?.({ status: "SUCCESS", message: "บันทึกแล้ว" });
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
  });
});
