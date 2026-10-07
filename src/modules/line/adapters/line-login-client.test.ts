import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineFailure } from "../domain/line-errors";
import { verifyLineFriendship, verifyLineIdToken } from "./line-login-client";

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
