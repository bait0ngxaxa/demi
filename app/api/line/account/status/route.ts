import { lineReachabilityRequestSchema } from "@/modules/line/schemas/line-schemas";
import { checkOwnLineAccountStatus, LineAccountStatusRateLimited } from "@/modules/line/services/line-account-status-service";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Explicit one-shot check. Unlike scheduling via after(), await the existing
 * leased/fenced reconciler before reading persisted readiness. BUSY is not ready.
 * Ownership and LINE identity come only from the existing verified refresh.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineReachabilityRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const result = await checkOwnLineAccountStatus(parsed.data);
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof LineAccountStatusRateLimited) return Response.json({ error: error.message }, {
      status: 429,
      headers: { "cache-control": "private, no-store", "retry-after": String(error.retryAfter) },
    });
    return lineErrorResponse(error);
  }
}
