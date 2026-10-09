import { LineMenuSyncState } from "@prisma/client";

import { lineLinkRequestSchema } from "@/modules/line/schemas/line-schemas";
import { linkLineAccount } from "@/modules/line/services/line-account-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { scheduleLineBindingReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineLinkRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const configuration = await requireLineDisconnectionReadiness();
    const linked = await linkLineAccount(parsed.data, { enforceRelinkPolicy: true, ...(configuration ? { authorizationInventory: configuration.inventory } : {}) });
    scheduleLineBindingReconciliation([linked.bindingId]);
    return Response.json({
      status: linked.status,
      presentation: LineMenuSyncState.UNKNOWN,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
