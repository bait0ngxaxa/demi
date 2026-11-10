// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChildOwnerInvitationForm, ChildOwnerInviteeFields, InvitationResult } from "./child-owner-invitation-form";
import type { ChildOwnerInvitationActionState } from "@/modules/hospital-service-areas/transport/action-state";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), unstableRethrow: vi.fn() }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  unstable_rethrow: mocks.unstableRethrow,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

type Action = (previous: ChildOwnerInvitationActionState, formData: FormData) => Promise<ChildOwnerInvitationActionState>;
type Success = Extract<ChildOwnerInvitationActionState, { status: "SUCCESS" }>;

function Harness({ action }: { action: Action }): React.JSX.Element {
  const nationalIdRef = useRef<HTMLInputElement>(null);
  const [invitationContext, setInvitationContext] = useState("invitation-v1");
  const [result, setResult] = useState<Success | null>(null);
  return (
    <>
      <h2 id="owner-invitation-target" tabIndex={-1}>ข้อมูลผู้ดูแลโรงพยาบาล</h2>
      <button onClick={() => setInvitationContext("invitation-v2")} type="button">เปลี่ยนบริบทคำเชิญ</button>
      <ChildOwnerInvitationForm
        action={action}
        hidden={{ hospitalId: "hospital-1", submissionNonce: "nonce-from-page" }}
        idempotent
        onSuccess={setResult}
        taskDialog={{
          title: "เชิญผู้ดูแลโรงพยาบาล",
          triggerLabel: "ระบุข้อมูลผู้ดูแล",
          contextKey: invitationContext,
          initialFocusRef: nationalIdRef,
          returnFocusTarget: () => document.getElementById("owner-invitation-target"),
        }}
        submitLabel="ส่งคำเชิญ"
      >
        <ChildOwnerInviteeFields idPrefix="owner-invitation" nationalIdRef={nationalIdRef} />
      </ChildOwnerInvitationForm>
      {result ? <InvitationResult audience="PLATFORM_ADMIN" state={result} /> : null}
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
  mocks.unstableRethrow.mockReset();
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

function fillInvitee(dialog: HTMLDialogElement): void {
  const nationalId = dialog.querySelector<HTMLInputElement>("input[name='nationalId']");
  const givenName = dialog.querySelector<HTMLInputElement>("input[name='givenName']");
  const familyName = dialog.querySelector<HTMLInputElement>("input[name='familyName']");
  const assisted = dialog.querySelector<HTMLInputElement>("input[name='mode'][value='ASSISTED']");
  if (!nationalId || !givenName || !familyName || !assisted) throw new Error("Missing invitee fields");
  nationalId.value = "1234567890123";
  givenName.value = "สมหญิง";
  familyName.value = "ผู้ดูแล";
  assisted.click();
  for (const field of [nationalId, givenName, familyName]) {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

describe("ChildOwnerInvitationForm task dialog", () => {
  it("keeps the draft on cancel and keeps the one-time activation link available after success", async () => {
    const activationUrl = "https://demi.example/activate/workforce#one-time-link";
    const action = vi.fn<Action>(async () => ({
      status: "SUCCESS",
      message: "ส่งคำเชิญผู้ดูแลโรงพยาบาลแล้ว",
      completedAt: 1,
      invitation: {
        kind: "ACTIVATION_LINK",
        activationToken: "one-time-token",
        activationUrl,
        activationExpiresAt: "2026-11-03T00:00:00.000Z",
        activationMode: "ASSISTED",
      },
    }));
    render(action);

    act(() => button("ระบุข้อมูลผู้ดูแล").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing owner invitation dialog");
    expect(document.activeElement).toBe(dialog.querySelector("input[name='nationalId']"));
    expect(dialog.querySelectorAll("form")).toHaveLength(1);
    fillInvitee(dialog);
    await act(async () => button("ยกเลิก", dialog).click());
    expect(action).not.toHaveBeenCalled();

    act(() => button("ระบุข้อมูลผู้ดูแล").click());
    const reopenedDialog = container.querySelector("dialog");
    if (!reopenedDialog) throw new Error("Missing reopened owner invitation dialog");
    expect(reopenedDialog.querySelector<HTMLInputElement>("input[name='nationalId']")?.value).toBe("1234567890123");
    expect(reopenedDialog.querySelector<HTMLInputElement>("input[name='mode'][value='ASSISTED']")?.checked).toBe(true);
    expect(reopenedDialog.innerHTML).toContain("grid gap-4 sm:grid-cols-2");
    expect(reopenedDialog.innerHTML).toContain("min-h-11");

    await act(async () => button("ส่งคำเชิญ", reopenedDialog).click());
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0]?.[1].get("hospitalId")).toBe("hospital-1");
    expect(action.mock.calls[0]?.[1].get("submissionNonce")).toBe("nonce-from-page");
    expect(action.mock.calls[0]?.[1].get("nationalId")).toBe("1234567890123");
    expect(action.mock.calls[0]?.[1].get("givenName")).toBe("สมหญิง");
    expect(action.mock.calls[0]?.[1].get("familyName")).toBe("ผู้ดูแล");
    expect(action.mock.calls[0]?.[1].get("mode")).toBe("ASSISTED");
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.textContent).toContain(activationUrl);
    expect(container.textContent).toContain("ลิงก์นี้แสดงเพียงครั้งเดียว");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("resends the exact nonce and invitee payload after an unknown outcome", async () => {
    const action = vi.fn<Action>()
      .mockImplementationOnce(async () => { throw new TypeError("connection lost"); })
      .mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่" });
    render(action);
    act(() => button("ระบุข้อมูลผู้ดูแล").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing owner invitation dialog");
    fillInvitee(dialog);

    await act(async () => button("ส่งคำเชิญ", dialog).click());
    expect(action).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')).not.toBeNull();
    expect(button("ส่งคำเชิญ", dialog).disabled).toBe(true);

    await act(async () => button("ตรวจสอบผลของรายการ", dialog).click());
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[0]?.[1].get("submissionNonce")).toBe(action.mock.calls[1]?.[1].get("submissionNonce"));
    expect(action.mock.calls[0]?.[1].get("nationalId")).toBe(action.mock.calls[1]?.[1].get("nationalId"));
    expect(dialog.textContent).toContain("ข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  });

  it("discards an invitation draft when the invitation context changes while closed", async () => {
    const action = vi.fn<Action>(async () => ({
      status: "ERROR",
      code: "CONFLICT",
      message: "คำเชิญเปลี่ยนไปแล้ว",
    }));
    render(action);

    act(() => button("ระบุข้อมูลผู้ดูแล").click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Missing owner invitation dialog");
    fillInvitee(dialog);
    await act(async () => button("ยกเลิก", dialog).click());

    act(() => button("เปลี่ยนบริบทคำเชิญ").click());
    act(() => button("ระบุข้อมูลผู้ดูแล").click());
    const reopenedDialog = container.querySelector("dialog");
    const nationalId = reopenedDialog?.querySelector<HTMLInputElement>("input[name='nationalId']");
    const givenName = reopenedDialog?.querySelector<HTMLInputElement>("input[name='givenName']");
    const remote = reopenedDialog?.querySelector<HTMLInputElement>("input[name='mode'][value='REMOTE']");
    if (!reopenedDialog || !nationalId || !givenName || !remote) throw new Error("Missing reopened invitation fields");

    expect(nationalId.value).toBe("");
    expect(givenName.value).toBe("");
    expect(remote.checked).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });
});
