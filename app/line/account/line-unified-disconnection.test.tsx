// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  init: vi.fn(), isLoggedIn: vi.fn(), isInClient: vi.fn(), getContext: vi.fn(),
  getIDToken: vi.fn(), getAccessToken: vi.fn(), closeWindow: vi.fn(), login: vi.fn(),
}));
vi.mock("@line/liff", () => ({ default: h }));
vi.mock("@/modules/auth/transport/server-actions", () => ({ switchDemiAccountForLineAction: vi.fn() }));
import { LineAccountClient } from "./line-account-client";

const linked = { status: "LINKED", canUnlink: true, reachability: "FRIEND", menuState: "APPLIED", cleanupState: null } as const;
const intent = { intentId: "c1111111-1111-4111-a111-111111111111", challenge: "u".repeat(43) };
const unconfirmed = { state: "RECOVERY_REQUIRED", canRelink: false, obligations: [
  { id: "d1111111-1111-4111-a111-111111111111", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "LINE Login ของ DEMI", status: "REMOTE_CONFIRMED" },
  { id: "e1111111-1111-4111-a111-111111111111", bindingId: "b0000000-0000-4000-a000-000000000001", appName: "DEMI MINI App", status: "REMOTE_UNCONFIRMED" },
] };
let container: HTMLDivElement;
let root: Root;
const fetcher = vi.fn<typeof fetch>();
const calls = (path: string): number => fetcher.mock.calls.filter(([url]) => url === path).length;
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function mount(): Promise<void> {
  await act(async () => root.render(<LineAccountClient initial={linked} liffId="123-app" publicOrigin="https://demi.example.org" linePasswordRecoveryAvailable={false}
    lifecycleReadiness={{ state: "READY" }} disconnection={{ state: "NONE", canRelink: true, obligations: [] }} />));
}
async function openConfirmation(): Promise<void> {
  await act(async () => button("ยกเลิกการเชื่อมต่อ LINE").click());
  expect(container.textContent).toContain("ยกเลิกการเชื่อมต่อบัญชี LINE?");
}
function route(responses: Partial<Record<string, () => Promise<Response>>>): void {
  fetcher.mockImplementation(async (url) => {
    const respond = responses[String(url)];
    if (!respond) throw new Error(`Unexpected request: ${String(url)}`);
    return respond();
  });
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.resetAllMocks();
  h.init.mockResolvedValue(undefined); h.isLoggedIn.mockReturnValue(true); h.isInClient.mockReturnValue(true);
  h.getContext.mockReturnValue({ viewType: "full" }); h.getIDToken.mockReturnValue("id-proof"); h.getAccessToken.mockReturnValue("account-access-token");
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("single LINE Disconnection with DEMI sign-out", () => {
  it("unlinks once, reports remote status honestly and then ends the DEMI session", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING", disconnection: unconfirmed }),
      "/api/line/account/sign-out": async () => Response.json({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" }),
    });
    await mount(); await openConfirmation();
    const confirm = button("ยืนยันยกเลิกการเชื่อมต่อ");
    await act(async () => { confirm.click(); confirm.click(); });
    expect(calls("/api/line/account/unlink")).toBe(1);
    expect(calls("/api/line/account/sign-out")).toBe(1);
    const unlinkBody = JSON.parse(String(fetcher.mock.calls.find(([url]) => url === "/api/line/account/unlink")?.[1]?.body)) as Record<string, unknown>;
    expect(unlinkBody).toEqual({ ...intent, accessToken: "account-access-token" });
    // Sign-out carries only the UNLINK proof; the server derives User and session itself.
    expect(JSON.parse(String(fetcher.mock.calls.find(([url]) => url === "/api/line/account/sign-out")?.[1]?.body))).toEqual(intent);
    expect(container.textContent).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว");
    expect(container.textContent).toContain("DEMI MINI App: ยังไม่ยืนยันถอนสิทธิ์");
    expect(container.textContent).not.toContain("LINE ยืนยันการถอนสิทธิ์ของแอปที่เกี่ยวข้องแล้ว");
    // The previous owner's Recovery is never offered on the way out.
    expect(container.textContent).not.toContain("ตรวจสอบเพื่อเชื่อมใหม่");
    expect(container.querySelector('a[href="/login?returnTo=%2Fline%2Faccount"]')?.textContent).toBe("ไปหน้าเข้าสู่ระบบ DEMI");
  });

  it("keeps a committed unlink truthful when sign-out fails and retries only sign-out", async () => {
    let signOutAttempts = 0;
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING", disconnection: unconfirmed }),
      "/api/line/account/sign-out": async () => (signOutAttempts++ === 0
        ? Response.json({ error: "ยังออกจากระบบ DEMI ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503 })
        : Response.json({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" })),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว แต่ยังออกจากระบบ DEMI ไม่สำเร็จ");
    const retry = button("ลองออกจากระบบอีกครั้ง");
    await act(async () => { retry.click(); retry.click(); });
    expect(calls("/api/line/account/sign-out")).toBe(2);
    expect(calls("/api/line/account/unlink")).toBe(1);
    expect(calls("/api/line/account/intents")).toBe(1);
    expect(container.textContent).toContain("ออกจากระบบ DEMI แล้ว กำลังไปหน้าเข้าสู่ระบบ");
  });

  it("treats an invalid sign-out response as failed rather than signed out", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING" }),
      "/api/line/account/sign-out": async () => Response.json({ status: "SIGNED_OUT", redirectTo: "https://attacker.example/login" }),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).toContain("ยังออกจากระบบ DEMI ไม่สำเร็จ");
    expect(container.querySelector('a[href^="https://attacker"]')).toBeNull();
    // No readable disconnection status: remote settlement stays unconfirmed.
    expect(container.textContent).toContain("ขณะนี้ยังยืนยันการถอนสิทธิ์จาก LINE ไม่ได้");
  });

  it("does not sign out a session that replaced the disconnecting one", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING", disconnection: unconfirmed }),
      "/api/line/account/sign-out": async () => Response.json({ code: "SESSION_CHANGED", error: "changed" }, { status: 409 }),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว แต่บัญชีที่เข้าสู่ระบบในเครื่องนี้เปลี่ยนไปแล้ว");
    expect(container.querySelector('a[href^="/login"]')).toBeNull();
    expect(() => button("ลองออกจากระบบอีกครั้ง")).toThrow();
    expect(calls("/api/line/account/sign-out")).toBe(1);
  });

  it("completes a committed unlink whose response was lost by asking the server, never resending Unlink", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => { throw new TypeError("network lost"); },
      "/api/line/account/sign-out": async () => Response.json({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" }),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(calls("/api/line/account/unlink")).toBe(1);
    expect(calls("/api/line/account/sign-out")).toBe(1);
    expect(container.textContent).toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว");
    // Remote settlement was never observed, so it stays unconfirmed.
    expect(container.textContent).toContain("ขณะนี้ยังยืนยันการถอนสิทธิ์จาก LINE ไม่ได้");
    expect(container.textContent).toContain("ออกจากระบบ DEMI แล้ว กำลังไปหน้าเข้าสู่ระบบ");
  });

  it("never reports an unlink as done when the session is gone and the Unlink outcome is unknown", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => { throw new TypeError("network lost"); },
      "/api/line/account/sign-out": async () => Response.json({ code: "SESSION_ABSENT", error: "x", redirectTo: "/login?returnTo=%2Fline%2Faccount" }, { status: 401 }),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).not.toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว");
    expect(container.textContent).not.toContain("บัญชี LINE นี้ไม่ได้เชื่อมกับบัญชี DEMI แล้ว");
    expect(container.textContent).toContain("ระบบจึงยืนยันผลการยกเลิกการเชื่อมต่อ LINE ไม่ได้");
    expect(calls("/api/line/account/unlink")).toBe(1);
  });

  it("finishes at login when the session already ended after an observed unlink", async () => {
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING", disconnection: unconfirmed }),
      "/api/line/account/sign-out": async () => Response.json({ code: "SESSION_ABSENT", error: "x", redirectTo: "/login?returnTo=%2Fline%2Faccount" }, { status: 401 }),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).toContain("ออกจากระบบ DEMI แล้ว กำลังไปหน้าเข้าสู่ระบบ");
  });

  it.each([
    ["an expired proof", () => Response.json({ code: "PROOF_EXPIRED", error: "x" }, { status: 409 })],
    ["a proof the server no longer holds", () => Response.json({ error: "x" }, { status: 403 })],
  ])("explains %s on sign-out retry, offers ordinary logout, and never claims a session change", async (_label, expired) => {
    let attempts = 0;
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => Response.json({ status: "UNLINKED", cleanup: "PENDING", disconnection: unconfirmed }),
      "/api/line/account/sign-out": async () => (attempts++ === 0 ? Response.json({ error: "x" }, { status: 503 }) : expired()),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    await act(async () => button("ลองออกจากระบบอีกครั้ง").click());
    expect(container.textContent).toContain("หลักฐานการยกเลิกครั้งนี้หมดอายุ");
    expect(container.textContent).not.toContain("บัญชีที่เข้าสู่ระบบในเครื่องนี้เปลี่ยนไปแล้ว");
    expect(button("ออกจากระบบ DEMI")).toBeDefined();
    expect(calls("/api/line/account/unlink")).toBe(1); expect(calls("/api/line/account/intents")).toBe(1);
  });

  it("keeps the session when a lost Unlink did not commit and rechecks on retry without resending", async () => {
    let checks = 0;
    route({
      "/api/line/account/intents": async () => Response.json(intent, { status: 201 }),
      "/api/line/account/unlink": async () => { throw new TypeError("network lost"); },
      "/api/line/account/sign-out": async () => (checks++ === 0
        ? Response.json({ code: "NOT_COMMITTED", error: "not yet" }, { status: 409 })
        : Response.json({ status: "SIGNED_OUT", redirectTo: "/login?returnTo=%2Fline%2Faccount" })),
    });
    await mount(); await openConfirmation();
    await act(async () => button("ยืนยันยกเลิกการเชื่อมต่อ").click());
    expect(container.textContent).not.toContain("ยกเลิกการเชื่อมต่อ LINE แล้ว");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // The commit became visible later (for example a slow provider call): retry completes it.
    await act(async () => button("ลองใหม่").click());
    expect(calls("/api/line/account/unlink")).toBe(1);
    expect(calls("/api/line/account/intents")).toBe(1);
    expect(calls("/api/line/account/sign-out")).toBe(2);
    expect(container.textContent).toContain("ออกจากระบบ DEMI แล้ว กำลังไปหน้าเข้าสู่ระบบ");
  });
});
