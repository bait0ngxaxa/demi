import { isRecoveryLineEnabled } from "@/lib/env/server";
import { requestLinePasswordRecovery, LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE } from "@/modules/line/services/line-password-recovery-service";
import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";
import { readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "cache-control": "private, no-store" };

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSameOrigin(request);
    const input = await readAccountJson(request);
    const result = await requestLinePasswordRecovery(input, {
      enabled: isRecoveryLineEnabled(),
      clientIpAddress: trustedClientIpAddress(request.headers),
    });
    return Response.json(result, { headers: responseHeaders });
  } catch {
    return Response.json({ message: LINE_PASSWORD_RECOVERY_REQUEST_RESPONSE }, { headers: responseHeaders });
  }
}
