import "server-only";

import { z } from "zod";

import { getLineLoginEnv } from "@/lib/env/server";

import { LineFailure } from "../domain/line-errors";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";
import type { LineMiniAppConfiguration } from "../services/line-mini-app-configuration";

const lineIdentitySchema = z.object({
  iss: z.literal("https://access.line.me"),
  sub: z.string().regex(/^U[0-9a-f]{32}$/iu),
  aud: z.string(),
  exp: z.number().int().positive(),
  iat: z.number().int().positive().optional(),
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

export type VerifiedLineIdentity = { subject: string; issuedAt?: Date; expiresAt?: Date };
export type VerifiedFreshLineIdentity = VerifiedLineIdentity & { verifiedAt: Date; expiresAt: Date };
export type VerifiedLineFriendship = { friend: boolean };

type IdTokenVerification =
  | { status: "VERIFIED"; subject: string; issuedAt?: number; expiresAt: number }
  | { status: "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "RESPONSE_INVALID" | "WRONG_AUDIENCE" | "EXPIRED" };

/** Private low-level call. Each exported entry point selects its own server-owned audience. */
async function verifyIdTokenForAudience(
  idToken: string,
  audience: string,
  fetcher: typeof fetch,
): Promise<IdTokenVerification> {
  const body = new URLSearchParams({ id_token: idToken, client_id: audience });
  let response: Response;
  try {
    response = await fetcher("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return { status: "PROVIDER_UNAVAILABLE" };
  }
  if (response.status >= 500 || response.status === 429) return { status: "PROVIDER_UNAVAILABLE" };
  const result = lineIdentitySchema.safeParse(await readJson(response));
  if (!response.ok) return { status: "PROVIDER_REJECTED" };
  if (!result.success) return { status: "RESPONSE_INVALID" };
  if (result.data.aud !== audience) return { status: "WRONG_AUDIENCE" };
  if (result.data.exp <= Math.floor(Date.now() / 1000)) return { status: "EXPIRED" };
  return { status: "VERIFIED", subject: result.data.sub, issuedAt: result.data.iat, expiresAt: result.data.exp };
}

export async function verifyFreshLineIdToken(
  idToken: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedFreshLineIdentity> {
  const { DEMI_LINE_LOGIN_CHANNEL_ID } = getLineLoginEnv();
  const result = await verifyIdTokenForAudience(idToken, DEMI_LINE_LOGIN_CHANNEL_ID, fetcher);
  if (result.status === "PROVIDER_UNAVAILABLE") throw new LineFailure("LINE_PROVIDER_TRANSIENT");
  if (result.status !== "VERIFIED") throw new LineFailure("LINE_TOKEN_INVALID_OR_EXPIRED");
  return { subject: result.subject, issuedAt: result.issuedAt ? new Date(result.issuedAt * 1000) : undefined, expiresAt: new Date(result.expiresAt * 1000), verifiedAt: new Date() };
}

export type VerifiedMiniAppWorkflowIdentity = { subject: string; expiresAt: Date; verifiedAt: Date };

/**
 * MINI workflow proof only. The audience is the selected deployment tuple's
 * channel; Account LIFF tokens fail as wrong audience and are never retried.
 */
export async function verifyMiniAppWorkflowIdToken(
  idToken: string,
  configuration: Pick<LineMiniAppConfiguration, "channelId">,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedMiniAppWorkflowIdentity> {
  const result = await verifyIdTokenForAudience(idToken, configuration.channelId, fetcher);
  switch (result.status) {
    case "VERIFIED":
      return { subject: result.subject, expiresAt: new Date(result.expiresAt * 1000), verifiedAt: new Date() };
    case "PROVIDER_UNAVAILABLE":
      throw new LineWorkflowFailure("LINE_PROVIDER_UNAVAILABLE");
    case "RESPONSE_INVALID":
      throw new LineWorkflowFailure("LINE_PROVIDER_RESPONSE_INVALID");
    case "WRONG_AUDIENCE":
      throw new LineWorkflowFailure("LINE_WRONG_AUDIENCE");
    default:
      throw new LineWorkflowFailure("LINE_IDENTITY_INVALID");
  }
}

export async function verifyLineIdToken(idToken: string, fetcher: typeof fetch = fetch): Promise<VerifiedLineIdentity> {
  const verified = await verifyFreshLineIdToken(idToken, fetcher);
  return { subject: verified.subject };
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
