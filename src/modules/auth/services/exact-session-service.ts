import "server-only";

import { z } from "zod";
import { isAuthError } from "@supabase/supabase-js";
import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getServerEnv } from "@/lib/env/server";
import { getPrisma } from "@/lib/db/prisma";
import { ForbiddenError, InfrastructureError, UnauthenticatedError } from "@/shared/errors/application-error";

const claimsSchema = z.object({
  sub: z.string().uuid(), session_id: z.string().uuid(),
  iss: z.string(), aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number().int().positive(),
});

function denyProviderError(error: unknown): never {
  if (isAuthError(error) && (error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500)) {
    throw new InfrastructureError();
  }
  throw new UnauthenticatedError();
}

/** Auth-owned, uncached, same captured JWT signature + provider liveness check.
 * Capture is transport only: no cookie user/decoded payload is authorization.
 * Network work finishes before callers acquire database locks.
 */
export async function getLiveExactSession(): Promise<{ userId: string; sessionId: string; checkedAt: Date }> {
  const deadline = AbortSignal.timeout(10_000);
  try {
    const client = await getServerSupabaseClient({ requireWritableCookies: true, exactSessionDeadline: deadline });
    const captured = await client.auth.getSession();
    const jwt = captured.data.session?.access_token;
    if (captured.error) denyProviderError(captured.error);
    if (!jwt) throw new UnauthenticatedError();
    const result = await client.auth.getClaims(jwt);
    const claims = claimsSchema.safeParse(result.data?.claims);
    if (result.error) denyProviderError(result.error);
    if (!claims.success) throw new UnauthenticatedError();
    const expectedIssuer = `${getServerEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/u, "")}/auth/v1`;
    if (claims.data.iss !== expectedIssuer ||
        !(Array.isArray(claims.data.aud) ? claims.data.aud.includes("authenticated") : claims.data.aud === "authenticated") ||
        claims.data.exp * 1000 <= Date.now()) throw new UnauthenticatedError();
    const live = await client.auth.getUser(jwt);
    if (live.error) denyProviderError(live.error);
    if (deadline.aborted) throw new InfrastructureError();
    if (live.data.user?.id !== claims.data.sub || claims.data.exp * 1000 <= Date.now()) throw new UnauthenticatedError();
    const owner = await getPrisma().user.findUnique({ where: { authSubject: claims.data.sub }, select: { id: true, status: true } });
    if (owner?.status !== "ACTIVE") throw new ForbiddenError();
    return { userId: owner.id, sessionId: claims.data.session_id, checkedAt: new Date() };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError || error instanceof InfrastructureError) throw error;
    // No provider payload, token, or replacement JWT escapes this boundary.
    throw new InfrastructureError();
  }
}
