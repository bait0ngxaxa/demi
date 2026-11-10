// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@line/liff", () => ({ default: { init: vi.fn() } }));
import { LineRecoveryPanel } from "./line-recovery-panel";

it("moves focus with wizard steps and exposes only the current task controls", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const id = "22222222-2222-4222-a222-222222222222";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    intentId: "11111111-1111-4111-a111-111111111111", challenge: "c".repeat(43),
    expiresAt: new Date(Date.now() + 300000).toISOString(), reviews: [{ id, appName: "DEMI" }],
  })));
  async function click(label: string): Promise<void> {
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button?.click());
  }
  try {
    await act(async () => root.render(<LineRecoveryPanel
      status={{ state: "RECOVERY_REQUIRED", canRelink: false, obligations: [] }}
      handoffScope={"a".repeat(64)} liffId="123-test" publicOrigin="https://demi.example.org" onReload={vi.fn()} />));
    await click("ตรวจสอบเพื่อเชื่อมใหม่");
    expect(document.activeElement?.textContent).toBe("ตรวจสอบแอปใน LINE");
    expect(container.querySelector("select")).toBeNull();
    await click("ตรวจสอบแล้ว ดำเนินการต่อ");
    expect(document.activeElement?.textContent).toBe("ยืนยันผลการตรวจสอบ");
    expect(container.querySelector("select")?.closest("label")?.textContent).toContain("DEMI");
    expect([...container.querySelectorAll("button")].find((item) => item.textContent === "ดำเนินการยืนยันบัญชี")?.disabled).toBe(true);
    await click("กลับไปตรวจสอบแอป");
    expect(document.activeElement?.textContent).toBe("ตรวจสอบแอปใน LINE");
    expect(container.querySelector("select")).toBeNull();
  } finally {
    act(() => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
