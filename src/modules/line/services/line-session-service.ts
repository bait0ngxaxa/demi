import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getLineLoginEnv } from "@/lib/env/server";
import { getPrisma } from "@/lib/db/prisma";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const claimsSchema = z.object({
  sub: z.string().min(1),
  session_id: z.string().uuid(),
}).passthrough();

export type CurrentLineSession = {
  userId: string;
  sessionHash: string;
};

export function hashLineSessionId(sessionId: string): string {
  const { IDENTITY_HASH_SECRET } = getLineLoginEnv();
  return createHmac("sha256", IDENTITY_HASH_SECRET)
    .update(`DEMI_LINE_SESSION_V1:${sessionId}`)
    .digest("hex");
}

export function timingSafeHashMatch(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(leftHex) || !/^[a-f0-9]{64}$/u.test(rightHex)) return false;
  return timingSafeEqual(Buffer.from(leftHex, "hex"), Buffer.from(rightHex, "hex"));
}

export async function getCurrentLineSession(): Promise<CurrentLineSession> {
  const client = await getServerSupabaseClient();
  const claimsResult = await client.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims) throw new UnauthenticatedError();
  const claims = claimsSchema.safeParse(claimsResult.data.claims);
  if (!claims.success) throw new UnauthenticatedError();

  const authUser = await client.auth.getUser();
  if (authUser.error || !authUser.data.user || authUser.data.user.id !== claims.data.sub) {
    throw new UnauthenticatedError();
  }
  const demiUser = await getPrisma().user.findUnique({
    where: { authSubject: authUser.data.user.id },
    select: { id: true },
  });
  if (!demiUser) throw new ForbiddenError();
  return { userId: demiUser.id, sessionHash: hashLineSessionId(claims.data.session_id) };
}

export function lineSessionHashMatches(expectedHash: string, currentHash: string): boolean {
  return timingSafeHashMatch(expectedHash, currentHash);
}
