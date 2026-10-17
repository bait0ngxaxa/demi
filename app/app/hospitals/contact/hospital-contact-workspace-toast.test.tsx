// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info },
}));
vi.mock("@/modules/hospital-contact/transport/server-actions", () => ({
  updateHospitalContactAction: mocks.update,
  readHospitalContactForOwnerAction: mocks.read,
}));

import type { HospitalContactMutationActionState } from "@/modules/hospital-contact/transport/action-state";
import type { HospitalContactEditorProjection } from "@/modules/hospital-contact/types/hospital-contact-projections";
import { HospitalContactWorkspace } from "./hospital-contact-workspace";

const HOSPITAL_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_HOSPITAL_ID = "22222222-2222-4222-8222-222222222222";
const PHONE = "02-123-4567";
const ADDRESS = "99 ถนนตัวอย่าง เขตทดสอบ";
const hospital = { id: HOSPITAL_ID, hospitalCode: "H-001", name: "โรงพยาบาลทดสอบ" };

function contact(
  overrides: Partial<HospitalContactEditorProjection> = {},
  hospitalId = HOSPITAL_ID,
): HospitalContactEditorProjection {
  return {
    hospital: { ...hospital, id: hospitalId },
    addressText: null,
    phoneNumber: null,
    expectedUpdatedAt: null,
    ...overrides,
  };
}

