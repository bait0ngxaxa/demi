import { isRecoveryLineEnabled } from "@/lib/env/server";
import {
  completeLinePasswordRecoveryWithIdentityToken,
  LinePasswordRecoveryCompletionError,
  type LinePasswordRecoveryCompletionErrorCode,
} from "@/modules/line/services/line-password-recovery-service";
import { readAccountJson, requireSameOrigin } from "@/modules/line/transport/account-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicErrorCode(error: unknown, completionStarted: boolean): LinePasswordRecoveryCompletionErrorCode {
  if (error instanceof LinePasswordRecoveryCompletionError) return error.code;
  return completionStarted ? "OUTCOME_UNCERTAIN" : "LINK_UNAVAILABLE";
}

export async function POST(request: Request): Promise<Response> {
  let completionStarted = false;
  try {
    await requireSameOrigin(request);
    const input = await readAccountJson(request);
    const enabled = isRecoveryLineEnabled();
    completionStarted = true;
    await completeLinePasswordRecoveryWithIdentityToken(input, { enabled });
    return Response.json({ status: "COMPLETED" }, { headers: { "cache-control": "private, no-store" } });
  } catch (error: unknown) {
    return Response.json(
      { status: "ERROR", code: publicErrorCode(error, completionStarted) },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }
}
