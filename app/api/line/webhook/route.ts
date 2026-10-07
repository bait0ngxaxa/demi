import { LineFailure } from "@/modules/line/domain/line-errors";
import { processLineWebhookRequest } from "@/modules/line/services/line-webhook-service";
import { scheduleLineBindingReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const result = await processLineWebhookRequest(request);
    if (result.bindingIds.length > 0) scheduleLineBindingReconciliation(result.bindingIds);
    return Response.json(
      { accepted: result.accepted, duplicates: result.duplicates, ignored: result.ignored },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    if (error instanceof LineFailure && error.code === "INVALID_LINE_IDENTITY") {
      return Response.json({ error: "Webhook validation failed" }, { status: 401 });
    }
    if (error instanceof LineFailure && error.message === "Request body is too large") {
      return Response.json({ error: "Request body is too large" }, { status: 413 });
    }
    if (error instanceof LineFailure) {
      return Response.json({ error: "Webhook could not be accepted" }, { status: 400 });
    }
    return Response.json({ error: "Webhook processing is temporarily unavailable" }, { status: 503 });
  }
}
