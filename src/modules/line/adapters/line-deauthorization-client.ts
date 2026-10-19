import "server-only";

import { z } from "zod";
import { getLineLoginEnv } from "@/lib/env/server";
import { LineFailure } from "../domain/line-errors";
import type { LineProviderEvidence } from "../domain/line-authorization-lifecycle";

export type LineMiniAppDeauthorizationCredentials = {
  channelId: string;
  channelSecret: string;
  environment: "DEVELOPING" | "REVIEW" | "PUBLISHED";
};

const tokenResult = z.object({ client_id: z.string(), expires_in: z.number().int().positive(), scope: z.string() });
const userInfo = z.object({ sub: z.string().regex(/^U[0-9a-f]{32}$/iu) });
const channelToken = z.object({ access_token: z.string().min(1).max(8192), token_type: z.literal("Bearer"), expires_in: z.number().positive() });

/** LINE's documented access-token verification endpoint mandates this provider-only
 * HTTPS query. The URL is built only here, sent only to the fixed LINE host,
 * never logged, persisted, retried or returned to the browser, and redirects
 * are refused. Callers reach it only from an explicit authorized unlink.
 */
async function verifyLineUserAccessToken(
  accessToken: string,
  expectedChannelId: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  try {
    const url = new URL("https://api.line.me/oauth2/v2.1/verify");
    url.searchParams.set("access_token", accessToken);
    const response = await fetcher(url, { signal, cache: "no-store", redirect: "error" });
    const verified = tokenResult.safeParse(await response.json());
    if (!response.ok || !verified.success || verified.data.client_id !== expectedChannelId ||
        !verified.data.scope.split(/\s+/u).includes("openid")) throw new Error();
    const identityResponse = await fetcher("https://api.line.me/oauth2/v2.1/userinfo", {
      method: "POST", headers: { authorization: `Bearer ${accessToken}` }, signal, cache: "no-store", redirect: "error",
    });
    const identity = userInfo.safeParse(await identityResponse.json());
    if (!identityResponse.ok || !identity.success || signal.aborted) throw new Error();
    return identity.data.sub;
  } catch {
    throw new LineFailure("LINE_TOKEN_INVALID_OR_EXPIRED");
  }
}

export async function verifyLineTerminationToken(accessToken: string, fetcher: typeof fetch = fetch, signal = AbortSignal.timeout(10_000)): Promise<string> {
  return verifyLineUserAccessToken(accessToken, getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID, fetcher, signal);
}

/** One bounded channel operation, no retries/caching/persistence. The provider
 * token is minted from the exact audience channel's own credentials. The
 * callback fences the durable reservation immediately before the send.
 */
async function deauthorizeLineChannel(
  accessToken: string, expectedSubject: string, mayDispatch: () => Promise<boolean>, fetcher: typeof fetch = fetch,
  channelId: string,
  channelSecretValue: unknown,
): Promise<LineProviderEvidence> {
  const signal = AbortSignal.timeout(10_000);
  let submitted = false;
  try {
    const subject = await verifyLineUserAccessToken(accessToken, channelId, fetcher, signal);
    if (subject !== expectedSubject) return "KNOWN_NOT_DISPATCHED";
    const secret = z.string().regex(/^[A-Za-z0-9+/=_-]{16,1024}$/u).parse(channelSecretValue);
    const credentials = await fetcher("https://api.line.me/oauth2/v3/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: channelId, client_secret: secret }),
      signal, cache: "no-store", redirect: "error",
    });
    const credential = channelToken.safeParse(await credentials.json());
    if (!credentials.ok || !credential.success || signal.aborted || !await mayDispatch() || signal.aborted) return "KNOWN_NOT_DISPATCHED";
    submitted = true;
    const response = await fetcher("https://api.line.me/user/v1/deauthorize", {
      method: "POST", headers: { authorization: `Bearer ${credential.data.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ userAccessToken: accessToken }), signal, cache: "no-store", redirect: "error",
    });
    if (response.status === 204) return "PROVIDER_204";
    if ([400, 401, 403].includes(response.status)) return "PROVIDER_REJECTED";
    return "POSSIBLY_DISPATCHED";
  } catch {
    return submitted ? "POSSIBLY_DISPATCHED" : "KNOWN_NOT_DISPATCHED";
  }
}

/** Account Login termination is permanently bound to Account channel credentials. */
export async function deauthorizeLineAccount(
  accessToken: string, expectedSubject: string, mayDispatch: () => Promise<boolean>, fetcher: typeof fetch = fetch,
): Promise<LineProviderEvidence> {
  return deauthorizeLineChannel(accessToken, expectedSubject, mayDispatch, fetcher,
    getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID, process.env.DEMI_LINE_LOGIN_CHANNEL_SECRET);
}

/** MINI termination cannot consume Account credentials or an Account-audience token. */
export async function deauthorizeLineMiniApp(
  accessToken: string,
  expectedSubject: string,
  credentials: LineMiniAppDeauthorizationCredentials,
  mayDispatch: () => Promise<boolean>,
  fetcher: typeof fetch = fetch,
): Promise<LineProviderEvidence> {
  return deauthorizeLineChannel(accessToken, expectedSubject, mayDispatch, fetcher,
    credentials.channelId, credentials.channelSecret);
}
