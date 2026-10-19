import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deauthorizeLineAccount, deauthorizeLineMiniApp } from "./line-deauthorization-client";

const subject = `U${"a".repeat(32)}`;
const userToken = "transient-user-access-token";
const json = (value: unknown, status = 200): Response => Response.json(value, { status });

function provider(status = 204) {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(json({ client_id: "1234567890", scope: "openid", expires_in: 60 }))
    .mockResolvedValueOnce(json({ sub: subject }))
    .mockResolvedValueOnce(json({ access_token: "account-stateless-channel-token", token_type: "Bearer", expires_in: 900 }))
    .mockResolvedValueOnce(status === 204 ? new Response(null, { status }) : json({ confidential: "do not expose" }, status));
}

describe("Account Login deauthorization boundary", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890"); vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "test-identity-secret-at-least-32-chars"); vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", "account-login-secret-only");
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "must-never-be-used");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifies audience/subject, obtains Account credential, fences reservation, and accepts only 204", async () => {
    const fetcher = provider(); const fence = vi.fn(async () => true);
    expect(await deauthorizeLineAccount(userToken, subject, fence, fetcher)).toBe("PROVIDER_204");
    expect(fence).toHaveBeenCalledOnce();
    const credentials = fetcher.mock.calls[2]; const sent = fetcher.mock.calls[3];
    expect(String(credentials[1]?.body)).toContain("client_id=1234567890&client_secret=account-login-secret-only");
    expect(sent[0]).toBe("https://api.line.me/user/v1/deauthorize");
    expect(sent[1]?.body).toBe(JSON.stringify({ userAccessToken: userToken }));
    expect(sent[1]?.headers).toMatchObject({ authorization: "Bearer account-stateless-channel-token" });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("must-never-be-used");
    expect(fetcher.mock.calls.every((call) => call[1]?.cache === "no-store" && call[1]?.redirect === "error")).toBe(true);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(sent[1]?.signal);
  });
  it.each([400, 401, 403, 429, 500, 503, 200, 202])("never claims success for HTTP %s and never retries", async (status) => {
    const fetcher = provider(status);
    expect(await deauthorizeLineAccount(userToken, subject, async () => true, fetcher)).toBe([400, 401, 403].includes(status) ? "PROVIDER_REJECTED" : "POSSIBLY_DISPATCHED");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each(["wrong audience", "expired", "malformed"])("does not dispatch a %s token", async (reason) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(reason === "malformed" ? {} : { client_id: reason === "wrong audience" ? "2222222222" : "1234567890", scope: "openid", expires_in: reason === "expired" ? 0 : 60 }));
    expect(await deauthorizeLineAccount(userToken, subject, async () => true, fetcher)).toBe("KNOWN_NOT_DISPATCHED");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not target another identity", async () => {
    const fetcher = provider();
    expect(await deauthorizeLineAccount(userToken, `U${"b".repeat(32)}`, async () => true, fetcher)).toBe("KNOWN_NOT_DISPATCHED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails safely without Account credentials", async () => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", ""); const fetcher = provider();
    expect(await deauthorizeLineAccount(userToken, subject, async () => true, fetcher)).toBe("KNOWN_NOT_DISPATCHED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("sends the token-bearing verification query only to the fixed LINE endpoint, without any runtime switch", async () => {
    vi.stubEnv("DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED", undefined); const fetcher = provider();
    expect(await deauthorizeLineAccount(userToken, subject, async () => true, fetcher)).toBe("PROVIDER_204");
    const verifyUrl = fetcher.mock.calls[0][0];
    expect(verifyUrl).toBeInstanceOf(URL);
    expect(`${(verifyUrl as URL).origin}${(verifyUrl as URL).pathname}`).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect((verifyUrl as URL).searchParams.get("access_token")).toBe(userToken);
    // Every other request carries the token only in headers/body, never in a URL.
    expect(fetcher.mock.calls.slice(1).every((call) => !String(call[0]).includes(userToken))).toBe(true);
    expect(fetcher.mock.calls.every((call) => String(call[0]).startsWith("https://api.line.me/"))).toBe(true);
  });
  it("does not send after generation/recovery boundary changes", async () => {
    const fetcher = provider();
    expect(await deauthorizeLineAccount(userToken, subject, async () => false, fetcher)).toBe("KNOWN_NOT_DISPATCHED");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves uncertainty after a potentially submitted timeout", async () => {
    const fetcher = provider(); fetcher.mockReset();
    fetcher.mockResolvedValueOnce(json({ client_id: "1234567890", scope: "openid", expires_in: 60 })).mockResolvedValueOnce(json({ sub: subject }))
      .mockResolvedValueOnce(json({ access_token: "channel", token_type: "Bearer", expires_in: 900 })).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await deauthorizeLineAccount(userToken, subject, async () => true, fetcher)).toBe("POSSIBLY_DISPATCHED");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("uses only the selected MINI audience and MINI channel secret", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ client_id: "2000000001", scope: "openid", expires_in: 60 }))
      .mockResolvedValueOnce(json({ sub: subject }))
      .mockResolvedValueOnce(json({ access_token: "mini-stateless-channel-token", token_type: "Bearer", expires_in: 900 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await deauthorizeLineMiniApp(userToken, subject, {
      channelId: "2000000001", channelSecret: "mini-only-secret", environment: "DEVELOPING",
    }, async () => true, fetcher);
    expect(result).toBe("PROVIDER_204");
    expect(String(fetcher.mock.calls[2][1]?.body)).toContain("client_id=2000000001&client_secret=mini-only-secret");
    expect(fetcher.mock.calls[3][1]?.headers).toMatchObject({ authorization: "Bearer mini-stateless-channel-token" });
    expect(fetcher.mock.calls[3][1]?.body).toBe(JSON.stringify({ userAccessToken: userToken }));
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("account-login-secret-only");
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("must-never-be-used");
  });

  it("rejects an Account-audience access token on the MINI deauthorization path", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ client_id: "1234567890", scope: "openid", expires_in: 60 }));
    expect(await deauthorizeLineMiniApp(userToken, subject, {
      channelId: "2000000001", channelSecret: "mini-only-secret", environment: "DEVELOPING",
    }, async () => true, fetcher)).toBe("KNOWN_NOT_DISPATCHED");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
