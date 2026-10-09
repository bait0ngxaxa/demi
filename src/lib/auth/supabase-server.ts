import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env/server";

export type ServerSupabaseClientOptions = {
  requireWritableCookies?: boolean;
  /** Sensitive exact-session checks must not replace the captured session. */
  exactSessionDeadline?: AbortSignal;
};

export async function getServerSupabaseClient(
  clientOptions: ServerSupabaseClientOptions = {},
): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...(clientOptions.exactSessionDeadline ? { global: { fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      // getSession may otherwise refresh an expired/near-expiry cookie before capture.
      if (url.pathname.endsWith("/token")) return Response.json({ error: "invalid_grant", error_description: "Session verification required" }, { status: 401 });
      return fetch(input, { ...init, cache: "no-store", signal: clientOptions.exactSessionDeadline });
    } } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, cookieOptions);
          });
        } catch (error) {
          if (clientOptions.requireWritableCookies) {
            throw error;
          }

          // Cookie writes are unavailable in read-only server components.
        }
      },
    },
  });
}
