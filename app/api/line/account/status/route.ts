import { lineReachabilityRequestSchema } from "@/modules/line/schemas/line-schemas";
import { getLineAccountSummary, refreshLineAccountReachability } from "@/modules/line/services/line-account-service";
import { reconcileLineBinding } from "@/modules/line/services/line-menu-reconciler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit one-shot check. Unlike scheduling via after(), await the existing
 * leased/fenced reconciler before reading persisted readiness. BUSY is not ready.
 * Ownership and LINE identity come only from the existing verified refresh.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineReachabilityRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400 });
    const refreshed = await refreshLineAccountReachability(parsed.data);
    const outcome = await reconcileLineBinding(refreshed.bindingId);
    const summary = await getLineAccountSummary();
    return Response.json({ ...summary, reconciliation: outcome === "RECONCILED" ? "CHECKED" : "PENDING" }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
