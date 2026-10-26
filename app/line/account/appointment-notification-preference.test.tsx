// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/modules/appointments/transport/appointment-line-notification-actions", () => ({ setAppointmentLineNotificationPreferenceAction: mocks.save }));

import { AppointmentNotificationPreference } from "./appointment-notification-preference";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mocks.save.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("explicit appointment notification consent", () => {
  it.each([false, true])("reflects persisted enabled=%s without saving on mount", async (enabled) => {
    await act(async () => root.render(<AppointmentNotificationPreference initial={{ enabled, canEnable: true }} />));
    expect(container.textContent).toContain(enabled ? "สถานะ: เปิด" : "สถานะ: ปิด");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("waits for persisted confirmation after the user's opt-in", async () => {
    let confirm: ((value: { status: "SUCCESS"; enabled: boolean; canEnable: boolean }) => void) | undefined;
    mocks.save.mockImplementation(() => new Promise((resolve) => { confirm = resolve; }));
    await act(async () => root.render(<AppointmentNotificationPreference initial={{ enabled: false, canEnable: true }} />));
    await act(async () => container.querySelector("button")?.click());
    expect(container.textContent).toContain("สถานะ: ปิด");
    expect(container.textContent).not.toContain("เปิดการแจ้งเตือนแล้ว");
    expect(mocks.save.mock.calls[0]?.[1].get("enabled")).toBe("true");
    await act(async () => confirm?.({ status: "SUCCESS", enabled: true, canEnable: true }));
    expect(container.textContent).toContain("เปิดการแจ้งเตือนแล้ว");
    expect(container.textContent).toContain("สถานะ: เปิด");
  });

  it("keeps consent OFF after a rejected save", async () => {
    mocks.save.mockResolvedValue({ status: "ERROR", message: "บันทึกไม่สำเร็จ" });
    await act(async () => root.render(<AppointmentNotificationPreference initial={{ enabled: false, canEnable: true }} />));
    await act(async () => container.querySelector("button")?.click());
    expect(container.textContent).toContain("สถานะ: ปิด");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("บันทึกไม่สำเร็จ");
  });

  it("persists an explicit opt-out from an enabled preference", async () => {
    mocks.save.mockResolvedValue({ status: "SUCCESS", enabled: false, canEnable: true });
    await act(async () => root.render(<AppointmentNotificationPreference initial={{ enabled: true, canEnable: true }} />));
    await act(async () => container.querySelector("button")?.click());
    expect(mocks.save.mock.calls[0]?.[1].get("enabled")).toBe("false");
    expect(container.textContent).toContain("สถานะ: ปิด");
    expect(container.textContent).toContain("ปิดการแจ้งเตือนแล้ว");
  });

  it("does not allow enabling without an eligible binding", async () => {
    await act(async () => root.render(<AppointmentNotificationPreference initial={{ enabled: false, canEnable: false }} />));
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => container.querySelector("button")?.click());
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
