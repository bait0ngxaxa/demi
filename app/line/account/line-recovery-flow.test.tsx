import { isValidElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  init: vi.fn(), isInClient: vi.fn(), isLoggedIn: vi.fn(), logout: vi.fn(), login: vi.fn(), getIDToken: vi.fn(),
  fetch: vi.fn(), assign: vi.fn(), reload: vi.fn(), saved: new Map<string, string>(),
}));
vi.mock("@line/liff", () => ({ default: h }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = h.stateIndex++;
    if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (value: unknown) => { h.states[index] = typeof value === "function" ? value(h.states[index]) : value; }];
  },
  useRef: (initial: unknown) => { const index = h.refIndex++; return h.refs[index] ?? (h.refs[index] = { current: initial }); },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
import { LineRecoveryPanel } from "./line-recovery-panel";

type Control = { onClick?: () => void; onChange?: (event: { target: { value?: string; checked?: boolean } }) => void; children?: ReactNode; disabled?: boolean; type?: string; value?: string };
function controls(node: ReactNode): Array<{ kind: unknown; props: Control }> {
  if (Array.isArray(node)) return node.flatMap(controls);
  if (!isValidElement<Control>(node)) return [];
  return [{ kind: node.type, props: node.props }, ...controls(node.props.children)];
}
const prepared = () => ({ intentId: "11111111-1111-4111-a111-111111111111", challenge: "c".repeat(43), expiresAt: new Date(Date.now() + 300000).toISOString(), reviews: [{ id: "22222222-2222-4222-a222-222222222222", appName: "DEMI ทดสอบ" }] });
function render() {
  h.stateIndex = 0; h.refIndex = 0;
  return controls(LineRecoveryPanel({ status: { state: "RECOVERY_REQUIRED", canRelink: false, obligations: [] }, liffId: "1234567890-test", publicOrigin: "https://demi.example.org", onReload: h.reload }));
}
function click(label: string): void {
  const selected = render().find((control) => control.kind === "button" && control.props.children === label);
  if (!selected?.props.onClick || selected.props.disabled) throw new Error(`Unavailable control: ${label}`);
  selected.props.onClick();
}
async function settle(): Promise<void> { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function prepareAndReview(): Promise<void> {
  click("ตรวจสอบเพื่อเชื่อมใหม่"); await settle();
  const selected = render().find((control) => control.kind === "select");
  selected?.props.onChange?.({ target: { value: "NOT_LISTED" } });
  render().find((control) => control.kind === "input")?.props.onChange?.({ target: { checked: true } });
}
describe("Recovery-only LIFF interaction and transient proof transport", () => {
  beforeEach(() => {
    vi.clearAllMocks(); h.states.length = 0; h.refs.length = 0; h.saved.clear();
    h.init.mockResolvedValue(undefined); h.isInClient.mockReturnValue(false); h.isLoggedIn.mockReturnValue(true); h.getIDToken.mockReturnValue("fresh-line-id-token-only-in-body");
    h.fetch.mockImplementation(async (path: string) => Response.json(path.endsWith("/prepare") ? prepared() : { status: "RECOVERY_RELEASED_UNVERIFIED" }));
    vi.stubGlobal("fetch", h.fetch); vi.stubGlobal("window", { location: { assign: h.assign } });
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => h.saved.get(key) ?? null, setItem: (key: string, value: string) => h.saved.set(key, value), removeItem: (key: string) => h.saved.delete(key) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("requires complete reviews/risk decision before requesting fresh proof, without authorizing unused MINI", async () => {
    click("ตรวจสอบเพื่อเชื่อมใหม่"); await settle();
    expect(render().find((control) => control.props.children === "ยืนยันตัวตนกับ LINE ใหม่")?.props.disabled).toBe(true);
    expect(h.init).not.toHaveBeenCalled(); expect(h.login).not.toHaveBeenCalled();
    const appLink = render().find((control) => control.kind === "a");
    expect(appLink?.props.children).toBe("เปิดแอปที่ได้รับอนุญาตใน LINE");
  });
  it("restarts Account login only after acknowledgement; stores intent decisions, never tokens", async () => {
    await prepareAndReview(); click("ยืนยันตัวตนกับ LINE ใหม่"); await settle();
    expect(h.logout).toHaveBeenCalledOnce(); expect(h.login).toHaveBeenCalledWith({ redirectUri: "https://demi.example.org/line/account?recovery=1" });
    expect(h.fetch).toHaveBeenCalledTimes(1); expect(h.getIDToken).not.toHaveBeenCalled();
    const saved = [...h.saved.values()].join(); expect(saved).toContain("riskAcknowledged"); expect(saved).not.toContain("idToken"); expect(saved).not.toContain("accessToken");
    expect(JSON.stringify(h.login.mock.calls)).not.toContain(prepared().challenge);
  });
  it("LIFF handoff carries no challenge/identity in URL", async () => {
    h.isInClient.mockReturnValue(true); await prepareAndReview(); click("ยืนยันตัวตนกับ LINE ใหม่"); await settle();
    expect(h.assign).toHaveBeenCalledWith("https://liff.line.me/1234567890-test?recovery=1"); expect(h.login).not.toHaveBeenCalled();
  });
  it("refresh/handoff verifies proof through POST and then offers separate Relink; duplicate click sends once", async () => {
    await prepareAndReview(); click("ยืนยันตัวตนกับ LINE ใหม่"); await settle();
    h.states.length = 0; h.refs.length = 0;
    const confirm = render().find((control) => control.props.children === "ยืนยันผลการตรวจสอบ")?.props.onClick;
    expect(confirm).toBeDefined(); confirm?.(); confirm?.(); await settle();
    expect(h.fetch).toHaveBeenCalledTimes(2); const [path, options] = h.fetch.mock.calls[1];
    expect(path).toBe("/api/line/account/recovery"); expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(options.body)).toMatchObject({ idToken: "fresh-line-id-token-only-in-body", riskAcknowledged: true });
    expect(h.saved.size).toBe(0); expect(h.reload).toHaveBeenCalledOnce(); expect(h.fetch.mock.calls.some((call) => call[0].endsWith("/link"))).toBe(false);
  });
  it("missing proof keeps local status recoverable and never posts a release", async () => {
    await prepareAndReview(); click("ยืนยันตัวตนกับ LINE ใหม่"); await settle(); h.states.length = 0; h.refs.length = 0;
    h.getIDToken.mockReturnValue(null); click("ยืนยันผลการตรวจสอบ"); await settle();
    expect(h.fetch).toHaveBeenCalledOnce(); expect(h.reload).not.toHaveBeenCalled();
    expect(render().find((control) => control.kind === "p" && String(control.props.children).includes("ยังยืนยันไม่ได้"))).toBeDefined();
    expect(render().find((control) => control.props.children === "ยืนยันผลการตรวจสอบ")?.props.disabled).toBe(false);
  });
});
