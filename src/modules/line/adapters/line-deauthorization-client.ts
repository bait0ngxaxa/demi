import "server-only";

import { z } from "zod";
import { getLineLoginEnv } from "@/lib/env/server";
import { LineFailure } from "../domain/line-errors";
import type { LineProviderEvidence } from "../services/line-authorization-lifecycle-service";

const tokenResult = z.object({ client_id: z.string(), expires_in: z.number().int().positive(), scope: z.string() });
const userInfo = z.object({ sub: z.string().regex(/^U[0-9a-f]{32}$/iu) });
const channelToken = z.object({ access_token: z.string().min(1).max(8192), token_type: z.literal("Bearer"), expires_in: z.number().positive() });

/** LINE's documented access-token verification endpoint mandates this provider-only
 * HTTPS query. Never log its URL or return it to the browser (operator privacy review).
 */
export async function verifyLineTerminationToken(accessToken: string, fetcher: typeof fetch = fetch, signal = AbortSignal.timeout(10_000)): Promise<string> {
  try {
    // Explicit operator privacy exception for LINE's mandated outbound query.
    // Staged/absent approval cannot send a sensitive URL even to LINE.
    if (process.env.DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED !== "true") throw new Error();
    const url = new URL("https://api.line.me/oauth2/v2.1/verify");
    url.searchParams.set("access_token", accessToken);
    const response = await fetcher(url, { signal, cache: "no-store", redirect: "error" });
    const verified = tokenResult.safeParse(await response.json());
    if (!response.ok || !verified.success || verified.data.client_id !== getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID ||
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

/** One bounded operation, no retries/caching/persistence. Obtain a stateless token
 * using ONLY the fixed Account Login channel ID + its own server-side secret.
 * The callback fences the durable reservation immediately before the send.
 */
export async function deauthorizeLineAccount(
  accessToken: string, expectedSubject: string, mayDispatch: () => Promise<boolean>, fetcher: typeof fetch = fetch,
): Promise<LineProviderEvidence> {
  const signal = AbortSignal.timeout(10_000);
  let submitted = false;
  try {
    const subject = await verifyLineTerminationToken(accessToken, fetcher, signal);
    if (subject !== expectedSubject) return "KNOWN_NOT_DISPATCHED";
    const secret = z.string().regex(/^[A-Za-z0-9+/=_-]{16,1024}$/u).parse(process.env.DEMI_LINE_LOGIN_CHANNEL_SECRET);
    const credentials = await fetcher("https://api.line.me/oauth2/v3/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID, client_secret: secret }),
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
