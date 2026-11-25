// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ png: vi.fn() }));
vi.mock("@/lib/qr/branded-qr-png.client", () => ({ createBrandedQrPngDataUrl: mocks.png }));

import { createBrandedQrSvgDataUrl } from "@/lib/qr/branded-qr";

import { CredentialHandoffDialog, useCredentialHandoffLeave, type CredentialHandoffDialogProps } from "./credential-handoff-dialog";
import { prepareCredentialQrFile } from "./use-credential-qr";

const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const firstUrl = "https://demi.example/activate/workforce#first-secret";
const secondUrl = "https://demi.example/activate/workforce#second-secret";
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

beforeEach(() => {
  mocks.png.mockReset().mockResolvedValue(pngDataUrl);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function props(overrides: Partial<CredentialHandoffDialogProps> = {}): CredentialHandoffDialogProps {
  return {
    open: true,
    title: "ลิงก์เปิดใช้งานพร้อมส่งมอบ",
    subject: "ส*** บ***",
    url: firstUrl,
    expiresAt: "2026-11-26T03:00:00.000Z",
    oneTimeNotice: "ใช้ได้ครั้งเดียว · ห้ามส่งต่อ",
    qr: { alt: "QR Code ทดสอบ", fileName: "demi-test-qr.png", shareTitle: "QR Code ทดสอบ" },
    link: { label: "ลิงก์เปิดใช้งาน", shareTitle: "ลิงก์ทดสอบ" },
    onHandedOver: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
}

async function render(value: CredentialHandoffDialogProps): Promise<void> {
  await act(async () => root.render(createElement(CredentialHandoffDialog, value)));
  await act(async () => { await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function unloadPrevented(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("CredentialHandoffDialog", () => {
  it("shows the expiry, one-time notice, QR, link and secret-image warning in one labelled dialog", async () => {
    await render(props());
    const dialog = container.querySelector("dialog[open]");
    expect(dialog?.getAttribute("aria-labelledby")).toBe(dialog?.querySelector("h2")?.id);
    expect(dialog?.textContent).toContain("ส*** บ***");
    expect(dialog?.textContent).toContain("ลิงก์หมดอายุ 26 พ.ย. 2569 10:00");
    expect(dialog?.textContent).toContain("ใช้ได้ครั้งเดียว · ห้ามส่งต่อ");
    expect(dialog?.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(firstUrl);
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(createBrandedQrSvgDataUrl(firstUrl, { margin: 2, size: 240 }));
    expect(dialog?.textContent).toContain("ส่งให้เจ้าของบัญชีเท่านั้น ห้ามโพสต์ในกลุ่ม และลบรูปเมื่อใช้งานเสร็จ");
    expect(dialog?.querySelector("footer")?.textContent).toBe("ส่งมอบแล้ว");
  });

  it("shows the SVG before the PNG resolves, then saves the PNG under the flow's file name", async () => {
    const pending = Promise.withResolvers<string>();
    mocks.png.mockReturnValue(pending.promise);
    await render(props());
    expect(container.querySelector("img")).not.toBeNull();
    expect(button("บันทึกรูป QR Code").disabled).toBe(true);

    await act(async () => pending.resolve(pngDataUrl));
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("demi-test-qr.png");
      expect(this.href).toBe(pngDataUrl);
    });
    act(() => button("บันทึกรูป QR Code").click());
    expect(download).toHaveBeenCalledOnce();
  });

  it("never shows the previous link's QR after the URL changes", async () => {
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    mocks.png.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render(props());
    await render(props({ url: secondUrl }));
    await act(async () => first.resolve(pngDataUrl));

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(createBrandedQrSvgDataUrl(secondUrl, { margin: 2, size: 240 }));
    expect(container.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(secondUrl);
    expect(button("บันทึกรูป QR Code").disabled).toBe(true);
    await act(async () => second.resolve(pngDataUrl));
    expect(button("บันทึกรูป QR Code").disabled).toBe(false);
  });

  it("turns Escape and the close button into a confirmation step of the same dialog", async () => {
    const value = props();
    await render(value);
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Missing dialog");

    act(() => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
    expect(dialog.textContent).toContain("ลิงก์นี้จะแสดงซ้ำไม่ได้");
    expect(document.activeElement).toBe(button("กลับไปที่ลิงก์"));
    act(() => button("กลับไปที่ลิงก์").click());
    expect(dialog.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(firstUrl);
    expect(document.activeElement).toBe(dialog.querySelector("h2"));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.click());
    act(() => button("ปิดโดยไม่ส่งมอบ").click());
    expect(value.onDiscard).toHaveBeenCalledOnce();
    expect(value.onHandedOver).not.toHaveBeenCalled();
  });

  it("guards unload and in-app links only while open, and continues a link the user chose to leave by", async () => {
    const followed = vi.fn((event: Event) => event.preventDefault());
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return createElement("div", null,
        createElement("a", { href: "/app/workforce", onClick: followed }, "รายชื่อ"),
        createElement(CredentialHandoffDialog, props({ open, onDiscard: () => setOpen(false), onHandedOver: () => setOpen(false) })),
      );
    }
    await act(async () => root.render(createElement(Harness)));
    await act(async () => { await Promise.resolve(); });
    const anchor = container.querySelector("a");
    if (!anchor) throw new Error("Missing link");

    expect(unloadPrevented()).toBe(true);
    act(() => anchor.click());
    expect(followed).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.textContent).toContain("ยังไม่ได้ส่งมอบลิงก์");

    act(() => button("ปิดโดยไม่ส่งมอบ").click());
    expect(followed).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).toBeNull();
    expect(unloadPrevented()).toBe(false);
    act(() => anchor.click());
    expect(followed).toHaveBeenCalledTimes(2);
  });

  it("lets a flow action leave the page on purpose without the leave warning", async () => {
    const assign = vi.fn();
    const original = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", { configurable: true, value: { href: "https://demi.example/app", assign } });
    function Start(): React.JSX.Element {
      const leaveTo = useCredentialHandoffLeave();
      return createElement("button", { onClick: () => leaveTo(firstUrl), type: "button" }, "เริ่มเปิดใช้งานบนเครื่องนี้");
    }
    try {
      await render(props({ extraActions: createElement(Start) }));
      act(() => button("เริ่มเปิดใช้งานบนเครื่องนี้").click());
      expect(assign).toHaveBeenCalledExactlyOnceWith(firstUrl);
      expect(unloadPrevented()).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, "location", original);
    }
  });

  it("blocks closing and handing over while a flow action runs", async () => {
    await render(props({ busy: true }));
    expect(button("ส่งมอบแล้ว").disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    act(() => { dialog?.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(dialog?.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(firstUrl);
  });
});

describe("prepareCredentialQrFile", () => {
  it("rejects a non-PNG and offers a share file only when the browser can share files", () => {
    expect(() => prepareCredentialQrFile("data:image/png;base64,AA==", "x.png")).toThrow();
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { share: vi.fn(), canShare: vi.fn(() => false) }));
    expect(prepareCredentialQrFile(pngDataUrl, "x.png").shareFile).toBeNull();
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { share: vi.fn(), canShare: vi.fn(() => true) }));
    expect(prepareCredentialQrFile(pngDataUrl, "demi-test-qr.png").shareFile).toMatchObject({ name: "demi-test-qr.png", type: "image/png" });
  });
});
