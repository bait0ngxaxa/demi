import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSupabaseSession } from "@/lib/auth/supabase-proxy";
import { getApplicationPublicOrigin } from "@/lib/env/server";
import { getLineQuickActionReturnPathFromUrl } from "@/modules/line/domain/line-navigation-intents";
import { classifyLineWorkflowRequest, type LineWorkflowRouteDecision } from "@/modules/line/domain/line-workflow-routes";

const lineWorkflowRejectionStatus: Record<Exclude<LineWorkflowRouteDecision, "PASS">, number> = {
  METHOD_NOT_ALLOWED: 405,
  HANDLER_METHOD_NOT_ALLOWED: 405,
  REJECTED: 400,
  NOT_FOUND: 404,
};

const lineWorkflowAllow: Partial<Record<LineWorkflowRouteDecision, string>> = {
  METHOD_NOT_ALLOWED: "GET, HEAD",
  HANDLER_METHOD_NOT_ALLOWED: "POST",
};

function isLineWorkflowPath(pathname: string): boolean {
  return pathname === "/line/workflow" || pathname.startsWith("/line/workflow/") ||
    pathname === "/api/line/workflow" || pathname.startsWith("/api/line/workflow/");
}

function secureLineWorkflowResponse(response: NextResponse, pathname: string): NextResponse {
  if (!isLineWorkflowPath(pathname)) return response;
  response.headers.set("cache-control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("expires", "0");
  response.headers.set("pragma", "no-cache");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("content-security-policy", "frame-ancestors 'none'");
  return response;
}

// ADR-0018: responses of these pages (including server action results) can carry a one-time activation link.
const ACTIVATION_LINK_PATHS = new Set(["/app/hospitals/network"]);

function secureActivationLinkResponse(response: NextResponse, pathname: string): NextResponse {
  if (!ACTIVATION_LINK_PATHS.has(pathname)) return response;
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

// Public health probes and these two loopback-only scheduler routes must not be canonicalized.
// scripts/scheduler-tick.mjs calls tick/readiness on 127.0.0.1; nginx blocks /api/internal/* publicly.
const HOST_LOCAL_WORKER_ROUTES = new Set([
  "GET /api/internal/scheduler/tick",
  "GET /api/internal/scheduler/readiness",
]);

function isHealthPath(pathname: string): boolean {
  return pathname.startsWith("/api/health");
}

function isStaticAssetPath(pathname: string): boolean {
  return pathname.startsWith("/_next/static/") || pathname === "/_next/image" || pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp)$/iu.test(pathname);
}

function redirectNonCanonicalHost(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const pathname = request.nextUrl.pathname;
  if (isHealthPath(pathname) || HOST_LOCAL_WORKER_ROUTES.has(`${request.method} ${pathname}`)) return null;

  const publicOrigin = getApplicationPublicOrigin();
  const publicHost = new URL(publicOrigin).host.toLowerCase();
  const requestHost = request.headers.get("host")?.toLowerCase();
  if (requestHost === publicHost) return null;

  const destination = new URL(`${pathname}${request.nextUrl.search}`, publicOrigin);
  return NextResponse.redirect(destination, 308);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isHealthPath(request.nextUrl.pathname)) return NextResponse.next();
  const canonicalRedirect = redirectNonCanonicalHost(request);
  if (canonicalRedirect) return canonicalRedirect;
  const lineWorkflowDecision = classifyLineWorkflowRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    serverAction: request.headers.has("next-action"),
  });
  if (lineWorkflowDecision && lineWorkflowDecision !== "PASS") {
    // Answered before session refresh and framework dispatch; no body, no detail.
    const allow = lineWorkflowAllow[lineWorkflowDecision];
    return secureLineWorkflowResponse(new NextResponse(null, {
      status: lineWorkflowRejectionStatus[lineWorkflowDecision],
      headers: {
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
        ...(allow ? { allow } : {}),
      },
    }), request.nextUrl.pathname);
  }
  if (isStaticAssetPath(request.nextUrl.pathname) && !isLineWorkflowPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const response = await updateSupabaseSession(
    request,
    getLineQuickActionReturnPathFromUrl(request.nextUrl),
  );
  return secureActivationLinkResponse(secureLineWorkflowResponse(response, request.nextUrl.pathname), request.nextUrl.pathname);
}

export const config = {
  matcher: ["/:path*"],
};
