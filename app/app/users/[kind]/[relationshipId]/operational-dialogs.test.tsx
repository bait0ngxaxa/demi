// @vitest-environment jsdom

import { UserTakeoverProviderState } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ delete: vi.fn(), takeover: vi.fn(), refresh: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info } }));
vi.mock("@/modules/user-management/transport/server-actions", () => ({
  deleteUserRecordAction: mocks.delete,
  lockSuspectedTakeoverAction: mocks.takeover,
}));

import {
  findButton,
  installDialogSupport,
  restoreDialogSupport,
  settle,
  submitForm,
} from "../../../workforce/[kind]/[relationshipId]/controls-test-support";
import { UserRecordDeleteControl } from "./user-record-delete-control";
import { UserTakeoverControl } from "./user-takeover-control";

const RELATIONSHIP_ID = "relationship-private-1";
const HOSPITAL_ID = "hospital-private-1";
const V1 = "2026-10-01T00:00:00.000Z";
const DIRECTORY_HREF = "/app/users?hospitalId=hospital-private-1&tab=staff";

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

function renderDelete(): void {
  act(() => root.render(createElement(UserRecordDeleteControl, {
    kind: "staff",
    relationshipId: RELATIONSHIP_ID,
    hospitalId: HOSPITAL_ID,
    updatedAt: V1,
    directoryHref: DIRECTORY_HREF,
    resourceName: "สมชาย ใจดี",
  })));
}

function renderTakeover(retry = false): void {
  act(() => root.render(createElement(UserTakeoverControl, {
    kind: "staff",
    relationshipId: RELATIONSHIP_ID,
    hospitalId: HOSPITAL_ID,
    updatedAt: V1,
    retry,
    resourceName: "สมชาย ใจดี",
    hospitalName: "โรงพยาบาลชุมชน",
  })));
}

function openDialog(label: string): HTMLDialogElement {
  act(() => findButton(container, label).click());
  const dialog = container.querySelector("dialog");
  if (!dialog) throw new Error(`Missing dialog after opening ${label}`);
  return dialog;
}

function confirmInput(dialog: ParentNode, name: string): HTMLInputElement {
  const input = dialog.querySelector<HTMLInputElement>(`input[name='${name}']`);
  if (!input) throw new Error(`Missing ${name} confirmation field`);
  return input;
}

