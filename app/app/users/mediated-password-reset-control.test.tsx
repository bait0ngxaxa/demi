// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ issue: vi.fn(), qr: vi.fn(), locationReplace: vi.fn() }));
vi.mock("@/modules/account-security/transport/server-actions", () => ({ issueMediatedPasswordResetAction: mocks.issue }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));

import { MediatedPasswordResetControl } from "./mediated-password-reset-control";

let container: HTMLDivElement;
let root: Root;
let originalLocationDescriptor: PropertyDescriptor | undefined;
const copy = vi.fn();
const share = vi.fn();
const canShare = vi.fn();
const qrDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const onlineResult = {
  status: "ISSUED",
  mode: "ONLINE",
  handoffUrl: "https://demi.example/recover#synthetic-token",
  expiresAt: "2026-10-23T03:00:00.000Z",
} as const;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute("open"); },
  });
});

beforeEach(() => {
  mocks.issue.mockReset();
  mocks.qr.mockReset().mockResolvedValue(qrDataUrl);
  mocks.locationReplace.mockReset();
  copy.mockReset().mockResolvedValue(undefined);
  share.mockReset().mockResolvedValue(undefined);
  canShare.mockReset().mockReturnValue(false);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    clipboard: { writeText: copy },
    share,
  }));
  originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", { configurable: true, value: { origin: "https://demi.example", replace: mocks.locationReplace } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (originalLocationDescriptor) Object.defineProperty(window, "location", originalLocationDescriptor);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderControl(
  eligibility: "OWNER_ELIGIBLE" | "ADMIN_ALLOWED" | "ADMIN_REQUIRED" = "OWNER_ELIGIBLE",
  targetKind: "patient" | "platform_admin" = "patient",
): Promise<void> {
  const targetContext = targetKind === "platform_admin"
    ? { targetKind: "platform_admin" as const, hospitalId: null, hospitalName: null, relationshipId: null, targetUserId: "33333333-3333-4333-8333-333333333333" }
    : { targetKind: "patient" as const, hospitalId: "11111111-1111-4111-8111-111111111111", hospitalName: "โรงพยาบาลตัวอย่าง", relationshipId: "22222222-2222-4222-8222-222222222222" };
  await act(async () => {
    root.render(createElement(MediatedPasswordResetControl, {
      ...targetContext,
      targetName: "ผู้ใช้ตัวอย่าง",
      eligibility,
    }));
  });
}

function click(selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  act(() => element.click());
}

async function submitForm(): Promise<void> {
  await act(async () => {
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) throw new Error("Missing issue button");
    button.click();
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === label);
}

