import { handleLineWorkflowInteractionRequest } from "@/modules/line/transport/workflow-scoped-interactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fixed scoped cancellation request (a request, never direct cancellation); POST only. Staged and disabled by default. */
export async function POST(request: Request): Promise<Response> {
  return handleLineWorkflowInteractionRequest(request, "CANCELLATION_REQUEST");
}
