import { LineAccountAction } from "@prisma/client";

import { createLineAccountIntent } from "@/modules/line/services/line-account-service";
import { lineIntentRequestSchema } from "@/modules/line/schemas/line-schemas";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineIntentRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400 });
    const action = parsed.data.action === "LINK" ? LineAccountAction.LINK : LineAccountAction.UNLINK;
    const intent = await createLineAccountIntent(action);
    return Response.json(intent, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
