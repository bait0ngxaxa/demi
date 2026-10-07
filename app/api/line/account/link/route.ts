import { LineMenuSyncState } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { lineLinkRequestSchema } from "@/modules/line/schemas/line-schemas";
import { linkLineAccount } from "@/modules/line/services/line-account-service";
import { reconcileLineBinding } from "@/modules/line/services/line-menu-reconciler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineLinkRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400 });
    const linked = await linkLineAccount(parsed.data);
    await reconcileLineBinding(linked.bindingId);
    const binding = await getPrisma().lineAccountBinding.findUnique({
      where: { id: linked.bindingId },
      select: { lifecycleVersion: true, menuSyncState: true },
    });
    const stillCurrent = binding?.lifecycleVersion === linked.lifecycleVersion;
    return Response.json({
      status: linked.status,
      presentation: stillCurrent ? binding.menuSyncState : LineMenuSyncState.UNKNOWN,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    return lineErrorResponse(error);
  }
}
