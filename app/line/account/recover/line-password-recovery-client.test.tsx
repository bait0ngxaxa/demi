import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookState = vi.hoisted(() => ({
  status: null as string | null,
  effects: [] as Array<() => void | (() => void)>,
  liff: { init: vi.fn(), isLoggedIn: vi.fn(), getIDToken: vi.fn() },
}));

vi.mock("@line/liff", () => ({ default: hookState.liff }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => { hookState.effects.push(effect); },
    useRef: <T,>(current: T) => ({ current }),
    useState: <T,>(initial: T): [T, (value: T | ((current: T) => T)) => void] => [
      initial === "LOADING" && hookState.status ? hookState.status as T : initial,
      vi.fn(),
    ],
  };
});

import { LinePasswordRecoveryClient } from "./line-password-recovery-client";

describe("LINE recovery link states", () => {
  beforeEach(() => {
    hookState.status = null;
    hookState.effects = [];
    hookState.liff.init.mockReset().mockResolvedValue(undefined);
    hookState.liff.isLoggedIn.mockReset().mockReturnValue(true);
    hookState.liff.getIDToken.mockReset().mockReturnValue("fresh-server-verifiable-line-id-token");
  });

  it("renders the new-password form for a verified link", () => {
    hookState.status = "READY";
    const markup = renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-AbCdEf" />);

    expect(markup).toContain("ตั้งรหัสผ่านใหม่");
    expect(markup).toContain('name="newPassword"');
    expect(markup).toContain('name="passwordConfirmation"');
  });

  it.each([
    ["EXPIRED", "ลิงก์นี้ใช้ไม่ได้แล้ว"],
    ["OTHER_LINE", "บัญชี LINE นี้ใช้ยืนยันลิงก์ไม่ได้"],
    ["INELIGIBLE", "ใช้การตั้งรหัสผ่านทาง LINE ไม่ได้"],
    ["COMPLETED", "ตั้งรหัสผ่านใหม่แล้ว"],
    ["LINE_UNAVAILABLE", "เปิดลิงก์ใน LINE"],
    ["UNCERTAIN", "ยังยืนยันผลการตั้งรหัสผ่านไม่ได้"],
  ])("renders a safe %s state", (status, copy) => {
    hookState.status = status;
    const markup = renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-AbCdEf" />);
    expect(markup).toContain(copy);
  });

  it("waits for LIFF restoration before extracting and cleaning only the DEMI locator", async () => {
    const order: string[] = [];
    const historyState = { line: "state-preserved" };
    let currentUrl = "https://demi.example.org/line/account?liff.state=restoring";
    const fakeWindow = {
      get location() {
        return {
          get href() { order.push("read-href"); return currentUrl; },
          get pathname() { order.push("read-path"); return new URL(currentUrl).pathname; },
          get search() { order.push("read-search"); return new URL(currentUrl).search; },
        };
      },
      history: {
        state: historyState,
        replaceState: (state: unknown, _title: string, url: string) => {
          order.push("replace");
          expect(state).toBe(historyState);
          currentUrl = new URL(url, currentUrl).toString();
        },
      },
    };
    vi.stubGlobal("window", fakeWindow as unknown as Window);
    vi.stubGlobal("document", { title: "Recovery" } as unknown as Document);
    const capabilityId = "11111111-1111-4111-8111-111111111111";
    hookState.liff.init.mockImplementation(async () => {
      order.push("init");
      currentUrl = `https://demi.example.org/line/account/recover?capability=${capabilityId}&liff.state=%2Frecover%3Fsource%3Dline&liff.view=compact`;
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      order.push("open-request");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({ capabilityId, idToken: "fresh-server-verifiable-line-id-token" });
      expect(body).not.toHaveProperty("token");
      return { ok: true, json: async () => ({ status: "READY" }) } as Response;
    }));

    renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-restore" />);
    const effect = hookState.effects[0];
    expect(effect).toBeDefined();
    const firstCleanup = effect?.();
    if (typeof firstCleanup === "function") firstCleanup();
    const remountedCleanup = effect?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (typeof remountedCleanup === "function") remountedCleanup();

    expect(hookState.liff.init).toHaveBeenCalledOnce();
    expect(order.indexOf("init")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("read-href")).toBeGreaterThan(order.indexOf("init"));
    expect(order.indexOf("replace")).toBeGreaterThan(order.indexOf("read-href"));
    expect(order.indexOf("open-request")).toBeGreaterThan(order.indexOf("replace"));
    expect(currentUrl).toBe("https://demi.example.org/line/account/recover?liff.state=%2Frecover%3Fsource%3Dline&liff.view=compact");
    vi.unstubAllGlobals();
  });

  it("captures a legacy fragment restored by the secondary LIFF redirect only after initialization", async () => {
    const order: string[] = [];
    let currentUrl = "https://demi.example.org/line/account/recover?liff.state=%2Frecover";
    const fakeWindow = {
      get location() {
        return {
          get href() { order.push("read-href"); return currentUrl; },
          get pathname() { return new URL(currentUrl).pathname; },
          get search() { return new URL(currentUrl).search; },
        };
      },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, url: string) => {
          order.push("replace");
          currentUrl = new URL(url, currentUrl).toString();
        },
      },
    };
    vi.stubGlobal("window", fakeWindow as unknown as Window);
    vi.stubGlobal("document", { title: "Recovery" } as unknown as Document);
    const token = "a".repeat(43);
    hookState.liff.init.mockImplementation(async () => {
      order.push("init");
      currentUrl = `https://demi.example.org/line/account/recover?liff.state=%2Frecover%3Fsource%3Dlegacy#${token}`;
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({ token, idToken: "fresh-server-verifiable-line-id-token" });
      return { ok: true, json: async () => ({ status: "READY" }) } as Response;
    }));

    renderToStaticMarkup(<LinePasswordRecoveryClient liffId="1234567890-legacy" />);
    const cleanup = hookState.effects[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (typeof cleanup === "function") cleanup();

    expect(order.indexOf("read-href")).toBeGreaterThan(order.indexOf("init"));
    expect(order.indexOf("replace")).toBeGreaterThan(order.indexOf("read-href"));
    expect(currentUrl).toBe("https://demi.example.org/line/account/recover?liff.state=%2Frecover%3Fsource%3Dlegacy");
    vi.unstubAllGlobals();
  });
});
