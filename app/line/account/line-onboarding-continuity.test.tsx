// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  init: vi.fn(), isLoggedIn: vi.fn(), isInClient: vi.fn(), getContext: vi.fn(),
  getIDToken: vi.fn(), getAccessToken: vi.fn(), closeWindow: vi.fn(), login: vi.fn(), switchAccount: vi.fn(),
}));
vi.mock("@line/liff", () => ({ default: h }));
vi.mock("@/modules/auth/transport/server-actions", () => ({ switchDemiAccountForLineAction: h.switchAccount }));
import { LineAccountClient } from "./line-account-client";

const linked = { status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "UNKNOWN", cleanupState: null } as const;
let container: HTMLDivElement;
let root: Root;
const fetcher = vi.fn<typeof fetch>();
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function mount(initial: Parameters<typeof LineAccountClient>[0]["initial"] = linked): Promise<void> {
  await act(async () => root.render(<LineAccountClient initial={initial} liffId="123-app" publicOrigin="https://demi.example.org" linePasswordRecoveryAvailable={false}
    lifecycleReadiness={{ state: "READY" }} disconnection={{ state: "NONE", canRelink: true, obligations: [] }} />));
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.resetAllMocks();
  h.init.mockResolvedValue(undefined); h.isLoggedIn.mockReturnValue(true); h.isInClient.mockReturnValue(true);
  h.getContext.mockReturnValue({ viewType: "full" }); h.getIDToken.mockReturnValue("id-proof"); h.getAccessToken.mockReturnValue("access-proof");
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("mobile LINE onboarding continuity interactions", () => {
  it("checks once, shows busy immediately, blocks competing controls and waits for authoritative APPLIED", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetcher.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount();
    const check = button("ตรวจสอบสถานะเมนูอีกครั้ง");
    await act(async () => { check.click(); check.click(); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/line/account/status");
    expect(check.disabled).toBe(true); expect(check.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("กำลังตรวจสอบสถานะ LINE และเมนู");
    expect(container.textContent).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(button("ยกเลิกการเชื่อมต่อ LINE").disabled).toBe(true);
    await act(async () => finish?.(Response.json({ ...linked, menuState: "APPLIED", reconciliation: "CHECKED" })));
    expect(container.textContent).toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(fetcher).toHaveBeenCalledOnce();
    await act(async () => button("กลับไปที่ LINE").click()); expect(h.closeWindow).toHaveBeenCalledOnce();
  });

  it("does not treat a busy lease with an older APPLIED summary as confirmed completion", async () => {
    fetcher.mockResolvedValue(Response.json({ ...linked, menuState: "APPLIED", reconciliation: "PENDING" }));
    await mount(); await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(container.textContent).toContain("ระบบยังตรวจสอบเมนูไม่เสร็จ");
    expect(container.textContent).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(["UNKNOWN", "MISMATCH", "UNAVAILABLE"])("keeps checked %s recoverable without automatic retries", async (menuState) => {
    fetcher.mockImplementation(async () => Response.json({ ...linked, menuState, reconciliation: "CHECKED" }));
    await mount(); await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(container.textContent).toContain("ตรวจสอบแล้ว ยังไม่ยืนยันความพร้อมใช้งาน LINE");
    expect(container.textContent).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    expect(container.querySelector('a[href="/app"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("preserves binding on provider failure and allows an explicit retry", async () => {
    fetcher.mockRejectedValueOnce(new Error("private failure")).mockResolvedValueOnce(Response.json({ ...linked, reconciliation: "CHECKED" }));
    await mount(); await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(container.textContent).toContain("ยังตรวจสอบสถานะ LINE ไม่สำเร็จ");
    expect(container.textContent).not.toContain("private failure");
    await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After without silently retrying and permits a later explicit check", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ error: "rate limited" }, { status: 429, headers: { "retry-after": "150" } }))
      .mockResolvedValueOnce(Response.json({ ...linked, menuState: "APPLIED", reconciliation: "CHECKED" }));
    await mount(); vi.useFakeTimers();
    await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(container.textContent).toContain("ตรวจสอบสถานะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
    expect(container.textContent).toContain("150 วินาที");
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(true);
    expect(container.textContent).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
    await act(async () => vi.advanceTimersByTimeAsync(149_000));
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
    await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(container.textContent).toContain("พร้อมใช้งานผ่าน LINE แล้ว"); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("aborts on unmount and ignores a late provider response", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetcher.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    const signal = fetcher.mock.calls[0]?.[1]?.signal;
    await act(async () => root.render(<p>other page</p>));
    expect(signal?.aborted).toBe(true);
    await act(async () => finish?.(Response.json({ ...linked, menuState: "APPLIED", reconciliation: "CHECKED" })));
    expect(container.textContent).toBe("other page"); expect(fetcher).toHaveBeenCalledOnce();
  });

  it("cancels a status check on page navigation before exposing a late readiness result", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetcher.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    const signal = fetcher.mock.calls[0]?.[1]?.signal;
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(signal?.aborted).toBe(true);
    expect(container.firstElementChild?.hasAttribute("hidden")).toBe(true);
    await act(async () => finish?.(Response.json({ ...linked, menuState: "APPLIED", reconciliation: "CHECKED" })));
    expect(container.textContent).not.toContain("พร้อมใช้งานผ่าน LINE แล้ว");
  });

  it("bounds a stalled request, restores retry, and never polls", async () => {
    fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    await mount(); vi.useFakeTimers();
    await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    await act(async () => vi.advanceTimersByTimeAsync(25_000));
    expect(container.textContent).toContain("ยังตรวจสอบสถานะ LINE ไม่สำเร็จ");
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(120_000)); expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not close an external browser and retains practical OA/web fallback", async () => {
    h.isInClient.mockReturnValue(false);
    await mount({ ...linked, menuState: "APPLIED" });
    expect(container.textContent).toContain("กลับไปที่แชท LINE");
    expect(container.textContent).toContain("หากเปิดแอป LINE ไม่ได้");
    expect([...container.querySelectorAll("button")].some((item) => item.textContent === "กลับไปที่ LINE")).toBe(false);
    expect(h.closeWindow).not.toHaveBeenCalled();
  });

  it("requires LINE login to check menu status instead of reloading or calling a provider without proof", async () => {
    h.isLoggedIn.mockReturnValue(false);
    await mount();
    await act(async () => button("เข้าสู่ระบบ LINE เพื่อตรวจสอบสถานะ").click());
    expect(h.login).toHaveBeenCalledWith({ redirectUri: "https://demi.example.org/line/account" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not start a competing status request while an unlink confirmation is open", async () => {
    fetcher.mockResolvedValue(Response.json({ intentId: "unlink-intent", challenge: "unlink-challenge" }));
    await mount(); await act(async () => button("ยกเลิกการเชื่อมต่อ LINE").click());
    expect(button("ตรวจสอบสถานะเมนูอีกครั้ง").disabled).toBe(true);
    await act(async () => button("ตรวจสอบสถานะเมนูอีกครั้ง").click());
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/line/account/intents");
  });

  it("cancels link confirmation with Back without creating a binding", async () => {
    fetcher.mockResolvedValue(Response.json({ intentId: "server-intent", challenge: "server-challenge" }));
    await mount({ ...linked, status: "UNLINKED", canUnlink: false, reachability: null, menuState: null });
    await act(async () => button("เชื่อมบัญชี LINE นี้").click());
    await act(async () => button("กลับ").click());
    expect(container.querySelector('input[name="currentPassword"]')).toBeNull();
    expect(document.activeElement?.id).toBe("line-account-status");
    expect(button("เชื่อมบัญชี LINE นี้").disabled).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("has one explicit password confirmation and a direct safe account switch on shared devices without identity disclosure", async () => {
    fetcher.mockResolvedValue(Response.json({ intentId: "server-intent", challenge: "server-challenge" }));
    h.switchAccount.mockResolvedValue({ status: "ERROR", message: "ทดสอบการออกจากระบบ" });
    await mount({ ...linked, status: "UNLINKED", canUnlink: false, reachability: null, menuState: null });
    await act(async () => button("เชื่อมบัญชี LINE นี้").click());
    expect(container.textContent).toContain("ตรวจสอบบัญชีก่อนเชื่อม LINE");
    expect(document.activeElement?.id).toBe("link-confirm-title");
    expect(container.textContent).toContain("การออกจากระบบจะยกเลิกการยืนยันครั้งนี้");
    expect(button("ยืนยันเชื่อมบัญชี").disabled).toBe(true);
    expect(container.querySelectorAll('input[name="currentPassword"]')).toHaveLength(1);
    expect([...container.querySelectorAll("button")].filter((item) => item.textContent === "เชื่อมบัญชี LINE นี้")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("server-intent");
    await act(async () => button("ใช้บัญชี DEMI อื่น").click());
    expect(h.switchAccount).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce(); // only an intent, no binding request
  });
});
