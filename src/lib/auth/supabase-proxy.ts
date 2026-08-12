import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseFactory } from "next/server";

import { getServerEnv } from "@/lib/env/server";

function createNextResponse(request: NextRequest): NextResponse {
  return NextResponseFactory.next({
    request: {
      headers: request.headers,
    },
  });
}

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function propagateSupabaseCookies(
  request: NextRequest,
  cookiesToSet: SupabaseCookieToSet[],
  headers: Record<string, string>,
): NextResponse {
  cookiesToSet.forEach(({ name, value }) => {
    request.cookies.set(name, value);
  });

  const response = createNextResponse(request);

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  let response = createNextResponse(request);

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        response = propagateSupabaseCookies(request, cookiesToSet, headers);
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
