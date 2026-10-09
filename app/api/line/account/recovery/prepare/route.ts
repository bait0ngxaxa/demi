import { z } from "zod";
import { prepareLineAccountRecovery } from "@/modules/line/services/line-disconnection-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { LineFailure } from "@/modules/line/domain/line-errors";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    if (!z.object({}).strict().safeParse(await readAccountJson(request)).success) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const configuration = await requireLineDisconnectionReadiness();
    if (!configuration) throw new LineFailure("LINE_CONFIGURATION_MISSING");
    return Response.json(await prepareLineAccountRecovery({ configuration }), { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) { return lineErrorResponse(error); }
}
