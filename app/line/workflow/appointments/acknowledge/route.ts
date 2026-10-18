import { handleLineWorkflowInteractionRequest } from "@/modules/line/transport/workflow-scoped-interactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fixed scoped acknowledgement; POST only (Proxy answers other methods with 405). Staged and disabled by default. */
export async function POST(request: Request): Promise<Response> {
  return handleLineWorkflowInteractionRequest(request, "ACKNOWLEDGE");
}
