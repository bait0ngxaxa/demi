// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LineDisconnectionStatus } from "@/modules/line/services/line-disconnection-service";

const h = vi.hoisted(() => ({ init: vi.fn(), isInClient: vi.fn(), isLoggedIn: vi.fn(), login: vi.fn(), logout: vi.fn(), getIDToken: vi.fn() }));
vi.mock("@line/liff", () => ({ default: h }));
import { LineDisconnectionNotice, LineRecoveryPanel } from "./line-recovery-panel";

const rowId = "22222222-2222-4222-a222-222222222222";
const scope = "a".repeat(64);
const intent = { intentId: "11111111-1111-4111-a111-111111111111", challenge: "c".repeat(43), expiresAt: "", reviews: [{ id: rowId, appName: "DEMI" }] };
const outstanding: LineDisconnectionStatus = { state: "RECOVERY_REQUIRED", canRelink: false, obligations: [{ id: rowId, bindingId: "b0000000-0000-4000-a000-000000000001", appName: "DEMI", status: "REMOTE_UNCONFIRMED" }] };
let root: Root;
let container: HTMLDivElement;
let prior: HTMLButtonElement;
const fetcher = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); localStorage.clear();
  intent.expiresAt = new Date(Date.now() + 300000).toISOString();
  fetcher.mockResolvedValue(Response.json(intent)); vi.stubGlobal("fetch", fetcher);
  h.init.mockResolvedValue(undefined); h.isInClient.mockReturnValue(false); h.isLoggedIn.mockReturnValue(false);
  h.getIDToken.mockReturnValue("synthetic-proof");
  prior = document.createElement("button"); document.body.append(prior); prior.focus();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); prior.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount(status = outstanding): Promise<void> {
  await act(async () => root.render(<StrictMode><LineRecoveryPanel status={status} handoffScope={scope} liffId="123-test" publicOrigin="https://demi.example.org" onReload={vi.fn()} /></StrictMode>));
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string): Promise<void> { await act(async () => button(label).click()); }
async function review(): Promise<void> {
  await click("ตรวจสอบเพื่อเชื่อมใหม่"); await click("ตรวจสอบแล้ว ดำเนินการต่อ");
  const select = container.querySelector("select");
  expect(select?.closest("label")?.textContent).toContain("DEMI");
  await act(async () => { if (select) { select.value = "NOT_LISTED"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
}
it.each(["PENDING", "REMOTE_CONFIRMED", "RECOVERY_REQUIRED"] as const)("preserves focus on ordinary %s mount and rerender", async (state) => {
  const status = { state, canRelink: state === "REMOTE_CONFIRMED", obligations: [] };
  await mount(status); expect(document.activeElement).toBe(prior);
  await mount({ ...status }); expect(document.activeElement).toBe(prior);
});
it("focuses only real wizard transitions and preserves decisions during backward navigation", async () => {
  await mount(); await click("ตรวจสอบเพื่อเชื่อมใหม่");
  expect(document.activeElement?.textContent).toBe("ตรวจสอบแอปใน LINE");
  expect(container.querySelector("select")).toBeNull();
  await click("ตรวจสอบแล้ว ดำเนินการต่อ");
  expect(document.activeElement?.textContent).toBe("ยืนยันผลการตรวจสอบ");
  expect(button("ดำเนินการยืนยันบัญชี").disabled).toBe(true);
  await click("กลับไปตรวจสอบแอป");
  expect(document.activeElement?.textContent).toBe("ตรวจสอบแอปใน LINE");
  await click("ตรวจสอบแล้ว ดำเนินการต่อ");
  const select = container.querySelector("select");
  await act(async () => { if (select) { select.value = "REMOVED"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
  expect(document.activeElement?.textContent).toBe("ยืนยันผลการตรวจสอบ");
  const check = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  check?.focus(); await act(async () => check?.click());
  expect(document.activeElement).toBe(check);
  await click("ดำเนินการยืนยันบัญชี");
  expect(document.activeElement?.textContent).toBe("ยืนยันบัญชี LINE");
  await click("กลับไปแก้ผลการตรวจสอบ");
  expect(document.activeElement?.textContent).toBe("ยืนยันผลการตรวจสอบ");
  expect(container.querySelector("select")?.value).toBe("REMOVED");
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(fetcher).toHaveBeenCalledOnce(); expect(h.init).not.toHaveBeenCalled();
  prior.focus(); await mount(); expect(document.activeElement).toBe(prior);
  expect(container.querySelectorAll('[role="status"]').length).toBe(0);
});
it("disables backward navigation while identity initialization is busy, then locks editing after handoff", async () => {
  let finish: (() => void) | undefined;
  h.init.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await mount(); await review(); await click("ดำเนินการยืนยันบัญชี");
  await click("ยืนยันตัวตนกับ LINE ใหม่");
  expect(button("กลับไปแก้ผลการตรวจสอบ").disabled).toBe(true);
  await click("กลับไปแก้ผลการตรวจสอบ");
  expect(container.querySelector("select")).toBeNull();
  await act(async () => finish?.());
  expect(container.textContent).not.toContain("กลับไปแก้ผลการตรวจสอบ");
  expect(h.login).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce();
});
it("focuses valid handoff confirmation once, forbids edits and requires explicit completion", async () => {
  localStorage.setItem("demi-line-recovery-intent-v1", JSON.stringify({ ...intent, scope, manualReviews: { [rowId]: "NOT_LISTED" }, riskAcknowledged: true }));
  await mount();
  expect(document.activeElement?.textContent).toBe("ยืนยันบัญชี LINE");
  expect(container.querySelector("select")).toBeNull();
  expect(container.textContent).not.toContain("กลับไปแก้ผลการตรวจสอบ");
  expect(fetcher).not.toHaveBeenCalled(); expect(h.init).not.toHaveBeenCalled();
  prior.focus(); await mount(); expect(document.activeElement).toBe(prior);
  await click("ยืนยันผลการตรวจสอบ");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe("/api/line/account/recovery");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ intentId: intent.intentId, challenge: intent.challenge, manualReviews: { [rowId]: "NOT_LISTED" }, riskAcknowledged: true });
});
it("rejects expiry during identity initialization without submitting recovery", async () => {
  localStorage.setItem("demi-line-recovery-intent-v1", JSON.stringify({ ...intent, scope, manualReviews: { [rowId]: "NOT_LISTED" }, riskAcknowledged: true }));
  let finish: (() => void) | undefined;
  h.init.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await mount(); await click("ยืนยันผลการตรวจสอบ");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(intent.expiresAt) + 1);
  await act(async () => finish?.());
  expect(fetcher).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("การตรวจสอบหมดอายุ");
  expect(button("ตรวจสอบเพื่อเชื่อมใหม่")).toBeDefined();
});
it("groups every historical record once without turning unverified records into blockers", async () => {
  const statuses = ["PENDING", "OBSERVED", "REMOTE_UNCONFIRMED", "REMOTE_CONFIRMED", "PROVEN_ABSENT", "RECOVERY_RELEASED_UNVERIFIED"] as const;
  for (const canRelink of [true, false]) {
    const status: LineDisconnectionStatus = { state: canRelink ? "RECOVERY_RELEASED_UNVERIFIED" : "RECOVERY_REQUIRED", canRelink,
      obligations: statuses.flatMap((status, index) => [0, 1].map((generation) => ({ id: `${index}-${generation}`, bindingId: `binding-${generation}`, appName: "Repeated DEMI", status }))) };
    await act(async () => root.render(<LineDisconnectionNotice status={status} />));
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.querySelectorAll("li")).toHaveLength(12);
    expect([...container.querySelectorAll("li")].every((li) => li.textContent?.startsWith("Repeated DEMI"))).toBe(true);
    const groups = [...container.querySelectorAll("section")];
    expect(groups.map((group) => group.querySelectorAll("li").length)).toEqual([6, 4, 2]);
    expect(groups.every((group) => group.getAttribute("aria-label") === group.querySelector("h3")?.textContent)).toBe(true);
    expect(groups[0].textContent).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
    expect(groups[2].textContent).not.toContain("LINE ยืนยันถอนสิทธิ์แล้ว");
    expect(container.textContent).not.toContain("binding-");
  }
});