function getButton(label: string): HTMLButtonElement {
  const button = findButton(label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

async function issueOnline(): Promise<void> {
  click('input[name="mode"][value="ONLINE"]');
  await submitForm();
}

function enableFileShare(): void {
  Object.defineProperty(navigator, "canShare", { value: canShare });
  canShare.mockReturnValue(true);
}

describe("OWNER/ADMIN-mediated password reset handoff", () => {
  it("opens a compact shared modal with separate header, scrolling content, and form-linked footer", async () => {
    await renderControl();
    const trigger = container.querySelector("button");
    expect(container.querySelector("dialog")).toBeNull();
    trigger?.focus();
    click("button");

    const dialog = container.querySelector("dialog[open]");
    const header = dialog?.querySelector("header");
    const form = dialog?.querySelector("form");
    const footer = dialog?.querySelector("footer");
    expect(dialog?.classList).toContain("m-auto");
    expect(dialog?.classList).toContain("max-h-[calc(100svh-2rem)]");
    expect(dialog?.classList).toContain("w-[min(32rem,calc(100vw-2rem))]");
    expect(header?.textContent).toContain("ผู้ใช้ตัวอย่าง · โรงพยาบาลตัวอย่าง");
    expect(header?.querySelector("h2")?.textContent).toBe("รีเซ็ตรหัสผ่าน");
    expect(form?.parentElement?.classList).toContain("overflow-y-auto");
    expect(dialog?.querySelector("form form")).toBeNull();
    expect(footer?.querySelector<HTMLButtonElement>('button[type="submit"]')?.form).toBe(form);
    expect(footer?.textContent).toContain("ปิด");
    expect(document.body.style.overflow).toBe("hidden");

    click('footer button[type="button"]');
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");

    click("button");
    act(() => container.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    click("button");
    click('header button[aria-label="ปิดหน้าต่าง"]');
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the modal open and blocks duplicate submissions while issuance is pending", async () => {
    const response = Promise.withResolvers<{ status: "ERROR"; message: string }>();
    mocks.issue.mockReturnValue(response.promise);
    await renderControl();
    click("button");
    await submitForm();
    await submitForm();

    const dialog = container.querySelector("dialog[open]");
    const cancel = new Event("cancel", { cancelable: true });
    act(() => dialog?.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog?.querySelectorAll("button:disabled")).toHaveLength(3);
    click("header button");
    click('footer button[type="button"]');
    expect(container.querySelector("dialog[open]")).toBe(dialog);
    expect(mocks.issue).toHaveBeenCalledOnce();

    await act(async () => response.resolve({ status: "ERROR", message: "ออกลิงก์ไม่สำเร็จ" }));
    expect(dialog?.querySelector('[role="alert"]')?.textContent).toBe("ออกลิงก์ไม่สำเร็จ");
    expect(dialog?.querySelector("button:disabled")).toBeNull();
  });

  it("issues without choosing a verification method, reminds the issuer to verify identity, and shows the online single-use QR and link", async () => {
    const handoffUrl = `https://demi.example/recover#${"x".repeat(43)}`;
    mocks.issue.mockResolvedValue({ status: "ISSUED", mode: "ONLINE", handoffUrl, expiresAt: "2026-10-23T03:00:00.000Z" });
    await renderControl();

    click("button");
    const issueButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "ออกลิงก์รีเซ็ต");
    expect(issueButton?.disabled).toBe(false);
    expect(container.querySelector('input[name="verificationMethod"]')).toBeNull();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(container.textContent).toContain("ตรวจสอบตัวตนเจ้าของบัญชีก่อนออกลิงก์ หากโทรยืนยัน ให้โทรเบอร์ในเวชระเบียนของโรงพยาบาลเท่านั้น");
    expect(container.textContent).not.toContain("ผู้ดูแลระบบ DEMI ที่ออกลิงก์ต้องตรวจสอบตัวตนของผู้ดูแลระบบ DEMI ผู้รับอย่างเป็นอิสระก่อน");

    click('input[name="mode"][value="ONLINE"]');
    await submitForm();

    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.issue).toHaveBeenCalledWith({
      hospitalId: "11111111-1111-4111-8111-111111111111",
      relationshipId: "22222222-2222-4222-8222-222222222222",
      targetKind: "patient",
      mode: "ONLINE",
    });
    expect(mocks.issue.mock.calls[0]?.[0]).not.toHaveProperty("verificationMethod");
    expect(mocks.qr).toHaveBeenCalledWith(expect.stringContaining("/recover#"), expect.any(Object));
    expect(container.textContent).toContain("ลิงก์ใช้ได้ครั้งเดียว");
    expect(container.querySelector('img[alt="QR code สำหรับเปิดลิงก์รีเซ็ตรหัสผ่าน"]')).not.toBeNull();
    expect(container.querySelector('input[readonly][value*="/recover#"]')).not.toBeNull();
    expect(container.textContent).toContain("คัดลอกลิงก์");
    expect(container.textContent).toContain("แชร์ลิงก์");
    expect(mocks.locationReplace).not.toHaveBeenCalled();
    expect(container.querySelector("footer")?.textContent).toBe("เสร็จสิ้น");
    expect(container.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("header h2"));
    expect(copy).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    await act(async () => getButton("คัดลอกลิงก์").click());
    expect(copy).toHaveBeenCalledWith(handoffUrl);
    await act(async () => getButton("แชร์ลิงก์").click());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: handoffUrl }));

    click("footer button");
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("button"));
    click("button");
    expect(container.querySelector("img, input[readonly]")).toBeNull();
    expect(container.textContent).not.toContain("ส่งลิงก์แล้ว");
    expect(container.querySelector<HTMLInputElement>('input[value="ONLINE"]')?.checked).toBe(true);
  });

  it("keeps the ADMIN identifier as account confirmation and requires an independent identity check", async () => {
    mocks.issue.mockResolvedValue({
      status: "ISSUED",
      mode: "ONLINE",
      handoffUrl: `https://demi.example/recover#${"a".repeat(43)}`,
      expiresAt: "2026-10-23T03:00:00.000Z",
    });
    await renderControl("ADMIN_ALLOWED", "platform_admin");
    click("button");

    expect(container.textContent).toContain("ผู้ดูแลระบบ DEMI ที่ออกลิงก์ต้องตรวจสอบตัวตนของผู้ดูแลระบบ DEMI ผู้รับอย่างเป็นอิสระก่อน");
    expect(container.textContent).not.toContain("เวชระเบียนของโรงพยาบาล");
    expect(container.querySelector('input[name="verificationMethod"]')).toBeNull();

    click('input[name="mode"][value="ONLINE"]');
    await submitForm();

    expect(container.textContent).toContain("รหัสเข้าสู่ระบบของผู้ดูแลระบบ DEMI ที่ลงทะเบียนไว้");
    expect(container.textContent).toContain("ห้ามส่งต่อให้ผู้อื่น");
    expect(mocks.issue).toHaveBeenCalledWith({
      targetKind: "platform_admin",
      hospitalId: null,
      relationshipId: null,
      targetUserId: "33333333-3333-4333-8333-333333333333",
      mode: "ONLINE",
    });
    expect(container.textContent).not.toContain("โรงพยาบาลตัวอย่าง");
  });

  it("hands the signed-out device straight to the in-person reset page without a copyable link, and hides actions outside OWNER scope", async () => {
    mocks.issue.mockResolvedValue({ status: "ISSUED", mode: "IN_PERSON", handoffUrl: `https://demi.example/recover#${"y".repeat(43)}`, expiresAt: "2026-10-22T03:15:00.000Z" });
    await renderControl();
    click("button");
    await submitForm();

    expect(mocks.locationReplace).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(`https://demi.example/recover#${"y".repeat(43)}`);
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(findButton("บันทึกรูป QR Code")).toBeUndefined();
    expect(findButton("แชร์รูป QR Code")).toBeUndefined();
    expect(container.querySelector('a[href*="/recover#"]')).toBeNull();
    expect(container.querySelector("input[readonly]")).toBeNull();
    expect(container.textContent).not.toContain("คัดลอกลิงก์");
    expect(container.textContent).toContain("ส่งอุปกรณ์ให้เจ้าของบัญชี");

    await act(async () => root.render(createElement(MediatedPasswordResetControl, {
      hospitalId: "11111111-1111-4111-8111-111111111111",
      hospitalName: "โรงพยาบาลตัวอย่าง",
      relationshipId: "22222222-2222-4222-8222-222222222222",
      targetKind: "patient",
      targetName: "ผู้ใช้ตัวอย่าง",
      eligibility: "ADMIN_REQUIRED",
    })));
    expect(container.textContent).toContain("ต้องให้ผู้ดูแลระบบ DEMI ดำเนินการ");
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("ONLINE password recovery QR actions", () => {
  beforeEach(async () => {
    mocks.issue.mockResolvedValue(onlineResult);
    await renderControl();
    click("button");
  });

  it("downloads the generated PNG exactly once per click with a fixed filename after the QR is ready", async () => {
    const pending = Promise.withResolvers<string>();
    mocks.qr.mockReturnValue(pending.promise);
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("demi-password-reset-qr.png");
      expect(this.href).toBe(qrDataUrl);
    });
    expect(findButton("บันทึกรูป QR Code")).toBeUndefined();
    await issueOnline();

    const save = getButton("บันทึกรูป QR Code");
    expect(save.disabled).toBe(true);
    save.focus();
    expect(document.activeElement).not.toBe(save);
    act(() => save.click());
    expect(download).not.toHaveBeenCalled();

    await act(async () => pending.resolve(qrDataUrl));
    expect(save.disabled).toBe(false);
    save.focus();
    expect(document.activeElement).toBe(save);
    act(() => save.click());
    expect(download).toHaveBeenCalledOnce();
    expect(container.querySelector("a[download]")).toBeNull();
    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.qr).toHaveBeenCalledExactlyOnceWith(onlineResult.handoffUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" });
  });

  it.each(["rejected", "invalid"] as const)("keeps link actions usable when the PNG is %s", async (outcome) => {
    if (outcome === "rejected") mocks.qr.mockRejectedValue(new Error("QR generation failed"));
    else mocks.qr.mockResolvedValue("data:image/png;base64,AA==");
    await issueOnline();

    expect(getButton("บันทึกรูป QR Code").disabled).toBe(true);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("ไม่สามารถสร้างรูป QR Code ได้ กรุณาใช้ปุ่มคัดลอกลิงก์แทน");
    await act(async () => getButton("คัดลอกลิงก์").click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(onlineResult.handoffUrl);
  });

  it("shares only the PNG file with its safe name, and treats cancellation as a neutral outcome", async () => {
    enableFileShare();
    share.mockRejectedValueOnce(new DOMException("Share cancelled", "AbortError"));
    await issueOnline();
    expect(share).not.toHaveBeenCalled();
    const shareImage = getButton("แชร์รูป QR Code");
    await act(async () => shareImage.click());
    const file: unknown = share.mock.calls[0]?.[0].files[0];
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ type: "image/png", name: "demi-password-reset-qr.png" });
    expect(canShare).toHaveBeenCalledExactlyOnceWith({ files: [file] });
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: "QR Code สำหรับรีเซ็ตรหัสผ่าน DEMI", files: [file] });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(shareImage.disabled).toBe(false);
    expect(mocks.issue).toHaveBeenCalledOnce();

    share.mockRejectedValueOnce(new DOMException("Share unavailable", "NotAllowedError"));
    await act(async () => shareImage.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("แชร์รูป QR Code ไม่สำเร็จ");
    expect(getButton("บันทึกรูป QR Code").disabled).toBe(false);
  });

  it("keeps download and existing link sharing when canShare rejects files", async () => {
    Object.defineProperty(navigator, "canShare", { value: canShare });
    await issueOnline();
    expect(findButton("แชร์รูป QR Code")).toBeUndefined();
    expect(getButton("บันทึกรูป QR Code").disabled).toBe(false);
    await act(async () => getButton("แชร์ลิงก์").click());
    expect(share).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: onlineResult.handoffUrl }));
  });

  it("ignores an old QR promise after close and reissuance, with link share still falling back to copy", async () => {
    const oldQr = Promise.withResolvers<string>();
    const currentQr = Promise.withResolvers<string>();
    mocks.qr.mockReturnValueOnce(oldQr.promise).mockReturnValueOnce(currentQr.promise);
    Object.defineProperty(navigator, "share", { value: undefined });
    await issueOnline();
    click("footer button");
    click("button");
    expect(findButton("บันทึกรูป QR Code")).toBeUndefined();

    mocks.issue.mockResolvedValue({ ...onlineResult, handoffUrl: "https://demi.example/recover#synthetic-new-token" });
    await submitForm();
    await act(async () => oldQr.resolve(qrDataUrl));
    expect(getButton("บันทึกรูป QR Code").disabled).toBe(true);
    expect(container.querySelector("img")).toBeNull();
    await act(async () => currentQr.resolve(qrDataUrl));
    expect(getButton("บันทึกรูป QR Code").disabled).toBe(false);
    expect(findButton("แชร์รูป QR Code")).toBeUndefined();
    await act(async () => getButton("แชร์ลิงก์").click());
    expect(copy).toHaveBeenCalledExactlyOnceWith("https://demi.example/recover#synthetic-new-token");
  });
});
