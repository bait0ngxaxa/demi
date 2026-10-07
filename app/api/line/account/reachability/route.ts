import { lineReachabilityRequestSchema } from "@/modules/line/schemas/line-schemas";
import { getLineAccountSummary, refreshLineAccountReachability } from "@/modules/line/services/line-account-service";
import { scheduleLineBindingReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineReachabilityRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400 });
    const refreshed = await refreshLineAccountReachability(parsed.data);
    scheduleLineBindingReconciliation([refreshed.bindingId]);
    const summary = await getLineAccountSummary();
    return Response.json(summary, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
