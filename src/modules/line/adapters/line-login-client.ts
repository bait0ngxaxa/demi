import "server-only";

import { z } from "zod";

import { getLineLoginEnv } from "@/lib/env/server";

import { LineFailure } from "../domain/line-errors";

const lineIdentitySchema = z.object({
  iss: z.literal("https://access.line.me"),
  sub: z.string().regex(/^U[0-9a-f]{32}$/iu),
  aud: z.string(),
  exp: z.number().int().positive(),
}).passthrough();

const lineAccessTokenSchema = z.object({
  client_id: z.string(),
  scope: z.string(),
  expires_in: z.number().int().nonnegative(),
}).passthrough();

const lineProfileSchema = z.object({
  userId: z.string().regex(/^U[0-9a-f]{32}$/iu),
}).passthrough();

const friendshipSchema = z.object({ friendFlag: z.boolean() }).passthrough();

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type VerifiedLineIdentity = { subject: string };
export type VerifiedLineFriendship = { friend: boolean };

export async function verifyLineIdToken(
  idToken: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedLineIdentity> {
  const { DEMI_LINE_LOGIN_CHANNEL_ID } = getLineLoginEnv();
  const body = new URLSearchParams({ id_token: idToken, client_id: DEMI_LINE_LOGIN_CHANNEL_ID });
  let response: Response;
  try {
    response = await fetcher("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new LineFailure("LINE_PROVIDER_TRANSIENT");
  }
  if (response.status >= 500 || response.status === 429) {
    throw new LineFailure("LINE_PROVIDER_TRANSIENT");
  }
  const result = lineIdentitySchema.safeParse(await readJson(response));
  if (!response.ok || !result.success || result.data.aud !== DEMI_LINE_LOGIN_CHANNEL_ID || result.data.exp <= Math.floor(Date.now() / 1000)) {
    throw new LineFailure("LINE_TOKEN_INVALID_OR_EXPIRED");
  }
  return { subject: result.data.sub };
}

export async function verifyLineFriendship(
  accessToken: string,
  expectedSubject: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedLineFriendship> {
  const { DEMI_LINE_LOGIN_CHANNEL_ID } = getLineLoginEnv();
  let verifyResponse: Response;
  try {
    const verifyUrl = new URL("https://api.line.me/oauth2/v2.1/verify");
    verifyUrl.searchParams.set("access_token", accessToken);
    verifyResponse = await fetcher(verifyUrl, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }
  const verified = lineAccessTokenSchema.safeParse(await readJson(verifyResponse));
  if (!verifyResponse.ok || !verified.success || verified.data.expires_in <= 0 || verified.data.client_id !== DEMI_LINE_LOGIN_CHANNEL_ID || !verified.data.scope.split(/\s+/u).includes("profile")) {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetcher("https://api.line.me/v2/profile", {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }
  const profile = lineProfileSchema.safeParse(await readJson(profileResponse));
  if (!profileResponse.ok || !profile.success || profile.data.userId !== expectedSubject) {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }

  let friendshipResponse: Response;
  try {
    friendshipResponse = await fetcher("https://api.line.me/friendship/v1/status", {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }
  const friendship = friendshipSchema.safeParse(await readJson(friendshipResponse));
  if (!friendshipResponse.ok || !friendship.success) {
    throw new LineFailure("FRIENDSHIP_UNKNOWN_OR_UNAVAILABLE");
  }
  return { friend: friendship.data.friendFlag };
}
