import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getLineQuickActionReturnPathFromUrl } from "@/modules/line/domain/line-navigation-intents";
import { classifyLineWorkflowRequest, type LineWorkflowRouteDecision } from "@/modules/line/domain/line-workflow-routes";
import { updateSupabaseSession } from "@/lib/auth/supabase-proxy";

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

// Probes must answer without a session refresh or valid auth configuration.
const HEALTH_PATHS = new Set(["/api/health", "/api/health/live"]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (HEALTH_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
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
  const response = await updateSupabaseSession(
    request,
    getLineQuickActionReturnPathFromUrl(request.nextUrl),
  );
  return secureLineWorkflowResponse(response, request.nextUrl.pathname);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // The MINI namespace is always filtered, including asset-like final segments.
    "/line/workflow/:path*",
    "/api/line/workflow/:path*",
  ],
};
