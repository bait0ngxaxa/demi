// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/modules/hospital-onboarding/transport/parent-owner-invitation-actions", () => ({
  cancelParentOwnerInvitationAction: vi.fn(),
  changeParentOwnerInviteeAction: vi.fn(),
  inviteParentOwnerAction: vi.fn(),
  issueParentOwnerLinkAction: vi.fn(),
  revokeParentOwnerLinkAction: vi.fn(),
}));

import { ParentOwnerInvitationSection, type ParentOwnerInvitationSectionProps } from "./parent-owner-invitation-section";

const invitation: NonNullable<ParentOwnerInvitationSectionProps["invitation"]> = {
  membershipId: "44444444-4444-4444-8444-444444444444",
  inviteeName: "สมศักดิ์ ผู้ดูแล",
  invitedAt: "2026-10-31T03:00:00.000Z",
  delivery: "ACCOUNT_ACCEPTANCE",
  link: { status: "NONE", expiresAt: null, mode: null },
};

const base: ParentOwnerInvitationSectionProps = {
  hospital: { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลชุมชนใหม่" },
  availability: "FIRST_OWNER",
  pendingApplication: null,
  invitation,
  lastDeclinedAt: null,
  submissionNonce: "22222222-2222-4222-8222-222222222222",
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function openCancelDialog(props: ParentOwnerInvitationSectionProps): HTMLDialogElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(ParentOwnerInvitationSection, props)));
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button[type=submit]"))
    .find((item) => item.textContent === "ยกเลิกคำเชิญ");
  const form = button?.closest("form");
  if (!button || !form) throw new Error("Missing cancel form");
  act(() => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button })));
  const dialog = container.querySelector("dialog");
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
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

describe("cancelling a platform ADMIN Parent OWNER invitation (ADR-0024 PO-3)", () => {
  it("asks in a dialog and explains that a pending Hospital returns to the public application list", () => {
    const dialog = openCancelDialog(base);
    expect(dialog.textContent).toContain("ยกเลิกคำเชิญของ สมศักดิ์ ผู้ดูแล หรือไม่");
    expect(dialog.textContent).toContain("โรงพยาบาลจะกลับไปอยู่ในรายชื่อขอขึ้นทะเบียนสาธารณะ");
  });

  it("does not promise the public list for a replacement invitation, and warns that a held account stays suspended", () => {
    const dialog = openCancelDialog({
      ...base,
      availability: "REPLACEMENT",
      invitation: { ...invitation, delivery: "ADMIN_RESET_REQUIRED" },
    });
    expect(dialog.textContent).not.toContain("รายชื่อขอขึ้นทะเบียนสาธารณะ");
    expect(dialog.textContent).toContain("บัญชีของผู้ถูกเชิญยังคงถูกพักไว้จนกว่าจะคืนบัญชี");
  });
});
