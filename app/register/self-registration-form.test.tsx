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
  it("submits a 13-digit synthetic ID so the server can apply the deployment policy", async () => {
    vi.stubEnv("DEMI_DEPLOYMENT_STAGE", "development");
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
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ outcome: "FOUND", capability: "single-use-capability", maskedName: "สม*** ใจ***" }),
    });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ outcome: "NOT_FOUND", message: "ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ" }),
    }));
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ");
    expect(container.textContent).not.toContain("ALREADY_ACTIVE");
  });

  it("offers login and recovery links for an already active account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ outcome: "ALREADY_ACTIVE", message: "บัญชีนี้เปิดใช้งานแล้ว" }),
    }));
    await render();
    const idInput = container.querySelector<HTMLInputElement>("#registration-national-id");
    if (!idInput) throw new Error("Missing National ID input");
    setInput(idInput, nationalId());
    await submitForm();

    expect(container.textContent).toContain("บัญชีนี้เปิดใช้งานแล้ว");
    expect(container.textContent).toContain("หากไม่ใช่คุณ กรุณาติดต่อโรงพยาบาลทันที");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector('a[href="/recover"]')).not.toBeNull();
  });
});
