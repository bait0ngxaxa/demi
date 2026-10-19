import { lineRecoveryRequestSchema } from "@/modules/line/schemas/line-schemas";
import { recoverLineAccount } from "@/modules/line/services/line-disconnection-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const input = lineRecoveryRequestSchema.safeParse(await readAccountJson(request));
    if (!input.success) return Response.json({ error: "กรุณาตรวจสอบแอปและยืนยันความเสี่ยงให้ครบ" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const inventory = await requireLineDisconnectionReadiness();
    return Response.json(await recoverLineAccount(input.data, { inventory }), { headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) { return lineErrorResponse(error); }
}
