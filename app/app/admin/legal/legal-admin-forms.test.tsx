// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLegalVersionView } from "@/modules/legal/transport/legal-admin-context";

const mocks = vi.hoisted(() => ({ publish: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/modules/legal/transport/server-actions", () => ({
  createLegalDraftAction: vi.fn(),
  updateLegalDraftAction: vi.fn(),
  lookupUserLegalHistoryAction: vi.fn(),
  publishLegalVersionAction: mocks.publish,
}));

import { LegalDraftEditor } from "./legal-admin-forms";

const draft: AdminLegalVersionView = {
  id: "b0000000-0000-4000-8000-000000000001",
  kind: "TERMS",
  versionLabel: "2026-11",
  title: "ข้อกำหนดและเงื่อนไขการใช้บริการ",
  body: "# ข้อ 1\n\nเนื้อหาฉบับจริง",
  isPlaceholder: false,
  status: "DRAFT",
  publishedAt: null,
  updatedAt: "2026-11-03T05:00:00.000Z",
  isCurrent: false,
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement): void { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe("ADMIN legal draft editor (LG-D3)", () => {
  it("previews the saved text and publishes only after confirmation, for the previewed revision", async () => {
    mocks.publish.mockResolvedValue({ status: "SUCCESS", versionId: draft.id });
    act(() => root.render(createElement(LegalDraftEditor, { version: draft })));

    expect(container.textContent).toContain("ตัวอย่างฉบับที่บันทึกแล้ว");
    expect(container.textContent).toContain("เนื้อหาฉบับจริง");

    await act(async () => button("ประกาศใช้ฉบับนี้").click());
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("ยืนยันการประกาศใช้");
    expect(document.body.textContent).toContain("แก้ไขหรือลบไม่ได้อีก");
    expect(document.body.textContent).toContain("แถบแจ้งให้ยอมรับฉบับใหม่");

    await act(async () => button("ประกาศใช้").click());
    expect(mocks.publish).toHaveBeenCalledWith({ versionId: draft.id, expectedUpdatedAt: draft.updatedAt });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("does not publish when the confirmation is cancelled, and blocks publishing unsaved edits", async () => {
    act(() => root.render(createElement(LegalDraftEditor, { version: draft })));
    await act(async () => button("ประกาศใช้ฉบับนี้").click());
    await act(async () => button("ยกเลิก").click());
    expect(mocks.publish).not.toHaveBeenCalled();

    const body = container.querySelector<HTMLTextAreaElement>("#legal-body");
    if (!body) throw new Error("Missing body field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(body, "แก้ไขแล้ว");
      body.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("ประกาศใช้ฉบับนี้").disabled).toBe(true);
    expect(container.textContent).toContain("มีการแก้ไขที่ยังไม่บันทึก");
  });
});
