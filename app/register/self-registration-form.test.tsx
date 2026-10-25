// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SelfRegistrationForm } from "./self-registration-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function nationalId(): string {
  const firstTwelveDigits = "123456789012";
  const weightedSum = Array.from(firstTwelveDigits, Number)
    .reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  return `${firstTwelveDigits}${(11 - weightedSum % 11) % 10}`;
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function setInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing input value setter");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(<SelfRegistrationForm />);
    await Promise.resolve();
  });
}

async function submitForm(): Promise<void> {
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing self-registration form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("public self-registration form", () => {
  it("marks an invalid national ID beside the field and keeps it editable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, "123");
    await submitForm();

    expect(idInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = idInput.getAttribute("aria-describedby");
    expect(describedBy && container.querySelector(`#${describedBy}`)?.textContent).toContain("13 หลัก");
    expect(document.activeElement).toBe(idInput);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a 13-digit synthetic ID so the server can apply the deployment policy", async () => {
    vi.stubEnv("DEMI_ALLOW_TEST_NATIONAL_IDS", "true");
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, "5".repeat(13));
    await submitForm();

    expect(container.textContent).not.toContain("กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/self-registration/lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nationalId: "5".repeat(13) }),
      }),
    );
  });

  it("shows server-side checksum validation when the deployment keeps strict validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, "5".repeat(13));
    await submitForm();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง");
  });

  it("shows only a masked name before password entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("สม*** ใจ***");
    expect(container.textContent).toContain("ยืนยันว่าชื่อที่แสดงเป็นชื่อของฉัน");
    expect(container.textContent).not.toContain("โรงพยาบาลทดสอบ");
    expect(container.textContent).not.toContain("HN-");
    expect(container.textContent).not.toContain("เบอร์โทร");
    expect(container.textContent).not.toContain("สมชาย ใจดี");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/self-registration/lookup", expect.objectContaining({ cache: "no-store", referrerPolicy: "no-referrer" }));
  });

  it("shows the same not-found wording returned by the public contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ outcome: "NOT_FOUND", message: "ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ" }),
    ));
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ");
    expect(container.textContent).not.toContain("ALREADY_ACTIVE");
    expect(container.textContent).not.toContain("โรงพยาบาลทดสอบ");
    expect(container.textContent).not.toContain("HN-");
    expect(container.textContent).not.toContain("อสม.");
  });

  it("offers a retry action for rate limiting and service outages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "RETRY", message: "ลองใหม่ภายหลัง" }, 429))
      .mockResolvedValueOnce(response({ outcome: "NOT_FOUND", message: "ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ" }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("กรุณารอสักครู่แล้วลองอีกครั้ง");
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("ลองตรวจสอบอีกครั้ง"))?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ nationalId: nationalId() }),
    }));
    expect(container.textContent).toContain("ยังไม่พบข้อมูลสำหรับลงทะเบียน");
  });

  it("shows a safe retry action when the national ID lookup cannot connect", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("ระบบยังไม่พร้อมตรวจสอบข้อมูลในขณะนี้");
    expect(container.textContent).not.toContain("RETRY");
    expect(container.querySelector('button[type="button"]')?.textContent).toContain("ลองตรวจสอบอีกครั้ง");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows password requirements and places a confirmation mismatch beside its field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("ใช้รหัสผ่าน 12–128 ตัวอักษร");
    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-different-password");
    await submitForm();

    expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    const describedBy = confirmation.getAttribute("aria-describedby");
    expect(describedBy && container.querySelector(`#${describedBy}`)?.textContent).toContain("รหัสผ่านไม่ตรงกัน");
    expect(document.activeElement).toBe(confirmation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLInputElement>("#registration-password")?.value).toBe("a-valid-password");
  });

  it("shows a durable completion only after a successful response and clears the form", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockResolvedValueOnce(response({ status: "SUCCESS" }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    expect(container.textContent).toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
    expect(container.textContent).toContain("บัญชีของคุณพร้อมใช้งานแล้ว");
    expect(container.querySelector('a[href="/login"]')?.textContent).toContain("ไปหน้าเข้าสู่ระบบ");
    expect(container.querySelector("form")).toBeNull();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("off");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.activeElement).toBe(status);
    expect(container.textContent).not.toContain("single-use-capability");
    expect(container.textContent).not.toContain("a-valid-password");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        token: "single-use-capability",
        nationalId: nationalId(),
        password: "a-valid-password",
        passwordConfirmation: "a-valid-password",
        nameConfirmed: true,
      }),
    }));
  });

  it("treats a lost completion response as unconfirmed and prevents a duplicate request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    expect(container.textContent).toContain("ยังยืนยันผลการลงทะเบียนไม่ได้");
    expect(container.textContent).toContain("กรุณาอย่าส่งคำขอเดิมซ้ำ");
    expect(container.textContent).not.toContain("ลงทะเบียนสำเร็จ");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a focused generic validation summary and preserves correctable values on HTTP 400", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockResolvedValueOnce(response({ status: "ERROR", message: "internal detail" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    const summary = container.querySelector('[role="alert"]');
    expect(summary?.textContent).toContain("ตรวจสอบข้อมูลก่อนส่งอีกครั้ง");
    expect(summary?.textContent).toContain("ตรวจสอบข้อมูลที่กรอกแล้วลองอีกครั้ง");
    expect(summary?.textContent).not.toContain("internal detail");
    expect(summary?.getAttribute("aria-live")).toBe("off");
    expect(document.activeElement).toBe(summary);
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>("#registration-name-confirmed")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#registration-password")?.value).toBe("a-valid-password");
    expect(container.querySelector<HTMLInputElement>("#registration-password-confirmation")?.value).toBe("a-valid-password");
    expect(container.querySelector<HTMLInputElement>("#registration-password")?.getAttribute("aria-invalid")).toBeNull();
  });

  it("treats a success body paired with HTTP 400 as unconfirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockResolvedValueOnce(response({ status: "SUCCESS" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    expect(container.textContent).toContain("ยังยืนยันผลการลงทะเบียนไม่ได้");
    expect(container.textContent).not.toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
    expect(container.querySelector("form")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not claim success for a rejected completion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockResolvedValueOnce(response({ status: "ERROR", message: "not available" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    expect(container.textContent).toContain("ไม่สามารถลงทะเบียนได้");
    expect(container.textContent).not.toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
    expect(container.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[role="alert"]'));
    expect(container.querySelector('button[type="button"]')?.textContent).toContain("เริ่มตรวจสอบใหม่");
  });

  it("treats a malformed completion response as unconfirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("invalid response"); },
      });
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    const checkbox = container.querySelector<HTMLInputElement>("#registration-name-confirmed");
    const password = container.querySelector<HTMLInputElement>("#registration-password");
    const confirmation = container.querySelector<HTMLInputElement>("#registration-password-confirmation");
    if (!checkbox || !password || !confirmation) throw new Error("Missing password setup fields");
    await act(async () => checkbox.click());
    setInput(password, "a-valid-password");
    setInput(confirmation, "a-valid-password");
    await submitForm();

    expect(container.textContent).toContain("ยังยืนยันผลการลงทะเบียนไม่ได้");
    expect(container.textContent).not.toContain("ตั้งรหัสผ่านสำเร็จแล้ว");
    expect(container.querySelector("form")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers login and recovery links for an already active account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response({ outcome: "ALREADY_ACTIVE", message: "บัญชีนี้เปิดใช้งานแล้ว" }),
    ));
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("บัญชีนี้เปิดใช้งานแล้ว");
    expect(container.textContent).toContain("ติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน");
    expect(document.activeElement).toBe(container.querySelector('[role="status"]'));
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector('a[href="/recover"]')).not.toBeNull();
  });
});
