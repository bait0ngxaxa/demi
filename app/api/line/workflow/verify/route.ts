import { handleLineWorkflowVerifyRequest } from "@/modules/line/transport/workflow-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-issuing in Phase B1; see workflow-http activation fence. Other methods receive 405. */
export async function POST(request: Request): Promise<Response> {
  return handleLineWorkflowVerifyRequest(request);
}
