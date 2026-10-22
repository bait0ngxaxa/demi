// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staffAction: vi.fn(),
  osmAction: vi.fn(),
  remoteAction: vi.fn(),
  assistedAction: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerReplace, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info } }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: mocks.staffAction,
  provisionOsmAction: mocks.osmAction,
  regenerateWorkforceActivationAction: mocks.remoteAction,
  startAssistedWorkforceActivationAction: mocks.assistedAction,
}));

import { WorkforceNewWorkspace } from "./workforce-new-workspace";

const HOSPITAL_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "private-one-time-token";
const ACTIVATION_URL = `https://demi.example/activate/workforce#${TOKEN}`;
const hospital = { id: HOSPITAL_ID, name: "โรงพยาบาลทดสอบ", hospitalCode: "H-001", scope: "OWNER" as const };

function provisionResult(accountStatus: "PROVISIONED" | "ACTIVE" | "INVITED" = "PROVISIONED") {
  const active = accountStatus !== "PROVISIONED";
  return {
    status: "SUCCESS",
    result: {
      kind: "HOSPITAL_MEMBER",
      userId: USER_ID,
      hospitalId: HOSPITAL_ID,
      relationshipId: RELATIONSHIP_ID,
      accountStatus,
      relationshipStatus: active ? accountStatus === "ACTIVE" ? "ACTIVE" : "INVITED" : "PROVISIONED",
      activationRequired: !active,
      activationToken: null,
      activationUrl: null,
      activationExpiresAt: null,
      activationMode: null,
      reusedExistingUser: active,
      idempotent: false,
    },
  };
}

