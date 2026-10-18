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

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const lineWorkflowDecision = classifyLineWorkflowRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    serverAction: request.headers.has("next-action"),
  });
  if (lineWorkflowDecision && lineWorkflowDecision !== "PASS") {
    // Answered before session refresh and framework dispatch; no body, no detail.
    const allow = lineWorkflowAllow[lineWorkflowDecision];
    return new NextResponse(null, {
      status: lineWorkflowRejectionStatus[lineWorkflowDecision],
      headers: {
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
        ...(allow ? { allow } : {}),
      },
    });
  }
  return updateSupabaseSession(
    request,
    getLineQuickActionReturnPathFromUrl(request.nextUrl),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // The MINI namespace is always filtered, including asset-like final segments.
    "/line/workflow/:path*",
    "/api/line/workflow/:path*",
  ],
};
