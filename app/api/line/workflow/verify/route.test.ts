import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), issue: vi.fn(), consumeLimit: vi.fn() }));
vi.mock("@/modules/line/services/line-workflow-service", () => ({
  evaluateLineWorkflowEligibility: mocks.evaluate,
  issueLineWorkflowContext: mocks.issue,
}));
vi.mock("@/modules/line/services/line-workflow-rate-limit", () => ({
  createLineWorkflowRateLimiter: () => ({ consume: mocks.consumeLimit }),
}));

import { LineWorkflowFailure } from "@/modules/line/domain/line-workflow-errors";
import { handleLineWorkflowVerifyRequest, lineWorkflowResponseHeaders } from "@/modules/line/transport/workflow-http";

import { POST } from "./route";

const ORIGIN = "https://demi.example.org";
const TOKEN = "synthetic.mini.id-token-value";

function enableMini(): void {
  for (const [name, value] of Object.entries({
    DEMI_LINE_MINI_APP_WORKFLOW_ENABLED: "true",
    DEMI_LINE_MINI_APP_ISSUANCE_ENABLED: "true",
    DEMI_LINE_PUBLIC_ORIGIN: ORIGIN,
    DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING",
    DEMI_LINE_MINI_APP_CHANNEL_ID: "2000000001",
    DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-MiniDev",
    DEMI_LINE_MINI_APP_ENDPOINT_URL: `${ORIGIN}/line/workflow`,
    DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE: "deploy:dev-1",
  })) vi.stubEnv(name, value);
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/line/workflow/verify`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function expectCode(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("POST /api/line/workflow/verify activation fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLimit.mockResolvedValue(true);
    mocks.evaluate.mockResolvedValue({ userId: "u", sessionId: "s", bindingId: "b", bindingVersion: 1, proofExpiresAt: new Date(), miniTupleKey: "t" });
    mocks.issue.mockResolvedValue({ value: "v1.k1.synthetic.ciphertext.tag", expiresAt: new Date(Date.now() + 60_000) });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "false", "TRUE"])("is disabled by default (%s) before Origin, body or provider work", async (value) => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", value);
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }, { origin: "https://attacker.example" })), 503, "WORKFLOW_DISABLED");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("does not issue a scope when the separate issuance gate is missing", async () => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_ISSUANCE_ENABLED", undefined);
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN })), 503, "WORKFLOW_NOT_ACTIVATED");
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("fails closed when the enabled gate has no valid MINI configuration", async () => {
    enableMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_ID", undefined);
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN })), 503, "MINI_CONFIGURATION_UNAVAILABLE");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("issues the encrypted context only after eligibility succeeds and returns the finite continuation", async () => {
    enableMini();
    const eligibility = {
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      bindingId: "33333333-3333-4333-8333-333333333333",
      bindingVersion: 2,
      proofExpiresAt: new Date(Date.now() + 60_000),
      miniTupleKey: "a".repeat(64),
    };
    mocks.evaluate.mockResolvedValue(eligibility);
    const response = await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ code: "SCOPE_GRANTED", continuation: "/line/workflow/appointments" });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("__Secure-DEMI_LINE_WORKFLOW=v1.k1.synthetic.ciphertext.tag");
    expect(cookie).toContain("Path=/line/workflow");
    expect(cookie).toMatch(/Max-Age=\d+/u);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
    expect(JSON.stringify(responseBody)).not.toContain("synthetic.ciphertext");
    expect(mocks.issue).toHaveBeenCalledWith(eligibility, expect.objectContaining({ configuration: expect.any(Function) }));
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("retains unrelated Supabase headers while normalized workflow policy wins case-insensitively", () => {
    const headers = lineWorkflowResponseHeaders({
      "Cache-Control": "public, max-age=3600",
      "X-Supabase-Api-Version": "2026-10-01",
      "Content-Security-Policy": "frame-ancestors https://example.org",
    });
    expect(headers.get("cache-control")).toContain("private");
    expect(headers.get("cache-control")).toContain("no-store");
    expect(headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(headers.get("x-supabase-api-version")).toBe("2026-10-01");
    expect(headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("bounded verification transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLimit.mockResolvedValue(true);
    enableMini();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["missing Origin", { origin: "" }],
    ["null Origin", { origin: "null" }],
    ["foreign Origin", { origin: "https://attacker.example" }],
    ["Origin with path", { origin: `${ORIGIN}/` }],
    ["HTTP downgrade Origin", { origin: "http://demi.example.org" }],
  ])("rejects %s before reading the body", async (_label, headers) => {
    const response = await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }, headers));
    await expectCode(response, 403, "ORIGIN_DENIED");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it.each([
    ["non-JSON content type", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }, { "content-type": "text/plain" }],
    ["form content type", "intent=OPEN_PATIENT_APPOINTMENTS", { "content-type": "application/x-www-form-urlencoded" }],
    ["malformed JSON", "{", {}],
    ["duplicate request key", '{"intent":"OPEN_PATIENT_APPOINTMENTS","idToken":"synthetic.mini.id-token-value","idToken":"synthetic.mini.id-token-value"}', {}],
    ["unsupported intent", { intent: "OPEN_PATIENT_CARE", idToken: TOKEN }, {}],
    ["missing intent", { idToken: TOKEN }, {}],
    ["missing token", { intent: "OPEN_PATIENT_APPOINTMENTS" }, {}],
    ["array intent", { intent: ["OPEN_PATIENT_APPOINTMENTS"], idToken: TOKEN }, {}],
    ["client LINE userId", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, lineUserId: `U${"a".repeat(32)}` }, {}],
    ["client channel", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, client_id: "1000000001" }, {}],
    ["resource target", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, appointmentId: "x" }, {}],
    ["return target", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, returnTo: "https://attacker.example" }, {}],
    ["role selection", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, role: "PATIENT" }, {}],
    ["oversized token", { intent: "OPEN_PATIENT_APPOINTMENTS", idToken: "a".repeat(16_385) }, {}],
  ])("rejects %s", async (_label, body, headers) => {
    await expectCode(await POST(request(body, headers)), 400, "REQUEST_INVALID");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("enforces the actual streamed body limit, not only Content-Length", async () => {
    const huge = JSON.stringify({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN, padding: "x".repeat(40 * 1024) });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(huge)); controller.close(); } });
    const streamed = new Request(`${ORIGIN}/api/line/workflow/verify`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expectCode(await POST(streamed), 400, "REQUEST_INVALID");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("fails closed on shared limiter infrastructure failure before LINE verification", async () => {
    mocks.consumeLimit.mockRejectedValue(new LineWorkflowFailure("INFRASTRUCTURE_UNAVAILABLE"));
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN })), 503, "INFRASTRUCTURE_UNAVAILABLE");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("limits provider verification globally across application instances", async () => {
    mocks.consumeLimit.mockResolvedValue(false);
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN })), 429, "RATE_LIMITED");
    expect(mocks.consumeLimit).toHaveBeenCalledWith("VERIFY_GLOBAL", "GLOBAL", expect.any(Date));
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it.each([
    ["LOGIN_REQUIRED", 401, "LOGIN_REQUIRED"],
    ["ACCOUNT_MISMATCH", 403, "ACCOUNT_MISMATCH"],
    ["LINE_NOT_LINKED", 403, "LINE_NOT_LINKED"],
    ["BINDING_INCONSISTENT", 403, "WORKFLOW_INELIGIBLE"],
    ["WORKFLOW_INELIGIBLE", 403, "WORKFLOW_INELIGIBLE"],
    ["LINE_WRONG_AUDIENCE", 400, "LINE_IDENTITY_INVALID"],
    ["LINE_IDENTITY_INVALID", 400, "LINE_IDENTITY_INVALID"],
    ["LINE_PROVIDER_UNAVAILABLE", 503, "LINE_PROVIDER_UNAVAILABLE"],
    ["LINE_PROVIDER_RESPONSE_INVALID", 503, "LINE_PROVIDER_RESPONSE_INVALID"],
    ["LIFECYCLE_UNAVAILABLE", 503, "LIFECYCLE_UNAVAILABLE"],
    ["SESSION_UNAVAILABLE", 503, "SESSION_UNAVAILABLE"],
    ["RATE_LIMITED", 429, "RATE_LIMITED"],
  ] as const)("maps %s to a safe response", async (failure, status, code) => {
    mocks.evaluate.mockRejectedValue(new LineWorkflowFailure(failure));
    await expectCode(await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN })), status, code);
  });

  it("does not leak unexpected exception text, identities or tokens", async () => {
    mocks.evaluate.mockRejectedValue(new Error(`provider said ${TOKEN} for U${"a".repeat(32)}`));
    const response = await POST(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }));
    const text = await response.clone().text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("provider said");
    await expectCode(response, 503, "INFRASTRUCTURE_UNAVAILABLE");
  });

  it("passes the server-selected tuple to orchestration rather than any caller value", async () => {
    mocks.evaluate.mockRejectedValue(new LineWorkflowFailure("LOGIN_REQUIRED"));
    await handleLineWorkflowVerifyRequest(request({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: TOKEN }));
    const dependencies = mocks.evaluate.mock.calls[0][1] as { configuration: () => { channelId: string } };
    expect(dependencies.configuration().channelId).toBe("2000000001");
  });
});
