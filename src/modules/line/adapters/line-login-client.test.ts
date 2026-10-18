import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineFailure } from "../domain/line-errors";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import { verifyFreshLineIdToken, verifyLineFriendship, verifyLineIdToken, verifyMiniAppWorkflowIdToken } from "./line-login-client";

const SUBJECT = `U${"a".repeat(32)}`;

function setLoginEnvironment(): void {
  vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
  vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
  vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
}

describe("LINE Login adapter", () => {
  beforeEach(setLoginEnvironment);
  afterEach(() => vi.unstubAllEnvs());

  it("sends the raw ID token to LINE verification and returns only the verified subject", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      iss: "https://access.line.me",
      sub: SUBJECT,
      aud: "1234567890",
      exp: Math.floor(Date.now() / 1000) + 60,
      name: "must not be returned",
    }));
    await expect(verifyLineIdToken("raw-id-token", fetcher)).resolves.toEqual({ subject: SUBJECT });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(new URLSearchParams(String(init?.body)).get("id_token")).toBe("raw-id-token");
    expect(new URLSearchParams(String(init?.body)).get("client_id")).toBe("1234567890");
  });

  it.each([
    ["wrong audience", { aud: "9999999999" }],
    ["expired ID token", { exp: 1 }],
  ])("rejects a %s", async (_label, changes) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      iss: "https://access.line.me",
      sub: SUBJECT,
      aud: "1234567890",
      exp: Math.floor(Date.now() / 1000) + 60,
      ...changes,
    }));
    await expect(verifyLineIdToken("raw-id-token", fetcher)).rejects.toMatchObject({ code: "LINE_TOKEN_INVALID_OR_EXPIRED" });
  });

  it("distinguishes LINE verification outages from invalid identity tokens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(verifyLineIdToken("raw-id-token", fetcher)).rejects.toMatchObject({ code: "LINE_PROVIDER_TRANSIENT" });
  });

  it("verifies the access token channel and profile subject before persisting friendFlag only", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: "1234567890", scope: "openid profile", expires_in: 60 }))
      .mockResolvedValueOnce(Response.json({ userId: SUBJECT, displayName: "must not escape" }))
      .mockResolvedValueOnce(Response.json({ friendFlag: true }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, fetcher)).resolves.toEqual({ friend: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [verifyUrl] = fetcher.mock.calls[0];
    expect(new URL(String(verifyUrl)).searchParams.get("access_token")).toBe("temporary-access-token");
    expect(fetcher.mock.calls[1][0]).toBe("https://api.line.me/v2/profile");
    expect(fetcher.mock.calls[2][0]).toBe("https://api.line.me/friendship/v1/status");
  });

  it("fails closed if the verified profile belongs to another LINE subject", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: "1234567890", scope: "profile", expires_in: 60 }))
      .mockResolvedValueOnce(Response.json({ userId: `U${"b".repeat(32)}` }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, fetcher)).rejects.toBeInstanceOf(LineFailure);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("leaves reachability unknown when profile scope is missing or provider is unavailable", async () => {
    const missingScope = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ client_id: "1234567890", scope: "openid", expires_in: 60 }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, missingScope)).rejects.toMatchObject({ code: "FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE" });
    expect(missingScope).toHaveBeenCalledOnce();

    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error("network error"));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, unavailable)).rejects.toMatchObject({ code: "FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE" });

    const wrongChannel = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ client_id: "9999999999", scope: "profile", expires_in: 60 }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, wrongChannel)).rejects.toMatchObject({ code: "FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE" });

    const expiredAccessToken = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ client_id: "1234567890", scope: "profile", expires_in: 0 }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, expiredAccessToken)).rejects.toMatchObject({ code: "FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE" });
  });

  it("persists only a false friendFlag outcome", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: "1234567890", scope: "profile", expires_in: 60 }))
      .mockResolvedValueOnce(Response.json({ userId: SUBJECT, displayName: "discarded" }))
      .mockResolvedValueOnce(Response.json({ friendFlag: false }));
    await expect(verifyLineFriendship("temporary-access-token", SUBJECT, fetcher)).resolves.toEqual({ friend: false });
  });
});

