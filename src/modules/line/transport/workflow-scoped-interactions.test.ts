import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  liveSession: vi.fn(),
  cookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/modules/auth/services/exact-session-service", () => ({ getLiveExactSession: mocks.liveSession }));
vi.mock("../services/line-workflow-service", () => ({ runLineWorkflowScopedInteraction: mocks.run }));

import { LineWorkflowFailure, type LineWorkflowFailureCode } from "../domain/line-workflow-errors";
import type { LineMiniAppConfiguration } from "../services/line-mini-app-configuration";
import { handleLineWorkflowInteractionRequest } from "./workflow-scoped-interactions";

const ORIGIN = "https://demi.example.org";
const URL_ACK = `${ORIGIN}/line/workflow/appointments/acknowledge`;
const CONTEXT = "v1.k1.synthetic-context";
const configuration: LineMiniAppConfiguration = {
  environment: "DEVELOPING", channelId: "2000000001", liffId: "2000000001-MiniDev",
  origin: ORIGIN, endpointUrl: `${ORIGIN}/line/workflow`, deploymentReference: "deploy:dev-1",
};
const ack = { patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111", appointmentId: "22222222-2222-4222-8222-222222222222",
  expectedUpdatedAt: "2026-10-01T00:00:00.000Z" };
const cancellation = { ...ack, submissionNonce: "33333333-3333-4333-8333-333333333333" };
const SENSITIVE = /11111111-1111|22222222-2222|33333333-3333|synthetic-context|raw driver|U[0-9a-f]{32}/u;

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request(URL_ACK, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body,
  });
}

const handle = (request: Request, interaction: "ACKNOWLEDGE" | "CANCELLATION_REQUEST" = "ACKNOWLEDGE") =>
  handleLineWorkflowInteractionRequest(request, interaction, { enabled: () => true, configuration: () => configuration });

async function expectSensitiveHeaders(response: Response): Promise<void> {
  expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
}

