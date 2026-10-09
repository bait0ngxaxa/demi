import { LineAccountAction } from "@prisma/client";

import { createLineAccountIntent } from "@/modules/line/services/line-account-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { lineIntentRequestSchema } from "@/modules/line/schemas/line-schemas";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineIntentRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const action = parsed.data.action === "LINK" ? LineAccountAction.LINK : LineAccountAction.UNLINK;
    // Inventory/provider readiness cannot prevent an owner preparing local revocation.
    const configuration = action === LineAccountAction.UNLINK
      ? await requireLineDisconnectionReadiness().catch(() => null)
      : await requireLineDisconnectionReadiness();
    const intent = await createLineAccountIntent(action, { enforceRelinkPolicy: true, ...(configuration ? { authorizationInventory: configuration.inventory } : {}) });
    return Response.json(intent, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