describe("MINI App workflow ID-token verifier", () => {
  const MINI = { channelId: "2000000001" };
  const valid = (changes: Record<string, unknown> = {}): Record<string, unknown> => ({
    iss: "https://access.line.me",
    sub: SUBJECT,
    aud: MINI.channelId,
    exp: Math.floor(Date.now() / 1000) + 600,
    name: "synthetic display name",
    picture: "https://profile.example/picture",
    ...changes,
  });

  beforeEach(setLoginEnvironment);
  afterEach(() => vi.unstubAllEnvs());

  async function failureCode(promise: Promise<unknown>): Promise<string> {
    const error = await promise.then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(LineWorkflowFailure);
    return (error as LineWorkflowFailure).code;
  }

  it("verifies against the server-selected MINI audience and keeps only subject and expiry", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(valid({ exp })));
    const verified = await verifyMiniAppWorkflowIdToken("raw-mini-id-token", MINI, fetcher);
    expect(verified.subject).toBe(SUBJECT);
    expect(verified.expiresAt.getTime()).toBe(exp * 1000);
    expect(Object.keys(verified).sort()).toEqual(["expiresAt", "subject", "verifiedAt"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("client_id")).toBe("2000000001");
    expect(body.get("id_token")).toBe("raw-mini-id-token");
  });

  it.each([
    ["invalid issuer", { iss: "https://attacker.example" }, "LINE_PROVIDER_RESPONSE_INVALID"],
    ["malformed subject", { sub: "U123" }, "LINE_PROVIDER_RESPONSE_INVALID"],
    ["missing expiry", { exp: undefined }, "LINE_PROVIDER_RESPONSE_INVALID"],
    ["Account audience", { aud: "1234567890" }, "LINE_WRONG_AUDIENCE"],
    ["other MINI environment audience", { aud: "2000000002" }, "LINE_WRONG_AUDIENCE"],
    ["expired token", { exp: Math.floor(Date.now() / 1000) - 1 }, "LINE_IDENTITY_INVALID"],
  ])("rejects a successful response with %s", async (_label, changes, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(valid(changes)));
    expect(await failureCode(verifyMiniAppWorkflowIdToken("raw-mini-id-token", MINI, fetcher))).toBe(code);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-JSON successful provider response as malformed", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>ok</html>", { status: 200 }));
    expect(await failureCode(verifyMiniAppWorkflowIdToken("raw-mini-id-token", MINI, fetcher))).toBe("LINE_PROVIDER_RESPONSE_INVALID");
  });

  it("classifies provider rejection as invalid identity without retrying another audience", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: "invalid_request", error_description: "IdToken expired. secret-provider-detail" }, { status: 400 },
    ));
    const error = await verifyMiniAppWorkflowIdToken("raw-mini-id-token", MINI, fetcher).catch((caught: unknown) => caught);
    expect((error as LineWorkflowFailure).code).toBe("LINE_IDENTITY_INVALID");
    expect(String((error as Error).message)).not.toContain("secret-provider-detail");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["timeout", () => Promise.reject(new DOMException("The operation timed out", "TimeoutError"))],
    ["network failure", () => Promise.reject(new TypeError("fetch failed"))],
    ["rate limiting", () => Promise.resolve(new Response("slow down", { status: 429 }))],
    ["server failure", () => Promise.resolve(new Response("down", { status: 503 }))],
  ])("treats provider %s as unavailable", async (_label, outcome) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(outcome);
    expect(await failureCode(verifyMiniAppWorkflowIdToken("raw-mini-id-token", MINI, fetcher))).toBe("LINE_PROVIDER_UNAVAILABLE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the Account verifier bound to the Account audience and its existing classifications", async () => {
    const miniToken = vi.fn<typeof fetch>().mockResolvedValue(Response.json(valid()));
    await expect(verifyFreshLineIdToken("mini-token", miniToken)).rejects.toMatchObject({ code: "LINE_TOKEN_INVALID_OR_EXPIRED" });
    expect(new URLSearchParams(String(miniToken.mock.calls[0][1]?.body)).get("client_id")).toBe("1234567890");
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));
    await expect(verifyFreshLineIdToken("account-token", malformed)).rejects.toMatchObject({ code: "LINE_TOKEN_INVALID_OR_EXPIRED" });
    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 502 }));
    await expect(verifyFreshLineIdToken("account-token", unavailable)).rejects.toBeInstanceOf(LineFailure);
    await expect(verifyFreshLineIdToken("account-token", unavailable)).rejects.toMatchObject({ code: "LINE_PROVIDER_TRANSIENT" });
  });
});
