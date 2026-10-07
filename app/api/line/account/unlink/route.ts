import { LineProviderCleanupState } from "@prisma/client";

import { lineUnlinkRequestSchema } from "@/modules/line/schemas/line-schemas";
import { unlinkLineAccount } from "@/modules/line/services/line-account-service";
import { scheduleLineBindingReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineUnlinkRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400 });
    const unlinked = await unlinkLineAccount(parsed.data);
    scheduleLineBindingReconciliation([unlinked.bindingId]);
    return Response.json(
      { status: unlinked.status, cleanup: LineProviderCleanupState.PENDING },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
