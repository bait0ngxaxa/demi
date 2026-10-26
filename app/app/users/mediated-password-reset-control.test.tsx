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

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
});

beforeEach(() => {
  mocks.issue.mockReset();
  mocks.qr.mockReset().mockResolvedValue("data:image/png;base64,rec1-test");
  mocks.locationReplace.mockReset();
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
});

async function renderControl(
  eligibility: "OWNER_ELIGIBLE" | "ADMIN_ALLOWED" | "ADMIN_REQUIRED" = "OWNER_ELIGIBLE",
  targetKind: "patient" | "platform_admin" = "patient",
): Promise<void> {
  await act(async () => {
    root.render(createElement(MediatedPasswordResetControl, {
      hospitalId: "11111111-1111-4111-8111-111111111111",
      hospitalName: "โรงพยาบาลตัวอย่าง",
      relationshipId: "22222222-2222-4222-8222-222222222222",
      ...(targetKind === "platform_admin" ? { relationshipId: null, targetUserId: "33333333-3333-4333-8333-333333333333" } : {}),
      targetKind,
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
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing reset form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("OWNER/ADMIN-mediated password reset handoff", () => {
  it("requires a recorded verification method and shows the online single-use QR and link", async () => {
    mocks.issue.mockResolvedValue({ status: "ISSUED", mode: "ONLINE", handoffUrl: `https://demi.example/recover#${"x".repeat(43)}`, expiresAt: "2026-10-23T03:00:00.000Z" });
    await renderControl();

    click("button");
    const issueButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "ออกลิงก์รีเซ็ต");
    expect(issueButton?.disabled).toBe(true);
    expect(container.textContent).toContain("ห้ามใช้หมายเลขที่ผู้ขอแจ้ง");

    click('input[name="verificationMethod"][value="CALLBACK_PHONE_ON_HOSPITAL_RECORD"]');
    click('input[name="mode"][value="ONLINE"]');
    expect(issueButton?.disabled).toBe(false);
    await submitForm();

    expect(mocks.issue).toHaveBeenCalledWith({
      hospitalId: "11111111-1111-4111-8111-111111111111",
      relationshipId: "22222222-2222-4222-8222-222222222222",
      targetKind: "patient",
      mode: "ONLINE",
      verificationMethod: "CALLBACK_PHONE_ON_HOSPITAL_RECORD",
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.qr).toHaveBeenCalledWith(expect.stringContaining("/recover#"), expect.any(Object));
    expect(container.textContent).toContain("ลิงก์ใช้ได้ครั้งเดียว");
    expect(container.querySelector('img[alt="QR code สำหรับเปิดลิงก์รีเซ็ตรหัสผ่าน"]')).not.toBeNull();
    expect(container.querySelector('input[readonly][value*="/recover#"]')).not.toBeNull();
    expect(container.textContent).toContain("คัดลอกลิงก์");
    expect(container.textContent).toContain("แชร์ลิงก์");
    expect(mocks.locationReplace).not.toHaveBeenCalled();
  });

  it("keeps the ADMIN identifier as account confirmation and requires an independent recorded identity check", async () => {
    mocks.issue.mockResolvedValue({
      status: "ISSUED",
      mode: "ONLINE",
      handoffUrl: `https://demi.example/recover#${"a".repeat(43)}`,
      expiresAt: "2026-10-23T03:00:00.000Z",
    });
    await renderControl("ADMIN_ALLOWED", "platform_admin");
    click("button");

    expect(container.textContent).toContain("ตรวจสอบตัวตนของ ADMIN ผู้รับอย่างเป็นอิสระก่อน");
    expect(container.textContent).toContain("ห้ามใช้หมายเลขที่ผู้ขอแจ้ง");

    click('input[name="verificationMethod"][value="VIDEO_CALL_FACE_AND_ID_CARD"]');
    click('input[name="mode"][value="ONLINE"]');
    await submitForm();

    expect(container.textContent).toContain("ตัวระบุเข้าสู่ระบบ ADMIN ที่ลงทะเบียนไว้");
    expect(container.textContent).toContain("ห้ามส่งต่อให้ผู้อื่น");
  });

  it("hands the signed-out device straight to the in-person reset page without a copyable link, and hides actions outside OWNER scope", async () => {
    mocks.issue.mockResolvedValue({ status: "ISSUED", mode: "IN_PERSON", handoffUrl: `https://demi.example/recover#${"y".repeat(43)}`, expiresAt: "2026-10-22T03:15:00.000Z" });
    await renderControl();
    click("button");
    click('input[name="verificationMethod"][value="IN_PERSON_ID_CARD"]');
    await submitForm();

    expect(mocks.locationReplace).toHaveBeenCalledOnce();
    expect(mocks.locationReplace).toHaveBeenCalledWith(`https://demi.example/recover#${"y".repeat(43)}`);
    expect(mocks.qr).not.toHaveBeenCalled();
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
    expect(container.textContent).toContain("ต้องให้ผู้ดูแลระบบดำเนินการ");
    expect(container.querySelector("button")).toBeNull();
  });
});
