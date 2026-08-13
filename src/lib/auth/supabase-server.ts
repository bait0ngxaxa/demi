import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env/server";

export type ServerSupabaseClientOptions = {
  requireWritableCookies?: boolean;
};

export async function getServerSupabaseClient(
  clientOptions: ServerSupabaseClientOptions = {},
): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
