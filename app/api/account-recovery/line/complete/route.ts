import { isRecoveryLineEnabled } from "@/lib/env/server";
import { completeLinePasswordRecoveryWithIdentityToken } from "@/modules/line/services/line-password-recovery-service";
import { readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const input = await readAccountJson(request);
    await completeLinePasswordRecoveryWithIdentityToken(input, { enabled: isRecoveryLineEnabled() });
    return Response.json({ status: "COMPLETED" }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ status: "ERROR" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
}