describe("fixed scoped interaction Route Handler transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookie.mockReturnValue({ value: CONTEXT });
    mocks.run.mockResolvedValue({ appointmentId: ack.appointmentId, sourceAppointmentUpdatedAt: new Date(), acknowledgedAt: new Date() });
  });

  it("returns only the finite operation on success, with the sensitive headers and no identifiers", async () => {
    const response = await handle(post(JSON.stringify(ack)));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "SUCCESS", operation: "ACKNOWLEDGED" });
    expect(text).not.toMatch(SENSITIVE);
    await expectSensitiveHeaders(response);
    expect(mocks.run).toHaveBeenCalledWith(CONTEXT, "ACKNOWLEDGE", ack, expect.objectContaining({ liveSession: expect.any(Function) }));
  });

  it("passes the cancellation nonce through the existing schema and reports a request, not a cancellation", async () => {
    const response = await handle(post(JSON.stringify(cancellation)), "CANCELLATION_REQUEST");
    expect(await response.json()).toEqual({ status: "SUCCESS", operation: "CANCELLATION_REQUESTED" });
    expect(mocks.run).toHaveBeenCalledWith(CONTEXT, "CANCELLATION_REQUEST", cancellation, expect.anything());
  });

  it("stays disabled by default before any other work", async () => {
    const response = await handleLineWorkflowInteractionRequest(post(JSON.stringify(ack)), "ACKNOWLEDGE", { configuration: () => configuration });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "ERROR", code: "NOT_ACTIVATED" });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.cookie).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["null", { origin: "null" }],
    ["foreign", { origin: "https://attacker.example" }],
    ["malformed", { origin: "demi.example.org" }],
    ["same host, other scheme", { origin: "http://demi.example.org" }],
    ["trailing slash", { origin: `${ORIGIN}/` }],
  ])("rejects a %s Origin before reading the body or cookie", async (_label, origin) => {
    const request = new Request(URL_ACK, { method: "POST", headers: { "content-type": "application/json", ...origin }, body: JSON.stringify(ack) });
    if (!("origin" in origin)) request.headers.delete("origin");
    const response = await handle(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "ERROR", code: "ORIGIN_DENIED" });
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each([
    ["a Server Action dispatch header", post(JSON.stringify(ack), { "next-action": "7f".repeat(21) })],
    ["form content", post("patientHospitalRelationshipId=x", { "content-type": "application/x-www-form-urlencoded" })],
    ["multipart action content", post("--b--", { "content-type": "multipart/form-data; boundary=b" })],
    ["text/plain", post(JSON.stringify(ack), { "content-type": "text/plain" })],
    ["a missing content type", new Request(URL_ACK, { method: "POST", headers: { origin: ORIGIN }, body: new Blob([JSON.stringify(ack)]) })],
    ["malformed JSON", post("{\"appointmentId\":")],
    ["invalid UTF-8", post(new Uint8Array([0x7b, 0xff, 0x7d]))],
    ["an empty body", post(null)],
    ["a JSON array", post(JSON.stringify([ack]))],
    ["an unexpected field", post(JSON.stringify({ ...ack, returnTo: "/app" }))],
    ["an identity field", post(JSON.stringify({ ...ack, userId: "44444444-4444-4444-8444-444444444444" }))],
    ["a duplicate field", post(`{"patientHospitalRelationshipId":"${ack.patientHospitalRelationshipId}","appointmentId":"${ack.appointmentId}","appointmentId":"${ack.appointmentId}","expectedUpdatedAt":"${ack.expectedUpdatedAt}"}`)],
    ["an escaped duplicate field", post(`{"patientHospitalRelationshipId":"${ack.patientHospitalRelationshipId}","appointmentId":"${ack.appointmentId}","\\u0061ppointmentId":"${ack.appointmentId}","expectedUpdatedAt":"${ack.expectedUpdatedAt}"}`)],
    ["a missing field", post(JSON.stringify({ ...ack, expectedUpdatedAt: undefined }))],
    ["a nonce on acknowledgement", post(JSON.stringify(cancellation))],
    ["a declared oversized body", post(JSON.stringify(ack), { "content-length": String(64 * 1024) })],
    ["a streamed oversized body", post(JSON.stringify({ ...ack, padding: "x".repeat(4096) }))],
  ])("rejects %s with a sanitized 400 and no authorization work", async (_label, request) => {
    const response = await handle(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "ERROR", code: "REQUEST_INVALID" });
    expect(mocks.run).not.toHaveBeenCalled();
    await expectSensitiveHeaders(response);
  });

  it("requires the cancellation nonce", async () => {
    const response = await handle(post(JSON.stringify(ack)), "CANCELLATION_REQUEST");
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("hands an absent workflow cookie to the mandatory guard, which denies", async () => {
    mocks.cookie.mockReturnValue(undefined);
    mocks.run.mockRejectedValue(new LineWorkflowFailure("SCOPE_MISSING"));
    const response = await handle(post(JSON.stringify(ack)));
    expect(mocks.run).toHaveBeenCalledWith(undefined, "ACKNOWLEDGE", ack, expect.anything());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "ERROR", code: "SCOPE_MISSING" });
  });

  it.each([
    ["WORKFLOW_DISABLED", 503, "NOT_ACTIVATED"],
    ["LIFECYCLE_UNAVAILABLE", 503, "NOT_ACTIVATED"],
    ["MINI_CONFIGURATION_UNAVAILABLE", 503, "NOT_ACTIVATED"],
    ["SCOPE_INVALID", 403, "SCOPE_MISSING"],
    ["SCOPE_EXPIRED", 403, "SCOPE_EXPIRED"],
    ["SCOPE_REVOKED", 403, "SCOPE_REVOKED"],
    ["SCOPE_SESSION_MISMATCH", 403, "SESSION_MISMATCH"],
    ["LOGIN_REQUIRED", 401, "LOGIN_REQUIRED"],
    ["SESSION_UNAVAILABLE", 503, "AUTH_UNAVAILABLE"],
    ["RATE_LIMITED", 429, "RATE_LIMITED"],
    ["WORKFLOW_INELIGIBLE", 403, "INELIGIBLE"],
    ["INFRASTRUCTURE_UNAVAILABLE", 503, "TEMPORARILY_UNAVAILABLE"],
  ] as Array<[LineWorkflowFailureCode, number, string]>)("maps %s to a finite %i state", async (failure, status, code) => {
    mocks.run.mockRejectedValue(new LineWorkflowFailure(failure));
    const response = await handle(post(JSON.stringify(ack)));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "ERROR", code });
    await expectSensitiveHeaders(response);
  });

  it.each([
    [new ConflictError("This Appointment changed before it was acknowledged"), 409, "CONFLICT"],
    [new NotFoundError(), 404, "RESOURCE_INVALID"],
    [new ForbiddenError(), 403, "INELIGIBLE"],
    [new ValidationError(), 400, "REQUEST_INVALID"],
    [new Error("raw driver text U0123456789abcdef0123456789abcdef"), 503, "TEMPORARILY_UNAVAILABLE"],
  ])("keeps domain conflict, authorization and infrastructure distinct without raw text (%s)", async (error, status, code) => {
    mocks.run.mockRejectedValue(error);
    const response = await handle(post(JSON.stringify(ack)));
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "ERROR", code });
    expect(text).not.toMatch(SENSITIVE);
  });

  it("merges the Supabase SSR cache headers emitted by the exact-session check, then its own stricter superset", async () => {
    mocks.liveSession.mockImplementation(async (options: { onResponseHeaders?: (headers: Record<string, string>) => void }) => {
      options.onResponseHeaders?.({ "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0", expires: "0", pragma: "no-cache", vary: "Cookie" });
      return { userId: "u", sessionId: "s", authSubject: "a", checkedAt: new Date() };
    });
    mocks.run.mockImplementation(async (_credential, _interaction, _input, dependencies: { liveSession: () => Promise<unknown> }) => {
      await dependencies.liveSession();
      throw new LineWorkflowFailure("SCOPE_REVOKED");
    });
    const response = await handle(post(JSON.stringify(ack)));
    expect(mocks.liveSession).toHaveBeenCalledOnce();
    expect(response.headers.get("vary")).toBe("Cookie");
    await expectSensitiveHeaders(response);
  });
});
