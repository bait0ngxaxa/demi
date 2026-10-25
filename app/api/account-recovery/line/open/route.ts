import { isRecoveryLineEnabled } from "@/lib/env/server";
import { openLinePasswordRecovery } from "@/modules/line/services/line-password-recovery-service";
import { readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const result = await openLinePasswordRecovery(await readAccountJson(request), { enabled: isRecoveryLineEnabled() });
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ status: "EXPIRED" }, { headers: { "cache-control": "private, no-store" } });
  }
}
