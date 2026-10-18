import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseFactory } from "next/server";

import { getServerEnv } from "@/lib/env/server";
import {
  LINE_QUICK_ACTION_RETURN_TO_HEADER,
  type LineQuickActionReturnPath,
} from "@/modules/line/domain/line-navigation-intents";

function createNextResponse(
  request: NextRequest,
  lineQuickActionReturnTo: LineQuickActionReturnPath | null,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(LINE_QUICK_ACTION_RETURN_TO_HEADER);
  if (lineQuickActionReturnTo) {
    requestHeaders.set(LINE_QUICK_ACTION_RETURN_TO_HEADER, lineQuickActionReturnTo);
  }

  const response = NextResponseFactory.next({
    request: {
      headers: requestHeaders,
    },
  });
  if (request.nextUrl.pathname === "/line/account" || request.nextUrl.pathname.startsWith("/api/line/account/")) {
    response.headers.set("cache-control", "private, no-store");
  }
  const { pathname } = request.nextUrl;
  if (pathname === "/line/workflow" || pathname.startsWith("/line/workflow/") || pathname.startsWith("/api/line/workflow/")) {
    // MINI primary redirects can carry platform credentials; never cache or leak them as referrer.
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("content-security-policy", "frame-ancestors 'none'");
  }
  return response;
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
  lineQuickActionReturnTo: LineQuickActionReturnPath | null = null,
): NextResponse {
  cookiesToSet.forEach(({ name, value }) => {
    request.cookies.set(name, value);
  });

  const response = createNextResponse(request, lineQuickActionReturnTo);

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export async function updateSupabaseSession(
  request: NextRequest,
  lineQuickActionReturnTo: LineQuickActionReturnPath | null = null,
): Promise<NextResponse> {
  // Recovery owns capture/verification. A proxy refresh must not replace a
  // rejected or expired JWT before the exact-session authorization attempt.
  if (["/api/line/account/recovery", "/api/line/account/recovery/prepare"].includes(request.nextUrl.pathname)) {
    return createNextResponse(request, null);
  }
  const env = getServerEnv();
  let response = createNextResponse(request, lineQuickActionReturnTo);

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        response = propagateSupabaseCookies(
          request,
          cookiesToSet,
          headers,
          lineQuickActionReturnTo,
        );
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
