import { LineMenuSyncState } from "@prisma/client";

import { lineLinkRequestSchema } from "@/modules/line/schemas/line-schemas";
import { LineCurrentPasswordAttemptThrottledError, linkLineAccount } from "@/modules/line/services/line-account-service";
import { requireLineDisconnectionReadiness } from "@/modules/line/services/line-disconnection-configuration";
import { scheduleLineBindingReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { lineErrorResponse, readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";
import { CurrentPasswordRejectedError } from "@/modules/account-security/adapters/supabase-account-security-provider";
import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const parsed = lineLinkRequestSchema.safeParse(await readAccountJson(request));
    if (!parsed.success) return Response.json({ error: "คำขอไม่ถูกต้อง กรุณาเริ่มใหม่" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const authorizationInventory = await requireLineDisconnectionReadiness();
    const linked = await linkLineAccount(parsed.data, {
      enforceRelinkPolicy: true,
      authorizationInventory,
      clientIpAddress: trustedClientIpAddress(request.headers),
    });
    scheduleLineBindingReconciliation([linked.bindingId]);
    return Response.json({
      status: linked.status,
      presentation: LineMenuSyncState.UNKNOWN,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordRejectedError) {
      return Response.json({ error: "การยืนยันรหัสผ่านไม่สำเร็จ", fieldErrors: { currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง" } }, { status: 401, headers: { "cache-control": "private, no-store" } });
    }
    if (error instanceof LineCurrentPasswordAttemptThrottledError) {
      return Response.json({ error: "การยืนยันรหัสผ่านไม่สำเร็จ", fieldErrors: { currentPassword: "พยายามตรวจสอบหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่" } }, { status: 429, headers: { "cache-control": "private, no-store" } });
    }
    return lineErrorResponse(error);
  }
}
