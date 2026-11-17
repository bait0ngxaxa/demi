// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientEvidenceRemoveActionState } from "@/modules/patient-evidence/transport/patient-evidence-server-actions";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  unstable_rethrow: () => undefined,
}));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/patient-evidence/transport/patient-evidence-server-actions", () => ({
  removePatientEvidenceArtifactAction: vi.fn(),
}));

import { PatientEvidenceRemoveControl } from "./evidence-remove-control";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";

type RemoveAction = (
  relationshipId: string,
  artifactId: string,
  state: PatientEvidenceRemoveActionState,
  formData: FormData,
) => Promise<PatientEvidenceRemoveActionState>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
const patched: Array<[object, string, PropertyDescriptor | undefined]> = [];

beforeAll(() => {
  const flagged = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = flagged.IS_REACT_ACT_ENVIRONMENT;
  flagged.IS_REACT_ACT_ENVIRONMENT = true;
  const define = (target: object, key: string, value: unknown): void => {
    patched.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { configurable: true, value });
  };
  define(HTMLElement.prototype, "scrollTo", () => undefined);
  define(HTMLDialogElement.prototype, "showModal", function showModal(this: HTMLDialogElement): void { this.setAttribute("open", ""); });
  define(HTMLDialogElement.prototype, "close", function close(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});

afterAll(() => {
  const flagged = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) Reflect.deleteProperty(flagged, "IS_REACT_ACT_ENVIRONMENT");
  else flagged.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  for (const [target, key, descriptor] of patched) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.success.mockReset();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function mount(removeAction: RemoveAction): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PatientEvidenceRemoveControl, { relationshipId, artifactId, removeAction }));
  });
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (!found) throw new Error("Dialog is not open");
  return found;
}

function button(label: string, scope: ParentNode): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

async function openDialog(): Promise<void> {
  await act(async () => button("ลบรูป", container as HTMLDivElement).click());
}

async function typeReason(value: string): Promise<void> {
  const textarea = dialog().querySelector("textarea");
  if (!textarea) throw new Error("Missing reason field");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function confirm(): Promise<void> {
  await act(async () => {
    button("ลบรูป", dialog()).click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe("Patient Evidence remove control (N4)", () => {
  it("asks for a required reason, then removes and refreshes the list in place", async () => {
    const removeAction = vi.fn<RemoveAction>(async () => ({ status: "SUCCESS", message: "ลบรูปหลักฐานแล้ว" }));
    await mount(removeAction);

    await openDialog();
    expect(dialog().textContent).toContain("ลบรูปหลักฐานนี้?");
    const label = Array.from(dialog().querySelectorAll("label")).find((item) => item.textContent?.includes("เหตุผลที่ลบ"));
    expect(label?.querySelector("textarea")?.required).toBe(true);
    expect(button("ลบรูป", dialog()).disabled).toBe(true);

    await typeReason("   ");
    expect(button("ลบรูป", dialog()).disabled).toBe(true);

    await typeReason("  อัปโหลดผิดผู้ป่วย ");
    expect(button("ลบรูป", dialog()).disabled).toBe(false);
    await confirm();

    expect(removeAction).toHaveBeenCalledTimes(1);
    const [calledRelationship, calledArtifact, , formData] = removeAction.mock.calls[0] ?? [];
    expect([calledRelationship, calledArtifact]).toEqual([relationshipId, artifactId]);
    expect(formData?.get("reason")).toBe("อัปโหลดผิดผู้ป่วย");
    expect(mocks.success).toHaveBeenCalledWith("ลบรูปหลักฐานแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("shows a conflict in the dialog and does not refresh", async () => {
    const removeAction = vi.fn<RemoveAction>(async () => ({
      status: "ERROR",
      code: "CONFLICT",
      message: "รูปนี้แนบเป็นหลักฐานของกิจกรรม Service 1 แล้ว จึงลบจากหน้านี้ไม่ได้",
    }));
    await mount(removeAction);

    await openDialog();
    await typeReason("ผิดคน");
    await confirm();

    expect(dialog().querySelector("[role='alert']")?.textContent).toContain("Service 1");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("reports an unconfirmed outcome with the shared alert and locks the dialog", async () => {
    const removeAction = vi.fn<RemoveAction>(async () => {
      throw new Error("connection lost");
    });
    await mount(removeAction);

    await openDialog();
    await typeReason("ผิดคน");
    await confirm();

    expect(dialog().textContent).toContain("ยังยืนยันผลรายการนี้ไม่ได้");
    expect(dialog().textContent).toContain("ระบบยังยืนยันผลการลบรูปไม่ได้");
    expect(button("ลบรูป", dialog()).disabled).toBe(true);
    expect(dialog().querySelector("textarea")?.disabled).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