function activationResult(mode: "REMOTE" | "ASSISTED" = "REMOTE") {
  return {
    status: "SUCCESS",
    result: {
      userId: USER_ID,
      hospitalId: HOSPITAL_ID,
      kind: "HOSPITAL_MEMBER",
      activationToken: TOKEN,
      activationUrl: ACTIVATION_URL,
      activationExpiresAt: "2026-10-23T00:00:00.000Z",
      activationMode: mode,
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.staffAction.mockReset().mockResolvedValue(provisionResult());
  mocks.osmAction.mockReset().mockResolvedValue({ ...provisionResult(), result: { ...provisionResult().result, kind: "OSM" } });
  mocks.remoteAction.mockReset().mockResolvedValue(activationResult());
  mocks.assistedAction.mockReset().mockResolvedValue(activationResult("ASSISTED"));
  mocks.routerPush.mockReset();
  mocks.routerReplace.mockReset();
  mocks.success.mockReset();
  mocks.warning.mockReset();
  mocks.error.mockReset();
  mocks.info.mockReset();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(initialKind: "HOSPITAL_MEMBER" | "OSM" | null = null, initialStep: 1 | 2 | 3 = 1): void {
  act(() => root.render(
    <WorkforceNewWorkspace hospitals={[hospital]} selectedHospitalId={HOSPITAL_ID} initialKind={initialKind} initialStep={initialStep} />,
  ));
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing native value setter");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function inputFor(label: string): HTMLInputElement {
  const found = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find((input) => input.type === "text" && input.closest("label")?.textContent?.includes(label));
  if (!found) throw new Error(`Missing input: ${label}`);
  return found;
}

async function stepToDelivery(kind: "HOSPITAL_MEMBER" | "OSM" = "HOSPITAL_MEMBER"): Promise<void> {
  const typeRadio = container.querySelector<HTMLInputElement>(`input[name="workforce-kind"][value="${kind}"]`);
  if (!typeRadio) throw new Error(`Missing kind: ${kind}`);
  await act(async () => typeRadio.click());
  await act(async () => button("ถัดไป").click());
  await act(async () => {
    setValue(inputFor("ชื่อ"), "สมชาย");
    setValue(inputFor("นามสกุล"), "บุคลากร");
    setValue(inputFor("เลขบัตรประชาชน"), "1000000000009");
    if (kind === "HOSPITAL_MEMBER") {
      const profession = Array.from(container.querySelectorAll<HTMLSelectElement>("select")).find((select) => select.closest("label")?.textContent?.includes("วิชาชีพ"));
      if (!profession) throw new Error("Missing profession select");
      setValue(profession, "NURSE");
    }
  });
  await act(async () => button("ถัดไป").click());
}

async function chooseDelivery(delivery: "REMOTE" | "ASSISTED" | "LATER"): Promise<void> {
  const radio = container.querySelector<HTMLInputElement>(`input[name="delivery"][value="${delivery}"]`);
  if (!radio) throw new Error(`Missing delivery option: ${delivery}`);
  await act(async () => radio.click());
}

async function submitDelivery(): Promise<void> {
  await act(async () => button("ยืนยันและดำเนินการ").click());
}

describe("workforce three-step onboarding", () => {
  it("offers exactly the three agreed delivery choices", async () => {
    render();
    await stepToDelivery();

    expect(container.querySelectorAll('input[name="delivery"]')).toHaveLength(3);
    expect(container.textContent).toContain("ส่งคำเชิญ (ลิงก์ / QR)");
    expect(container.textContent).toContain("ช่วยตั้งรหัสผ่านบนเครื่องนี้");
    expect(container.textContent).toContain("ทำภายหลัง");
    expect(container.textContent).not.toContain("สมัครด้วยตนเอง");
  });

  it("provisions first, then issues REMOTE and shows the server-built handoff", async () => {
    const response = deferred<ReturnType<typeof provisionResult>>();
    mocks.staffAction.mockReturnValueOnce(response.promise);
    render();
    await stepToDelivery();
    await chooseDelivery("REMOTE");
    await submitDelivery();

    expect(mocks.staffAction).toHaveBeenCalledOnce();
    const submitted = mocks.staffAction.mock.calls[0]?.[1] as FormData | undefined;
    expect(submitted?.get("deferActivation")).toBe("true");
    expect(mocks.remoteAction).not.toHaveBeenCalled();

    await act(async () => { response.resolve(provisionResult()); await response.promise; });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(mocks.assistedAction).not.toHaveBeenCalled();
    expect(mocks.staffAction.mock.invocationCallOrder[0]).toBeLessThan(mocks.remoteAction.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER);
    expect(container.textContent).toContain(ACTIVATION_URL);
    expect(container.textContent).toContain("ส*** บ***");
    expect(container.textContent).toContain("ใช้ได้ครั้งเดียว · ห้ามส่งต่อ");
    expect(container.textContent).toContain("เสร็จแล้ว");
    expect(window.location.search).not.toContain(TOKEN);
    expect(window.sessionStorage.length).toBe(0);
    expect([...mocks.success.mock.calls].flat().join(" ")).not.toContain(TOKEN);
  });

  it("provisions before starting ASSISTED handoff", async () => {
    render();
    await stepToDelivery();
    await chooseDelivery("ASSISTED");
    await submitDelivery();

    expect(mocks.staffAction).toHaveBeenCalledOnce();
    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("พร้อมช่วยเปิดใช้งานบนเครื่องนี้");
    expect(container.textContent).toContain(ACTIVATION_URL);
  });

  it("does not issue any credential when the OWNER chooses ทำภายหลัง", async () => {
    render();
    await stepToDelivery("OSM");
    await chooseDelivery("LATER");
    await submitDelivery();

    expect(mocks.osmAction).toHaveBeenCalledOnce();
    expect(mocks.staffAction).not.toHaveBeenCalled();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
    expect(mocks.assistedAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("เพิ่มรายชื่อแล้ว · รอเปิดใช้งาน");
  });

  it("keeps the existing-account acceptance message and does not issue a credential", async () => {
    mocks.staffAction.mockResolvedValueOnce(provisionResult("ACTIVE"));
    render();
    await stepToDelivery();
    await chooseDelivery("REMOTE");
    await submitDelivery();

    expect(container.textContent).toContain("ส่งคำเชิญแล้ว ผู้ใช้ต้องเข้าสู่ระบบเพื่อยอมรับ");
    expect(mocks.remoteAction).not.toHaveBeenCalled();
    expect(mocks.assistedAction).not.toHaveBeenCalled();
  });

  it("keeps an unknown provision outcome scoped to this wizard and does not continue issuance", async () => {
    mocks.staffAction.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อม" });
    render();
    await stepToDelivery();
    await submitDelivery();

    expect(mocks.staffAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ผลการเพิ่มอาจบันทึกแล้ว");
    expect(button("ยืนยันและดำเนินการ").disabled).toBe(true);
  });

  it("shows the configured-origin failure as a known setup error, not an unknown issuance", async () => {
    mocks.remoteAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFIGURATION",
      message: "ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    });
    render();
    await stepToDelivery();
    await submitDelivery();

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน");
    expect(container.textContent).not.toContain("ผลการออกลิงก์ไม่ได้");
    expect(container.textContent).not.toContain(ACTIVATION_URL);
  });

  it("asks before leaving an open handoff and lets the OWNER start the next person", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render();
    await stepToDelivery();
    await submitDelivery();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const addAnother = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.textContent?.includes("อีกคน"));
    if (!addAnother) throw new Error("Missing add another person link");
    expect(addAnother.getAttribute("aria-disabled")).toBeNull();
    const cancelledNavigation = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => addAnother.dispatchEvent(cancelledNavigation));
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancelledNavigation.defaultPrevented).toBe(true);
    expect(mocks.routerPush).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await act(async () => addAnother.click());
    expect(mocks.routerPush).toHaveBeenCalledWith(`/app/workforce/new?hospitalId=${HOSPITAL_ID}&step=1`);
    expect(container.textContent).toContain("เลือกประเภทบุคลากร");
    expect(container.textContent).not.toContain(ACTIVATION_URL);
  });
});