function saved(
  outcome: "CREATED" | "UPDATED" | "NOOP",
  hospitalId = HOSPITAL_ID,
): HospitalContactMutationActionState {
  return {
    status: "SUCCESS",
    result: {
      outcome,
      contact: contact({ addressText: ADDRESS, phoneNumber: PHONE, expectedUpdatedAt: "2026-10-02T00:00:00.000Z" }, hospitalId),
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

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

function render(): void {
  act(() =>
    root.render(
      createElement(HospitalContactWorkspace, {
        hospitals: [hospital],
        selectedHospitalId: HOSPITAL_ID,
        contact: contact(),
      }),
    ),
  );
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillDraft(): Promise<void> {
  const address = container.querySelector<HTMLTextAreaElement>("#hospital-contact-address");
  const phone = container.querySelector<HTMLInputElement>("#hospital-contact-phone");
  if (!address || !phone) throw new Error("Missing contact fields");
  await act(async () => {
    setValue(address, ADDRESS);
    setValue(phone, PHONE);
  });
}

function submit(): void {
  const form = container.querySelector("form");
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !button) throw new Error("Missing contact form");
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

describe("Hospital Contact Toasts", () => {
  it.each([
    ["CREATED", "บันทึกข้อมูลติดต่อโรงพยาบาลแล้ว", "บันทึกข้อมูลติดต่อแล้ว"],
    ["UPDATED", "ปรับปรุงข้อมูลติดต่อโรงพยาบาลแล้ว", "ปรับปรุงข้อมูลติดต่อแล้ว"],
  ] as const)("announces a confirmed %s once and keeps the inline Alert", async (outcome, toast, inline) => {
    const pending = deferred<HospitalContactMutationActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();
    await fillDraft();

    await act(async () => submit());
    expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(saved(outcome));
      await pending.promise;
    });

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith(toast);
    expect(container.textContent).toContain(inline);
    expect(JSON.stringify(toastCalls())).not.toContain(PHONE);
    expect(JSON.stringify(toastCalls())).not.toContain(ADDRESS);
    const submitted = mocks.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted.addressText).toBe(ADDRESS);
    expect(submitted.hospitalId).toBe(HOSPITAL_ID);
  });

  it("gives a confirmed no-op no Toast and keeps the explanation inline", async () => {
    mocks.update.mockResolvedValueOnce(saved("NOOP"));
    render();
    await fillDraft();

    await act(async () => submit());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ข้อมูลติดต่อเป็นปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง");
  });

  it("warns for a confirmed conflict while preserving the draft and requiring reconciliation", async () => {
    mocks.update.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFLICT",
      message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันเพื่อตรวจสอบ",
    });
    render();
    await fillDraft();

    await act(async () => submit());

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ตรวจสอบข้อมูลล่าสุดก่อนบันทึกอีกครั้ง");
    expect(container.textContent).toContain("แบบร่างเดิมที่ยังไม่ได้ยืนยัน");
    expect(container.textContent).toContain(ADDRESS);
    expect(container.textContent).toContain(PHONE);
  });

  it("reports a confirmed forbidden response as an error and shows the access Alert", async () => {
    mocks.update.mockResolvedValueOnce({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูลติดต่อของโรงพยาบาลนี้",
    });
    render();
    await fillDraft();

    await act(async () => submit());

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์แก้ไขข้อมูลติดต่อโรงพยาบาล");
    expect(container.textContent).toContain("ไม่สามารถแสดงข้อมูลของโรงพยาบาลนี้ได้");
    expect(container.textContent).not.toContain(PHONE);
  });

  it("keeps validation errors inline with no Toast", async () => {
    mocks.update.mockResolvedValueOnce({
      status: "ERROR",
      code: "VALIDATION",
      message: "กรุณาตรวจสอบข้อมูลติดต่อที่กรอก",
      fieldErrors: { phoneNumber: "ตรวจสอบหมายเลขโทรศัพท์และข้อความที่กรอกอีกครั้ง" },
    });
    render();
    await fillDraft();

    await act(async () => submit());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("กรุณาตรวจสอบข้อมูลติดต่อที่กรอก");
    expect(container.textContent).toContain("ตรวจสอบหมายเลขโทรศัพท์และข้อความที่กรอกอีกครั้ง");
  });

  it("treats UNCONFIRMED as unknown: no Toast, draft preserved, reconciliation required, no resubmission", async () => {
    mocks.update.mockResolvedValueOnce({ status: "UNCONFIRMED" });
    render();
    await fillDraft();

    await act(async () => submit());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ยังยืนยันผลการบันทึกไม่ได้");
    expect(container.textContent).toContain("ระบบจะไม่ส่งคำขอเดิมซ้ำให้อัตโนมัติ");
    expect(container.textContent).toContain(ADDRESS);
    await settle();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("keeps a returned UNAVAILABLE without a Toast and with the draft intact", async () => {
    mocks.update.mockResolvedValueOnce({
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ระบบไม่พร้อมบันทึกข้อมูลติดต่อ กรุณาลองใหม่ภายหลัง",
    });
    render();
    await fillDraft();

    await act(async () => submit());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ข้อมูลที่กรอกยังอยู่ในแบบร่าง");
    expect(container.querySelector<HTMLTextAreaElement>("#hospital-contact-address")?.value).toBe(ADDRESS);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("treats a thrown request as unconfirmed with no Toast and no automatic retry", async () => {
    mocks.update.mockRejectedValueOnce(new TypeError("private server failure"));
    render();
    await fillDraft();

    await act(async () => submit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ยังยืนยันผลการบันทึกไม่ได้");
    expect(container.textContent).not.toContain("private server failure");
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("drops a rapid duplicate submission before it reaches the Server Action", async () => {
    const pending = deferred<HospitalContactMutationActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();
    await fillDraft();

    await act(async () => {
      submit();
      submit();
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve(saved("UPDATED"));
      await pending.promise;
    });

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("does not replay the Toast after a rerender", async () => {
    mocks.update.mockResolvedValueOnce(saved("UPDATED"));
    render();
    await fillDraft();
    await act(async () => submit());

    render();
    render();

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("does not treat a success for another Hospital as confirmation", async () => {
    mocks.update.mockResolvedValueOnce(saved("UPDATED", OTHER_HOSPITAL_ID));
    render();
    await fillDraft();

    await act(async () => submit());

    expect(toastCalls()).toHaveLength(0);
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<HospitalContactMutationActionState>();
    mocks.update.mockReturnValueOnce(pending.promise);
    render();
    await fillDraft();
    await act(async () => {
      submit();
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      pending.resolve(saved("UPDATED"));
      await pending.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    root = createRoot(container);
  });

  it("gives the read-only reconciliation lookup no Toast", async () => {
    mocks.update.mockResolvedValueOnce({ status: "UNCONFIRMED" });
    mocks.read.mockResolvedValueOnce({ status: "SUCCESS", contact: contact({ addressText: ADDRESS, phoneNumber: PHONE, expectedUpdatedAt: "v2" }) });
    render();
    await fillDraft();
    await act(async () => submit());

    const load = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("โหลดข้อมูลปัจจุบัน"),
    );
    if (!load) throw new Error("Missing reconciliation button");
    await act(async () => load.click());
    await settle();

    expect(mocks.read).toHaveBeenCalledOnce();
    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ข้อมูลปัจจุบันจากโรงพยาบาล");
  });
});
