import type { NextRequest, NextResponse } from "next/server";

import { getLineQuickActionReturnPathFromUrl } from "@/modules/line/domain/line-navigation-intents";
import { updateSupabaseSession } from "@/lib/auth/supabase-proxy";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return updateSupabaseSession(
    request,
    getLineQuickActionReturnPathFromUrl(request.nextUrl),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