describe("UserRecordDeleteControl destructive dialog", () => {
  it("identifies the record and cancels without mutation", () => {
    renderDelete();
    const trigger = findButton(container, "ลบรายการ");
    const dialog = openDialog("ลบรายการ");

    expect(dialog.textContent).toContain("สมชาย ใจดี");
    expect(dialog.textContent).toContain("ย้อนกลับไม่ได้");
    expect(dialog.querySelectorAll("form")).toHaveLength(1);
    expect(document.activeElement).toBe(findButton(dialog, "ยกเลิก"));
    expect(mocks.delete).not.toHaveBeenCalled();
    act(() => findButton(dialog, "ยกเลิก").click());
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("retains the typed phrase, reports deletion blockers, and stays open after rejection", async () => {
    mocks.delete.mockResolvedValueOnce({
      success: false,
      outcome: "NOT_DELETABLE",
      blockers: ["HAS_DATA"],
      message: "ลบรายการนี้ไม่ได้ ใช้ นำออกจากระบบ แทน",
    });
    renderDelete();
    const dialog = openDialog("ลบรายการ");
    const confirmation = confirmInput(dialog, "confirmation");
    confirmation.value = "ลบรายการ";

    await act(async () => submitForm(dialog, "ยืนยันลบรายการถาวร"));
    await settle();

    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.delete.mock.calls[0]?.[1].get("kind")).toBe("staff");
    expect(mocks.delete.mock.calls[0]?.[1].get("relationshipId")).toBe(RELATIONSHIP_ID);
    expect(mocks.delete.mock.calls[0]?.[1].get("targetHospitalId")).toBe(HOSPITAL_ID);
    expect(mocks.delete.mock.calls[0]?.[1].get("expectedUpdatedAt")).toBe(V1);
    expect(mocks.delete.mock.calls[0]?.[1].get("confirmation")).toBe("ลบรายการ");
    expect(container.querySelector("dialog")).not.toBeNull();
    expect(dialog.textContent).toContain("มีข้อมูลการดูแล");
    expect(dialog.textContent).toContain("ข้อมูลการดูแล นัดหมาย");
    expect(dialog.textContent).toContain("ลบรายการนี้ไม่ได้ ใช้ นำออกจากระบบ แทน");
  });

  it("closes only after confirmed deletion and keeps the directory link available", async () => {
    mocks.delete.mockResolvedValueOnce({ success: true, outcome: "DELETED", blockers: [], message: "ลบรายการแล้ว เพิ่มรายการใหม่ด้วยเลขที่ถูกต้องได้ทันที" });
    renderDelete();
    const dialog = openDialog("ลบรายการ");
    confirmInput(dialog, "confirmation").value = "ลบรายการ";

    await act(async () => submitForm(dialog, "ยืนยันลบรายการถาวร"));
    await settle();

    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector(`a[href='${DIRECTORY_HREF}']`)?.textContent).toContain("กลับไปรายชื่อ");
  });

  it("keeps an unknown deletion outcome locked with reload recovery", async () => {
    mocks.delete.mockResolvedValueOnce({ success: false, outcome: "UNAVAILABLE", blockers: [], message: "private error" });
    renderDelete();
    const dialog = openDialog("ลบรายการ");
    confirmInput(dialog, "confirmation").value = "ลบรายการ";

    await act(async () => submitForm(dialog, "ยืนยันลบรายการถาวร"));
    await settle();

    expect(dialog.textContent).toContain("โหลดข้อมูลล่าสุด");
    expect(dialog.textContent).not.toContain("private error");
    expect(findButton(dialog, "ยืนยันลบรายการถาวร").disabled).toBe(true);
    await act(async () => submitForm(dialog, "ยืนยันลบรายการถาวร"));
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});

describe("UserTakeoverControl security dialog", () => {
  it("opens and cancels without a mutation", () => {
    renderTakeover();
    const trigger = findButton(container, "บัญชีนี้ไม่ใช่เจ้าของจริง");
    const dialog = openDialog("บัญชีนี้ไม่ใช่เจ้าของจริง");
    expect(dialog.textContent).toContain("ล็อกบัญชี");
    expect(dialog.textContent).toContain("ระงับสิทธิ์");
    expect(dialog.textContent).toContain("ตัดการเข้าสู่ระบบทุกอุปกรณ์");
    expect(dialog.textContent).toContain("ยกเลิกการเชื่อม LINE");
    expect(mocks.takeover).not.toHaveBeenCalled();

    act(() => findButton(dialog, "ยกเลิก").click());
    expect(document.activeElement).toBe(trigger);
    expect(mocks.takeover).not.toHaveBeenCalled();
  });

  it("keeps retry mode scoped to provider session revocation and never sends a retry flag", async () => {
    mocks.takeover
      .mockResolvedValueOnce({
        success: true,
        outcome: "LOCKED",
        providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED,
        message: "ล็อกบัญชีแล้ว แต่ยังยืนยันการยกเลิกการเข้าสู่ระบบที่ผู้ให้บริการไม่ได้ กรุณากดซ้ำเพื่อลองอีกครั้ง",
      })
      .mockResolvedValueOnce({
        success: true,
        outcome: "LOCKED",
        providerState: UserTakeoverProviderState.CONFIRMED,
        message: "ล็อกบัญชีแล้ว ผู้ที่ใช้บัญชีนี้ถูกตัดออกจากระบบ",
      });
    renderTakeover(true);
    expect(container.querySelector("dialog")).toBeNull();
    const retryTrigger = findButton(container, "ยืนยันการตัดการเข้าสู่ระบบอีกครั้ง");
    expect(mocks.takeover).not.toHaveBeenCalled();
    act(() => retryTrigger.click());
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Retry mode should open its security dialog after user action");
    expect(dialog.textContent).toContain("บัญชีที่ถูกล็อกอยู่เท่านั้น");
    expect(dialog.textContent).toContain("จะไม่เริ่มการล็อกบัญชีหรือระงับความสัมพันธ์ซ้ำ");
    expect(mocks.takeover).not.toHaveBeenCalled();
    const confirmation = confirmInput(dialog, "confirmation");
    confirmation.value = "ไม่ใช่เจ้าของจริง";

    await act(async () => submitForm(dialog, "ลองตัดการเข้าสู่ระบบอีกครั้ง"));
    await settle();

    expect(mocks.takeover).toHaveBeenCalledOnce();
    expect(mocks.takeover.mock.calls[0]?.[1].get("relationshipId")).toBe(RELATIONSHIP_ID);
    expect(mocks.takeover.mock.calls[0]?.[1].get("expectedUpdatedAt")).toBe(V1);
    expect(mocks.takeover.mock.calls[0]?.[1].get("confirmation")).toBe("ไม่ใช่เจ้าของจริง");
    expect(mocks.takeover.mock.calls[0]?.[1].has("retry")).toBe(false);
    expect(dialog.textContent).toContain("ล็อกบัญชีแล้ว แต่ยังยืนยันการยกเลิก");
    expect(findButton(dialog, "ลองตัดการเข้าสู่ระบบอีกครั้ง").disabled).toBe(false);

    await act(async () => submitForm(dialog, "ลองตัดการเข้าสู่ระบบอีกครั้ง"));
    await settle();

    expect(mocks.takeover).toHaveBeenCalledTimes(2);
    expect(mocks.takeover.mock.calls[1]?.[1].get("expectedUpdatedAt")).toBe(V1);
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.textContent).toContain("ล็อกบัญชีแล้ว ผู้ที่ใช้บัญชีนี้ถูกตัดออกจากระบบ");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("บัญชีนี้ไม่ใช่เจ้าของจริง"))).toBe(false);
  });

  it("keeps unknown outcomes recoverable without repeating the lock", async () => {
    mocks.takeover.mockResolvedValueOnce({ success: false, outcome: "UNAVAILABLE", providerState: null, message: "private error" });
    renderTakeover();
    const dialog = openDialog("บัญชีนี้ไม่ใช่เจ้าของจริง");
    confirmInput(dialog, "confirmation").value = "ไม่ใช่เจ้าของจริง";

    await act(async () => submitForm(dialog, "ยืนยันล็อกบัญชี"));
    await settle();

    expect(dialog.textContent).toContain("โหลดข้อมูลล่าสุด");
    expect(dialog.textContent).not.toContain("private error");
    expect(findButton(dialog, "ยืนยันล็อกบัญชี").disabled).toBe(true);
    await act(async () => submitForm(dialog, "ยืนยันล็อกบัญชี"));
    expect(mocks.takeover).toHaveBeenCalledOnce();
  });
});
