// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remoteAction: vi.fn(),
  assistedAction: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info } }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  regenerateWorkforceActivationAction: mocks.remoteAction,
  startAssistedWorkforceActivationAction: mocks.assistedAction,
}));

import { WorkforceActivationControl } from "./[kind]/[relationshipId]/workforce-activation-control";

const HOSPITAL_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVATION_URL = "https://demi.example/activate/workforce#remote-one-time-token";

function successResult(mode: "REMOTE" | "ASSISTED" = "REMOTE") {
  return {
    status: "SUCCESS",
    result: {
      userId: USER_ID,
      hospitalId: HOSPITAL_ID,
      kind: "HOSPITAL_MEMBER",
      activationToken: "remote-one-time-token",
      activationUrl: ACTIVATION_URL,
      activationExpiresAt: "2026-10-23T00:00:00.000Z",
      activationMode: mode,
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.remoteAction.mockReset().mockResolvedValue(successResult());
  mocks.assistedAction.mockReset().mockResolvedValue(successResult("ASSISTED"));
  mocks.success.mockReset();
  mocks.warning.mockReset();
  mocks.error.mockReset();
  mocks.info.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(activationLinkUsable = false): void {
  act(() => root.render(
    <WorkforceActivationControl
      activationLinkUsable={activationLinkUsable}
      hospitalId={HOSPITAL_ID}
      kind="HOSPITAL_MEMBER"
      maskedName="ส*** บ***"
      relationshipId={RELATIONSHIP_ID}
      userId={USER_ID}
    />,
  ));
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("workforce detail activation handoff", () => {
  it("requires confirmation before replacing a still-usable link and cancels cleanly", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(true);

    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(confirm).toHaveBeenCalledWith("ลิงก์ที่ยังใช้ได้จะถูกยกเลิกและแสดงซ้ำไม่ได้ ต้องการออกลิงก์ใหม่หรือไม่");
    expect(mocks.remoteAction).not.toHaveBeenCalled();
  });

  it("shows the server URL with QR, copy/share handoff and a one-time warning", async () => {
    render(true);
    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(ACTIVATION_URL);
    expect(container.textContent).toContain("ส*** บ***");
    expect(container.textContent).toContain("ใช้ได้ครั้งเดียว · ห้ามส่งต่อ");
    expect(container.textContent).toContain("ลิงก์หมดอายุ:");
    expect(container.textContent).toContain("เสร็จแล้ว");
    expect(container.querySelector('img[alt="คิวอาร์โค้ดสำหรับเปิดใช้งาน DEMI"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="activation-link"]')).toBeNull();
    expect(container.textContent).not.toContain("ออกลิงก์ใหม่</button>");
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ออกลิงก์เปิดใช้งานใหม่แล้ว");
    expect(JSON.stringify(mocks.success.mock.calls)).not.toContain("remote-one-time-token");
  });

  it("does not duplicate a confirmed issuance Toast under Strict Mode", async () => {
    act(() => root.render(
      <StrictMode>
        <WorkforceActivationControl
          activationLinkUsable={false}
          hospitalId={HOSPITAL_ID}
          kind="HOSPITAL_MEMBER"
          maskedName="ส*** บ***"
          relationshipId={RELATIONSHIP_ID}
          userId={USER_ID}
        />
      </StrictMode>,
    ));
    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("ออกลิงก์เปิดใช้งานใหม่แล้ว");
    expect(mocks.remoteAction).toHaveBeenCalledOnce();
  });

  it("uses the assisted action and retains the activation URL returned by the server", async () => {
    render(false);
    await act(async () => button("ช่วยเปิดใช้งานบนเครื่องนี้").click());

    expect(mocks.assistedAction).toHaveBeenCalledOnce();
    expect(mocks.remoteAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("เตรียมการเปิดใช้งานแบบช่วยเหลือแล้ว");
    expect(container.textContent).toContain(ACTIVATION_URL);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not replay an unknown issuance and leaves the recovery guidance on this person", async () => {
    mocks.remoteAction.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อม" });
    render(false);
    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(mocks.remoteAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการออกลิงก์ไม่ได้");
    expect(container.textContent).toContain("โหลดรายละเอียดใหม่");
    expect(container.textContent).not.toContain(ACTIVATION_URL);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("shows a confirmed conflict inline and keeps an explicit retry available", async () => {
    mocks.remoteAction.mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "ตรวจสอบสถานะลิงก์ก่อน" });
    render();
    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(container.textContent).toContain("ตรวจสอบสถานะลิงก์ก่อน");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบสถานะลิงก์ก่อน");
    expect(container.textContent).not.toContain("โหลดรายละเอียดใหม่");
    expect(mocks.warning).toHaveBeenCalledOnce();
    expect(button("ออกลิงก์ใหม่").disabled).toBe(false);
  });

  it("treats a success for another person as unconfirmed and keeps its URL hidden", async () => {
    mocks.remoteAction.mockResolvedValueOnce({
      ...successResult(),
      result: { ...successResult().result, userId: "another-person" },
    });
    render();
    await act(async () => button("ออกลิงก์ใหม่").click());

    expect(container.textContent).toContain("ระบบยังยืนยันผลการออกลิงก์ไม่ได้");
    expect(container.textContent).not.toContain(ACTIVATION_URL);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(button("ออกลิงก์ใหม่").disabled).toBe(true);
  });

  it("guards leaving the handoff and allows the explicit finish action", async () => {
    render(false);
    await act(async () => button("ออกลิงก์ใหม่").click());
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await act(async () => button("เสร็จแล้ว").click());
    expect(container.textContent).toContain("ออกลิงก์ใหม่");
    expect(container.textContent).toContain("มีลิงก์ที่ยังใช้ได้");
    expect(container.textContent).not.toContain(ACTIVATION_URL);
  });
});
