import { describe, expect, it, vi } from "vitest";

import {
  consumeLineWorkflowLoginAttempt,
  initializeLineWorkflowLiff,
  lineWorkflowStateFromResponse,
  markLineWorkflowLoginAttempt,
  verifyLineWorkflow,
  type LineWorkflowLiff,
} from "./line-workflow-gateway";

function liffDouble(overrides: Partial<LineWorkflowLiff> = {}): LineWorkflowLiff {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    getIDToken: vi.fn().mockReturnValue("synthetic-mini-id-token"),
    ...overrides,
  };
}

describe("MINI gateway LIFF initialization", () => {
  it("initializes the selected LIFF ID and reports LINE login state", async () => {
    const liff = liffDouble();
    await expect(initializeLineWorkflowLiff(liff, "2000000001-MiniDev")).resolves.toBe("READY");
    expect(liff.init).toHaveBeenCalledWith({ liffId: "2000000001-MiniDev" });
    await expect(initializeLineWorkflowLiff(liffDouble({ isLoggedIn: () => false }), "2000000001-MiniDev")).resolves.toBe("LINE_LOGIN_REQUIRED");
  });

  it("maps SDK initialization failure to a retryable state", async () => {
    const liff = liffDouble({ init: vi.fn().mockRejectedValue(new Error("INIT_FAILED")) });
    await expect(initializeLineWorkflowLiff(liff, "2000000001-MiniDev")).resolves.toBe("INIT_FAILED");
  });

  it("bounds a hanging SDK initialization", async () => {
    vi.useFakeTimers();
    try {
      const pending = initializeLineWorkflowLiff(liffDouble({ init: () => new Promise<void>(() => undefined) }), "2000000001-MiniDev", 50);
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toBe("INIT_FAILED");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MINI gateway verification step", () => {
  it("sends only the finite intent and transient proof in a same-origin POST body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "WORKFLOW_NOT_ACTIVATED" }, { status: 503 }));
    await expect(verifyLineWorkflow(liffDouble(), fetcher)).resolves.toBe("NOT_ACTIVATED");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/line/workflow/verify");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(String(init?.body))).toEqual({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: "synthetic-mini-id-token" });
    expect(String(url)).not.toContain("synthetic-mini-id-token");
  });

  it("does not call the server when LINE proof is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(verifyLineWorkflow(liffDouble({ getIDToken: () => null }), fetcher)).resolves.toBe("LINE_PROOF_UNAVAILABLE");
    await expect(verifyLineWorkflow(liffDouble({ getIDToken: () => { throw new Error("not initialized"); } }), fetcher)).resolves.toBe("LINE_PROOF_UNAVAILABLE");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "LOGIN_REQUIRED" }, "LOGIN_REQUIRED"],
    [{ code: "ACCOUNT_MISMATCH" }, "ACCOUNT_MISMATCH"],
    [{ code: "LINE_NOT_LINKED" }, "LINE_NOT_LINKED"],
    [{ code: "WORKFLOW_INELIGIBLE" }, "WORKFLOW_INELIGIBLE"],
    [{ code: "LINE_IDENTITY_INVALID" }, "LINE_PROOF_UNAVAILABLE"],
    [{ code: "RATE_LIMITED" }, "RATE_LIMITED"],
    [{ code: "WORKFLOW_DISABLED" }, "NOT_ACTIVATED"],
    [{ code: "LINE_PROVIDER_UNAVAILABLE" }, "TEMPORARILY_UNAVAILABLE"],
    [{ code: "toString" }, "TEMPORARILY_UNAVAILABLE"],
    [{ ok: true, scope: "granted" }, "TEMPORARILY_UNAVAILABLE"],
    [null, "TEMPORARILY_UNAVAILABLE"],
  ])("maps response %j to UI state %s without continuing", (body, state) => {
    expect(lineWorkflowStateFromResponse(body)).toBe(state);
  });

  it("treats a network failure as temporarily unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    await expect(verifyLineWorkflow(liffDouble(), fetcher)).resolves.toBe("TEMPORARILY_UNAVAILABLE");
  });
});

describe("non-authoritative login retry latch", () => {
  it("reports a repeated login once and tolerates unavailable storage", () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value), removeItem: (key: string) => void saved.delete(key) };
    expect(consumeLineWorkflowLoginAttempt(storage)).toBe(false);
    markLineWorkflowLoginAttempt(storage);
    expect([...saved.values()]).toEqual(["1"]);
    expect(consumeLineWorkflowLoginAttempt(storage)).toBe(true);
    expect(consumeLineWorkflowLoginAttempt(storage)).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined };
    expect(() => markLineWorkflowLoginAttempt(broken)).not.toThrow();
    expect(consumeLineWorkflowLoginAttempt(broken)).toBe(false);
  });
});
